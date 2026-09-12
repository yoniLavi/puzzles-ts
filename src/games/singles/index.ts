/**
 * Singles (Hitori) — native TS port of `singles.c`. A grid of numbers in
 * which you blacken cells so that no number repeats among the remaining
 * (white) cells of any row or column, no two black cells are orthogonally
 * adjacent, and the white cells form one connected region. Left-click /
 * select toggles a cell black; right-click / select2 toggles a white mark
 * (circle); clicking a marked cell clears it. A click outside the grid
 * toggles the "show numbers on black squares" preference. Rule violations
 * are highlighted live; Check & Save additionally flags cells that
 * contradict the unique solution.
 */

import { assertNever, rejectMove } from "../../engine/assert-never.ts";
import type { DifficultyContract } from "../../engine/difficulty.ts";
import { winFlash } from "../../engine/flash.ts";
import {
  type Game,
  type HintResult,
  type HintStep,
  type HintTrackVerdict,
  type SolveResult,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import { fromCoord as fromCoordE } from "../../engine/geometry.ts";
import { commonHintRefusal, DEDUCTION_EXHAUSTED } from "../../engine/hint-refusal.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  cursorDelta,
  isCursorMove,
  LEFT_BUTTON,
  MIDDLE_BUTTON,
  newCursor,
  RIGHT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import type { Point } from "../../engine/types.ts";
import { newSinglesDesc } from "./generator.ts";
import { say } from "./hint-text.ts";
import {
  border,
  colors,
  computeSize,
  FLASH_TIME,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  type SinglesDrawState,
  setTileSize,
} from "./render.ts";
import {
  CC_MARK_ERRORS,
  checkComplete,
  deduceHintPlan,
  type HintRecord,
  inGrid,
  OP_BLACK,
  type SinglesReason,
  solveSpecific,
} from "./solver.ts";
import {
  type CellValue,
  cloneState,
  DIFF_ANY,
  decodeParams,
  defaultParams,
  diffFromLevel,
  diffName,
  diffToLevel,
  encodeParams,
  F_BLACK,
  F_CIRCLE,
  makeState,
  newState,
  paramConfig,
  type SinglesMove,
  type SinglesParams,
  type SinglesState,
  type SinglesUi,
  status,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

/** A cell whose mark contradicts the unique solution (Check & Save). */
export type SinglesMistake = Point;

const PRESET_SIZES = [5, 6, 8, 10, 12];

function presets(): {
  title: string;
  submenu: { title: string; params: SinglesParams }[];
} {
  const submenu: { title: string; params: SinglesParams }[] = [];
  for (const d of PRESET_SIZES) {
    for (const diff of ["easy", "tricky"] as const) {
      submenu.push({
        title: `${d}x${d} ${diffName(diff)}`,
        params: { w: d, h: d, diff },
      });
    }
  }
  return { title: "Singles", submenu };
}

function newUi(_state: SinglesState): SinglesUi {
  return { cursor: newCursor(), showBlackNums: false };
}

function changedState(
  ui: SinglesUi,
  oldState: SinglesState | null,
  newSt: SinglesState,
): void {
  if (oldState && !oldState.completed && newSt.completed) ui.cursor.visible = false;
}

function interpretMove(
  state: SinglesState,
  ui: SinglesUi,
  ds: SinglesDrawState,
  p: Point,
  rawButton: number,
): SinglesMove | null | UiUpdate {
  const button = stripModifiers(rawButton);
  const { w, h } = state;

  // Cursor movement: wraps toroidally; first press only reveals the cursor.
  if (isCursorMove(button)) {
    const delta = cursorDelta(button);
    if (!delta) return null;
    const ox = ui.cursor.x;
    const oy = ui.cursor.y;
    ui.cursor.x = (((ui.cursor.x + delta.dx) % w) + w) % w;
    ui.cursor.y = (((ui.cursor.y + delta.dy) % h) + h) % h;
    if (!ui.cursor.visible) {
      ui.cursor.visible = true;
      return UI_UPDATE;
    }
    return ui.cursor.x !== ox || ui.cursor.y !== oy ? UI_UPDATE : null;
  }

  let x: number;
  let y: number;
  let action: "none" | "black" | "circle" | "ui" = "none";

  if (button === CURSOR_SELECT || button === CURSOR_SELECT2) {
    x = ui.cursor.x;
    y = ui.cursor.y;
    if (!ui.cursor.visible) ui.cursor.visible = true;
    action = button === CURSOR_SELECT ? "black" : "circle";
  } else if (
    button === LEFT_BUTTON ||
    button === MIDDLE_BUTTON ||
    button === RIGHT_BUTTON
  ) {
    const ts = ds.tileSize;
    const b = border(ts);
    const fromCoord = (v: number): number => fromCoordE(v, ts, b);
    x = fromCoord(p.x);
    y = fromCoord(p.y);
    if (ui.cursor.visible) {
      ui.cursor.visible = false;
      action = "ui";
    }
    if (!inGrid(state, x, y)) {
      ui.showBlackNums = !ui.showBlackNums;
      action = "ui";
    } else if (button === LEFT_BUTTON) {
      action = "black";
    } else if (button === RIGHT_BUTTON) {
      action = "circle";
    }
  } else {
    return null;
  }

  if (action === "ui") return UI_UPDATE;
  if (action === "black" || action === "circle") {
    const i = y * w + x;
    let value: CellValue;
    if (state.flags[i] & (F_BLACK | F_CIRCLE)) value = "empty";
    else value = action === "black" ? "black" : "circle";
    return { sets: [{ x, y, value }] };
  }
  return null;
}

function executeMove(state: SinglesState, move: SinglesMove): SinglesState {
  // A move is a list of cell settings, not a union, so there is no discriminant
  // to narrow to `never`: check the one field the dispatch reads.
  if (!Array.isArray(move.sets)) rejectMove(move, "singles: executeMove");

  const next = cloneState(state);
  for (const { x, y, value } of move.sets) {
    if (!inGrid(next, x, y)) throw new Error("singles move out of bounds");
    const i = y * next.w + x;
    next.flags[i] &= ~(F_BLACK | F_CIRCLE);
    // `value` *is* a union, so an unrecognized one is rejected rather than
    // read as "empty".
    if (value === "black") next.flags[i] |= F_BLACK;
    else if (value === "circle") next.flags[i] |= F_CIRCLE;
    else if (value !== "empty") assertNever(value, `singles: executeMove (${x},${y})`);
  }
  if (move.solve) next.cheated = true;
  if (checkComplete(next, CC_MARK_ERRORS)) next.completed = true;
  return next;
}

/** The B/C/E diff between two states (upstream game_state_diff). */
function diffMove(src: SinglesState, dst: SinglesState): SinglesMove {
  const sets: SinglesMove["sets"] = [];
  for (let x = 0; x < dst.w; x++) {
    for (let y = 0; y < dst.h; y++) {
      const i = y * dst.w + x;
      const sm = src.flags[i] & (F_BLACK | F_CIRCLE);
      const dm = dst.flags[i] & (F_BLACK | F_CIRCLE);
      if (sm !== dm) {
        const value: CellValue =
          dm & F_BLACK ? "black" : dm & F_CIRCLE ? "circle" : "empty";
        sets.push({ x, y, value });
      }
    }
  }
  return { sets, solve: true };
}

function solve(orig: SinglesState, curr: SinglesState): SolveResult<SinglesMove> {
  let solved = cloneState(curr);
  if (solveSpecific(solved, DIFF_ANY, false) > 0) {
    return { ok: true, move: diffMove(curr, solved) };
  }
  solved = cloneState(orig);
  if (solveSpecific(solved, DIFF_ANY, false) > 0) {
    return { ok: true, move: diffMove(curr, solved) };
  }
  return { ok: false, error: "Unable to solve puzzle." };
}

function findMistakes(state: SinglesState): readonly SinglesMistake[] {
  const solved = makeState(state.w, state.h, state.nums);
  if (solveSpecific(solved, DIFF_ANY, false) <= 0) return [];
  const out: SinglesMistake[] = [];
  for (let i = 0; i < state.n; i++) {
    const pv = state.flags[i] & (F_BLACK | F_CIRCLE);
    if (!pv) continue; // undecided cells are never mistakes
    const sv = solved.flags[i] & (F_BLACK | F_CIRCLE);
    if (pv !== sv) out.push({ x: i % state.w, y: (i / state.w) | 0 });
  }
  return out;
}

// --- hint ------------------------------------------------------------------

/** Highlight data for a Singles hint step. `targets` are the cell(s) the
 * displayed deduction forces, each with the mark it forces; a firing that
 * forces several cells at once carries them all. `evidence` are the
 * deduction's premise cells — `redraw` outlines an undecided one and rings a
 * decided black/circle cell whose state *is* the reason. `strand` is the
 * distinct corner cell a 2×2-corner deduction is protecting from being
 * sealed off — drawn in its own color so the player can tell the corner
 * at risk apart from the matching numbers that share a value. */
export interface SinglesHint {
  targets: { x: number; y: number; value: "black" | "circle" }[];
  evidence: Point[];
  strand: Point[];
}

const opValue = (op: number): "black" | "circle" =>
  op === OP_BLACK ? "black" : "circle";

const sameCell = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;

/** Narrate *why* the grouped firing forces its cell(s), reading each number the
 * sentence names off the board. The words are [`hint-text.ts`](./hint-text.ts)'s. */
function narrate(reason: SinglesReason, targets: Point[], state: SinglesState): string {
  const numAt = (c: Point): number => state.nums[c.y * state.w + c.x];
  switch (reason.kind) {
    case "sandwich":
      return say.sandwich(numAt(reason.ends[0]), numAt(targets[0]));
    case "pair":
      return say.pair(numAt(reason.pair[0]));
    case "corner4":
      return say.corner4(numAt(reason.block[0]));
    case "corner3": {
      // Branch A shades the corner itself; branch B the inner cell, to save
      // the (separately highlighted) corner.
      const m = numAt(reason.matched[1]);
      const t = numAt(targets[0]);
      return targets.some((tg) => sameCell(tg, reason.corner))
        ? say.corner3Corner(t, m)
        : say.corner3Inner(t, m, numAt(reason.corner));
    }
    case "corner2":
      return say.corner2(
        numAt(reason.pair[0]),
        numAt(reason.corner),
        numAt(targets[0]),
      );
    case "offset":
      // quad = [A1, B1, A2, B2]: the A-pair shares one line, the B-pair the next.
      return say.offset(
        numAt(reason.quad[0]),
        numAt(reason.quad[1]),
        reason.quad[0].x === reason.quad[2].x ? "column" : "row",
      );
    case "adjBlack":
      return say.adjBlack(targets.map((t) => numAt(t)));
    case "sameLine":
      return say.sameLine(numAt(targets[0]), targets.length > 1);
    case "boxedIn":
      return say.boxedIn(numAt(targets[0]));
    case "split":
      return say.split(numAt(targets[0]));
  }
}

/** The premise cells a reason reasons over (its visible evidence — the
 * cells that share a number, or the decided cell whose state is the
 * reason). The `strand` corner, when present, is surfaced separately. */
function evidenceOf(reason: SinglesReason): Point[] {
  switch (reason.kind) {
    case "sandwich":
      return reason.ends;
    case "pair":
      return reason.pair;
    case "corner4":
      return reason.block;
    case "corner3":
      return reason.matched;
    case "corner2":
      return reason.pair;
    case "offset":
      return reason.quad;
    case "adjBlack":
      return [reason.black];
    case "sameLine":
      return [reason.circled];
    case "boxedIn":
      return [reason.cell];
    case "split":
      return reason.neighbors;
  }
}

/** The corner cell a 2×2-corner deduction is protecting (drawn in the
 * distinct strand color), if any. */
function strandOf(reason: SinglesReason): Point[] {
  return reason.kind === "corner2" || reason.kind === "corner3" ? [reason.corner] : [];
}

/** Group the ordered records by firing (`group`) into one step each. A
 * firing's records are contiguous, so first-seen order keeps the plan's. */
function groupRecords(records: HintRecord[]): HintRecord[][] {
  const groups = new Map<number, HintRecord[]>();
  for (const r of records) {
    const g = groups.get(r.group);
    if (g) g.push(r);
    else groups.set(r.group, [r]);
  }
  return [...groups.values()];
}

function hint(state: SinglesState): HintResult<SinglesMove, SinglesHint> {
  const refusal = commonHintRefusal(state.completed, findMistakes(state).length);
  if (refusal) return refusal;
  const records = deduceHintPlan(state);
  if (records.length === 0) {
    return { ok: false, error: DEDUCTION_EXHAUSTED };
  }
  const key = (c: Point): number => c.y * state.w + c.x;
  const steps: HintStep<SinglesMove, SinglesHint>[] = groupRecords(records).map(
    (group) => {
      const reason = group[0].reason;
      const targets = group.map((r) => ({ x: r.x, y: r.y, value: opValue(r.op) }));
      const targetKey = new Set(targets.map(key));
      // The protected corner is drawn in its own color; keep it out of
      // both the targets and the matching-number evidence.
      const strand = strandOf(reason).filter((c) => !targetKey.has(key(c)));
      const strandKey = new Set(strand.map(key));
      const evidence = evidenceOf(reason).filter(
        (c) => !targetKey.has(key(c)) && !strandKey.has(key(c)),
      );
      return {
        move: { sets: targets.map((t) => ({ ...t })) },
        explanation: narrate(reason, targets, state),
        highlights: { targets, evidence, strand },
      };
    },
  );
  return { ok: true, steps };
}

/** A move completes a step when it sets every target cell to its hinted
 * value; a move filling a strict subset of a multi-cell step (and nothing
 * else) is `"onTrack"`, shrinking the step in place to what remains. */
function hintKeepTrack(
  m: SinglesMove,
  step: HintStep<SinglesMove, SinglesHint>,
  state: SinglesState,
): HintTrackVerdict {
  const hl = step.highlights;
  if (m.solve || !hl || hl.targets.length === 0) return "off";
  const key = (c: Point): number => c.y * state.w + c.x;
  const want = new Map<number, CellValue>(hl.targets.map((t) => [key(t), t.value]));
  for (const s of m.sets) {
    if (want.get(key(s)) !== s.value) return "off";
  }
  if (m.sets.length === 0) return "off";
  if (m.sets.length === want.size) return "completed";

  // Strict subset of a multi-cell step: keep it displayed, shrunk to the
  // cells still outstanding (permitted on "onTrack").
  const done = new Set(m.sets.map(key));
  const remaining = hl.targets.filter((t) => !done.has(key(t)));
  step.move = { sets: remaining.map((t) => ({ ...t })) };
  step.highlights = { ...hl, targets: remaining };
  return "onTrack";
}

/** Singles' difficulty contract (`engine/difficulty.ts`). `solveSpecific`
 * returns > 0 when it solves; `newState` builds the board from the desc
 * alone, so no player mark reaches the verdict. `sneaky` is off — that is a
 * generator-side pre-pass, not a tier. */
const difficulty: DifficultyContract<SinglesParams> = {
  tierOf: (p) => diffToLevel(p.diff),
  withTier: (p, tier) => ({ ...p, diff: diffFromLevel(tier) }),
  solveAtCap: (p, desc, cap) =>
    solveSpecific(newState(p, desc), cap, false) > 0 ? "solved" : "unsolved",
};

export const singlesGame: Game<
  SinglesParams,
  SinglesState,
  SinglesMove,
  SinglesUi,
  SinglesDrawState,
  SinglesMistake
> = {
  id: "singles",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  paramConfig,
  // Keys match the `singles` template in `puzzle/augmentation.ts`: width and
  // height come from the worker adapter's w/h base, `difficulty` is the
  // zero-based tier index.
  describeParams: (p) => ({ difficulty: diffToLevel(p.diff) }),

  newDesc: newSinglesDesc,
  validateDesc,
  newState,
  newUi,
  changedState,

  interpretMove,
  executeMove,
  status,

  solve,
  difficulty,
  hint,
  hintKeepTrack,
  findMistakes,

  textFormat,

  prefs: [
    {
      kw: "show-black-nums",
      name: "Show numbers on black squares",
      type: "boolean",
      get: (ui) => ui.showBlackNums,
      set: (ui, v) => {
        ui.showBlackNums = v;
      },
    },
  ],

  colors,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize,
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength: (from, to) => winFlash(from, to, FLASH_TIME),
};

registerGame(singlesGame);
