/**
 * Unequal — native TS port of `unequal.c`. Fill an `order × order` grid so every
 * row and column holds each number `1..order` once, subject to clues between
 * adjacent cells: greater-than signs (Unequal mode) or differ-by-1 bars
 * (Adjacent mode). Left-click / cursor select highlights a cell for a real
 * entry; right-click / select2 toggles pencil mode; a digit enters (or
 * pencil-toggles) that number; clicking a clue sign in the gap between two cells
 * greys it out ("spent"). Rule violations highlight live; Check & Save
 * additionally flags cells that contradict the unique solution.
 */

import type {
  Colour,
  ConfigValues,
  GameStatus,
  Point,
  Size,
} from "../../../puzzle/types.ts";
import {
  anyEmptyLacksNotes,
  firstUnreflectedPlaceIndex,
  joinNums,
  keepCandidateHintTrack,
  nakedSingle,
  nextPlace,
  refreshCandidateHintStep,
} from "../../engine/candidate-hint.ts";
import {
  type Game,
  type HintResult,
  type HintStep,
  type HintTrackVerdict,
  type PresetMenu,
  type SolveResult,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import { hiddenSingleLine, singlePlacementReason } from "../../engine/latin-hint.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_UP,
  isCursorMove,
  LEFT_BUTTON,
  MOD_CTRL,
  MOD_SHFT,
  RIGHT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import { stepBudget } from "../../engine/step-budget.ts";
import type { RandomState } from "../../random/index.ts";
import { newUnequalDesc } from "./generator.ts";
import {
  colours,
  computeSize,
  coord,
  FLASH_TIME,
  fromCoord,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  setTileSize,
  type UnequalDrawState,
  type UnequalHint,
} from "./render.ts";
import {
  DIFF_AMBIGUOUS,
  DIFF_IMPOSSIBLE,
  type HintOp,
  type HintReason,
  recordUnequalDeductions,
  solveUnequal,
} from "./solver.ts";
import {
  ADJTHAN,
  adjToSpent,
  c2n,
  checkComplete,
  cloneState,
  DIFF_EXTREME,
  DIFF_RECURSIVE,
  decodeParams,
  defaultParams,
  diffName,
  diffToLevel,
  encodeParams,
  F_ADJ_DOWN,
  F_ADJ_LEFT,
  F_ADJ_RIGHT,
  F_ADJ_UP,
  F_SPENT_DOWN,
  F_SPENT_LEFT,
  F_SPENT_RIGHT,
  F_SPENT_UP,
  newState,
  newUi,
  PRESETS,
  status,
  textFormat,
  type UnequalMove,
  type UnequalParams,
  type UnequalState,
  type UnequalUi,
  validateDesc,
  validateParams,
} from "./state.ts";

/** A player marking that contradicts the unique solution:
 * - `"cell"` — a filled-in number that is wrong;
 * - `"note"` — an empty cell whose non-empty pencil notes have crossed out the
 *   cell's solution value. */
export interface UnequalMistake {
  kind: "cell" | "note";
  x: number;
  y: number;
}

function presets(): PresetMenu<UnequalParams> {
  return {
    title: "Unequal",
    submenu: PRESETS.map((p) => ({
      title: `${p.mode === "adjacent" ? "Adjacent" : "Unequal"}: ${p.order}x${p.order} ${diffName(p.diff)}`,
      params: p,
    })),
  };
}

function inGrid(o: number, x: number, y: number): boolean {
  return x >= 0 && x < o && y >= 0 && y < o;
}

/** Move the keyboard cursor (clamped); reveal it on first press. */
function moveCursor(button: number, ui: UnequalUi, o: number): UiUpdate | null {
  const ox = ui.hx;
  const oy = ui.hy;
  if (button === CURSOR_UP) ui.hy = Math.max(ui.hy - 1, 0);
  else if (button === CURSOR_DOWN) ui.hy = Math.min(ui.hy + 1, o - 1);
  else if (button === CURSOR_LEFT) ui.hx = Math.max(ui.hx - 1, 0);
  else if (button === CURSOR_RIGHT) ui.hx = Math.min(ui.hx + 1, o - 1);
  if (!ui.hshow) {
    ui.hshow = true;
    return UI_UPDATE;
  }
  return ui.hx !== ox || ui.hy !== oy ? UI_UPDATE : null;
}

function interpretMove(
  state: UnequalState,
  ui: UnequalUi,
  ds: UnequalDrawState | null,
  p: Point,
  rawButton: number,
): UnequalMove | null | UiUpdate {
  const o = state.order;
  const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
  const shiftOrCtrl = (rawButton & (MOD_SHFT | MOD_CTRL)) !== 0;
  const button = stripModifiers(rawButton);

  const tx = fromCoord(p.x, ts);
  const ty = fromCoord(p.y, ts);

  if (inGrid(o, tx, ty) && (button === LEFT_BUTTON || button === RIGHT_BUTTON)) {
    // A click in the gap below/right of a cell toggles that clue's spent flag.
    const gapBelow = p.y - coord(ty, ts) > ts;
    const gapRight = p.x - coord(tx, ts) > ts;
    if (gapBelow && gapRight) return null;
    if (gapBelow) {
      if (state.clueFlags[ty * o + tx] & F_ADJ_DOWN)
        return { type: "spent", x: tx, y: ty, flag: F_SPENT_DOWN };
      if (ty + 1 < o && state.clueFlags[(ty + 1) * o + tx] & F_ADJ_UP)
        return { type: "spent", x: tx, y: ty + 1, flag: F_SPENT_UP };
      return null;
    }
    if (gapRight) {
      if (state.clueFlags[ty * o + tx] & F_ADJ_RIGHT)
        return { type: "spent", x: tx, y: ty, flag: F_SPENT_RIGHT };
      if (tx + 1 < o && state.clueFlags[ty * o + tx + 1] & F_ADJ_LEFT)
        return { type: "spent", x: tx + 1, y: ty, flag: F_SPENT_LEFT };
      return null;
    }

    if (button === LEFT_BUTTON) {
      // Sticky pencil: a left-click keeps the current mode (only moves the
      // highlight); non-sticky reverts to real entry (upstream).
      if (
        tx === ui.hx &&
        ty === ui.hy &&
        ui.hshow &&
        (ui.pencilSticky || !ui.hpencil)
      ) {
        ui.hshow = false;
      } else {
        ui.hx = tx;
        ui.hy = ty;
        ui.hshow = !state.immutable[ty * o + tx];
        if (!ui.pencilSticky) ui.hpencil = false;
      }
      ui.hcursor = false;
      return UI_UPDATE;
    }
    // RIGHT_BUTTON
    if (ui.pencilSticky) {
      ui.hpencil = !ui.hpencil;
      if (state.grid[ty * o + tx] === 0) {
        ui.hx = tx;
        ui.hy = ty;
        ui.hshow = true;
      }
    } else if (state.grid[ty * o + tx] === 0) {
      if (tx === ui.hx && ty === ui.hy && ui.hshow && ui.hpencil) ui.hshow = false;
      else {
        ui.hpencil = true;
        ui.hx = tx;
        ui.hy = ty;
        ui.hshow = true;
      }
    } else {
      ui.hshow = false;
    }
    ui.hcursor = false;
    return UI_UPDATE;
  }

  if (isCursorMove(button)) {
    if (shiftOrCtrl) {
      // Toggle the spent state of the clue between the cursor cell and the cell
      // the arrow points to.
      let nx = ui.hx;
      let ny = ui.hy;
      if (button === CURSOR_LEFT) nx = Math.max(nx - 1, 0);
      else if (button === CURSOR_RIGHT) nx = Math.min(nx + 1, o - 1);
      else if (button === CURSOR_UP) ny = Math.max(ny - 1, 0);
      else if (button === CURSOR_DOWN) ny = Math.min(ny + 1, o - 1);
      ui.hshow = true;
      ui.hcursor = true;

      let i = 0;
      for (; i < 4; i++) {
        if (nx === ui.hx + ADJTHAN[i].dx && ny === ui.hy + ADJTHAN[i].dy) break;
      }
      if (i === 4) return UI_UPDATE; // not a single step in a clue direction

      const here = state.clueFlags[ui.hy * o + ui.hx];
      const there = state.clueFlags[ny * o + nx];
      if (!(here & ADJTHAN[i].f || there & ADJTHAN[i].fo)) return UI_UPDATE; // no clue

      const self =
        state.mode === "adjacent"
          ? ADJTHAN[i].dx >= 0 && ADJTHAN[i].dy >= 0
          : (here & ADJTHAN[i].f) !== 0;
      return self
        ? { type: "spent", x: ui.hx, y: ui.hy, flag: adjToSpent(ADJTHAN[i].f) }
        : { type: "spent", x: nx, y: ny, flag: adjToSpent(ADJTHAN[i].fo) };
    }
    ui.hcursor = true;
    return moveCursor(button, ui, o);
  }

  if (ui.hshow && button === CURSOR_SELECT) {
    ui.hpencil = !ui.hpencil;
    ui.hcursor = true;
    return UI_UPDATE;
  }

  // 'M' / 'm' fill-all-pencil-marks.
  if (button === 77 || button === 109) return { type: "pencilAll" };

  const n = c2n(button, o);
  if (ui.hshow && n >= 0 && n <= o) {
    const i = ui.hy * o + ui.hx;
    if (state.immutable[i]) return null; // can't edit a given
    if (ui.hpencil && state.grid[i] > 0) return null; // can't pencil a filled cell

    // No-op: setting a cell to what it already holds (and no pencil marks).
    if ((!ui.hpencil || n === 0) && state.grid[i] === n && state.pencil[i] === 0) {
      if (!ui.hcursor) {
        ui.hshow = false;
        return UI_UPDATE;
      }
      return null;
    }

    const pencil = ui.hpencil && n > 0;
    if (!ui.hcursor && !(ui.hpencil && ui.pencilKeepHighlight)) ui.hshow = false;
    return pencil
      ? { type: "set", x: ui.hx, y: ui.hy, n, pencil }
      : { type: "set", x: ui.hx, y: ui.hy, n, pencil, autoElim: ui.autoPencil };
  }

  return null;
}

function executeMove(state: UnequalState, move: UnequalMove): UnequalState {
  const o = state.order;
  const next = cloneState(state);

  switch (move.type) {
    case "set": {
      const i = move.y * o + move.x;
      if (state.immutable[i]) throw new Error("unequal: move into an immutable cell");
      if (move.pencil && move.n > 0) {
        next.pencil[i] ^= 1 << move.n;
      } else {
        next.grid[i] = move.n;
        next.pencil[i] = 0;
        if (move.autoElim && move.n > 0) {
          const bit = ~(1 << move.n);
          for (let k = 0; k < o; k++) {
            if (k !== move.x) next.pencil[move.y * o + k] &= bit;
            if (k !== move.y) next.pencil[k * o + move.x] &= bit;
          }
        }
        if (!next.completed && checkComplete(next) > 0) next.completed = true;
      }
      return next;
    }
    case "spent": {
      next.spent[move.y * o + move.x] ^= move.flag;
      return next;
    }
    case "pencilAll": {
      const all = (1 << (o + 1)) - (1 << 1); // bits 1..o set
      for (let i = 0; i < o * o; i++) if (!next.grid[i]) next.pencil[i] = all;
      return next;
    }
    case "pencilStrike": {
      for (const { x, y, n } of move.marks) next.pencil[y * o + x] &= ~(1 << n);
      return next;
    }
    case "solve": {
      for (let i = 0; i < o * o; i++) {
        next.grid[i] = move.grid[i];
        next.pencil[i] = 0;
      }
      next.completed = true;
      next.cheated = true;
      return next;
    }
  }
}

function changedState(
  ui: UnequalUi,
  _old: UnequalState | null,
  newSt: UnequalState,
): void {
  const o = newSt.order;
  if (ui.hshow && ui.hpencil && !ui.hcursor && newSt.grid[ui.hy * o + ui.hx] !== 0) {
    ui.hshow = false;
  }
}

function solve(
  orig: UnequalState,
  _curr: UnequalState,
  aux?: string,
): SolveResult<UnequalMove> {
  const o = orig.order;
  if (aux) {
    const grid: number[] = [];
    for (let i = 0; i < o * o; i++) grid[i] = c2n(aux.charCodeAt(i + 1), o);
    return { ok: true, move: { type: "solve", grid } };
  }
  const soln = Uint8Array.from(orig.immutable);
  const ret = solveUnequal(o, orig.mode, orig.clueFlags, soln, DIFF_RECURSIVE);
  if (ret === DIFF_IMPOSSIBLE)
    return { ok: false, error: "No solution exists for this puzzle" };
  if (ret === DIFF_AMBIGUOUS)
    return { ok: false, error: "Multiple solutions exist for this puzzle" };
  return { ok: true, move: { type: "solve", grid: Array.from(soln, (v) => v) } };
}

function findMistakes(state: UnequalState): readonly UnequalMistake[] {
  const o = state.order;
  // The solution is derived from the placed givens only — never from the notes.
  const soln = Uint8Array.from(state.immutable);
  const ret = solveUnequal(o, state.mode, state.clueFlags, soln, DIFF_RECURSIVE);
  if (ret === DIFF_IMPOSSIBLE || ret === DIFF_AMBIGUOUS) return [];
  const out: UnequalMistake[] = [];
  for (let i = 0; i < o * o; i++) {
    if (state.immutable[i]) continue;
    if (state.grid[i]) {
      if (state.grid[i] !== soln[i])
        out.push({ kind: "cell", x: i % o, y: (i / o) | 0 });
    } else if (state.pencil[i] !== 0 && !(state.pencil[i] & (1 << soln[i]))) {
      out.push({ kind: "note", x: i % o, y: (i / o) | 0 });
    }
  }
  return out;
}

// --- hint ------------------------------------------------------------------

const POPULATE_TEXT =
  "Start by pencilling in every candidate number in each empty cell, so the eliminations that follow have something to cross out.";

/** Join a value list for narration: `[3]`→"3", `[1,2]`→"1 and 2",
 * `[1,2,3]`→"1, 2 and 3". */
/** Narrate *why* a firing is forced (hint-authoring §2): indication → reasoning →
 * necessity-voice conclusion. `ns` is the struck value list (a placement passes
 * its single height); `o` is the grid order. Two-mode aware; phrasing reads
 * correctly at the value extremes (§2.7 — the differ-by-1 clue says "one away from
 * N", never "N−1 or N+1"; a trivial inequality bound becomes "the smallest/largest
 * number" rather than the vacuous "no less than 1"). */
function narrate(reason: HintReason, ns: number[], o: number): string {
  switch (reason.kind) {
    case "greater":
      return reason.bound <= 1
        ? `The larger side of a greater-than sign can't hold the smallest number, so we must cross out ${joinNums(ns)}.`
        : `The cell across this greater-than sign can be no less than ${reason.bound}, so this cell must be larger still — we must cross out ${joinNums(ns)}.`;
    case "lesser":
      return reason.bound >= o
        ? `The smaller side of a greater-than sign can't hold the largest number, so we must cross out ${joinNums(ns)}.`
        : `The cell across this greater-than sign can be no more than ${reason.bound}, so this cell must be smaller still — we must cross out ${joinNums(ns)}.`;
    case "adjacent":
      return reason.bar
        ? `A bar joins this cell to the ${reason.v} beside it, so the two numbers must differ by exactly 1 — this cell can only be one away from ${reason.v}, so we must cross out ${joinNums(ns)}.`
        : `There's no bar between this cell and the ${reason.v} beside it, so their numbers can't differ by 1 — this cell can't sit one away from ${reason.v}, so we must cross out ${joinNums(ns)}.`;
    case "adjacentSet":
      return reason.bar
        ? `Whatever the cell beside it turns out to be, the bar forces this cell to a value one away from it — and no number still open there leaves room for ${joinNums(ns)} here, so we must cross out ${joinNums(ns)}.`
        : `With no bar to the cell beside it, this cell must avoid every value one step from it — and ${joinNums(ns)} would clash with a number still open there, so we must cross out ${joinNums(ns)}.`;
    case "single":
      return `Every other number has been ruled out in this cell, so it can only be ${ns[0]}.`;
    case "hiddenSingle":
      return `In this ${reason.line === "row" ? "row" : "column"}, ${reason.n} can go in only this cell — every other cell in the ${reason.line === "row" ? "row" : "column"} has ruled it out — so it must be ${reason.n}.`;
    case "forcedSingle":
      return `Working through this cell's row and column together, only ${reason.n} can still go here — so it must be ${reason.n}.`;
    case "dup":
      return `There's already a ${reason.n} in this row and column, so we must cross out the ${reason.n} from the other cells they pass through.`;
    case "set":
      return `Another group of cells already accounts for a fixed set of numbers that includes ${joinNums(ns)}, so we must cross out ${joinNums(ns)} here.`;
    case "forcing":
      return `Following a chain of two-candidate cells, placing ${ns[0]} here would force a contradiction further along — so we must cross out ${joinNums(ns)}.`;
  }
}

/** The deduction's evidence cells to shade `COL_HINT_CELL`: a clue deduction
 * names the acted-on cell *and* the cell across the sign/bar that constrains it,
 * so the player sees the pair; the generic Latin techniques have no clean local
 * area (the struck notes carry the premise). */
function reasonArea(
  reason: HintReason,
  target: { x: number; y: number },
): { x: number; y: number }[] {
  switch (reason.kind) {
    case "greater":
    case "lesser":
    case "adjacent":
    case "adjacentSet":
      return [target, { x: reason.ox, y: reason.oy }];
    default:
      return [];
  }
}

/** The next basic-Latin cleanup: the first filled cell whose value still appears
 * as a live pencil mark elsewhere in its row or column. Unequal boards carry a
 * few givens, which `pencilAll` doesn't account for (it fills *all* candidates),
 * so these row/column duplicates must be taught explicitly (hint-authoring §9.2,
 * the givens-bearing-Latin opening). Returns one firing — one placed value and
 * every stray copy of it in its line. */
function basicLatinStrike(
  wGrid: Int8Array,
  wPen: Int32Array,
  o: number,
): {
  px: number;
  py: number;
  n: number;
  marks: { x: number; y: number; n: number }[];
} | null {
  for (let i = 0; i < o * o; i++) {
    const v = wGrid[i];
    if (v === 0) continue;
    const px = i % o;
    const py = (i / o) | 0;
    const bit = 1 << v;
    const marks: { x: number; y: number; n: number }[] = [];
    for (let k = 0; k < o; k++) {
      if (k !== px && wGrid[py * o + k] === 0 && wPen[py * o + k] & bit)
        marks.push({ x: k, y: py, n: v });
      if (k !== py && wGrid[k * o + px] === 0 && wPen[k * o + px] & bit)
        marks.push({ x: px, y: k, n: v });
    }
    if (marks.length > 0) return { px, py, n: v, marks };
  }
  return null;
}

/** Index of the first recorded placement whose cell is *not yet* on the working
 * grid: every op before it is valid against the current working grid (placements
 * before it are already reflected), so a strike there can be surfaced now with a
 * premise the player's board supports. */
/** The next clue-deduction strike whose marks are still live, considering only
 * eliminations valid against the current grid. `dup` strikes are excluded (those
 * are placement bookkeeping). One returned strike groups the marks of a single
 * firing sharing the **same target cell** — so its narration (which names that
 * cell's relationship) matches the marks. A link's two ends (greater in one cell,
 * lesser in the other) come back across two calls and are linked as one journey
 * by the caller's `group` tracking. */
function nextClueStrike(
  ops: HintOp[],
  wGrid: Int8Array,
  wPen: Int32Array,
  o: number,
): {
  marks: { x: number; y: number; n: number }[];
  reason: HintReason;
  group: number;
} | null {
  const lim = firstUnreflectedPlaceIndex(ops, wGrid, o);
  const liveAt = (op: HintOp) =>
    op.kind === "elim" &&
    wGrid[op.y * o + op.x] === 0 &&
    (wPen[op.y * o + op.x] & (1 << op.n)) !== 0;
  let i = 0;
  while (i < lim) {
    const g = ops[i].group;
    const group: HintOp[] = [];
    while (i < lim && ops[i].group === g) group.push(ops[i++]);
    const live = group.filter((op) => liveAt(op) && op.reason.kind !== "dup");
    if (live.length === 0) continue;
    const first = live[0];
    const same = live.filter((op) => op.x === first.x && op.y === first.y);
    return {
      marks: same.map((op) => ({ x: op.x, y: op.y, n: op.n })),
      reason: first.reason,
      group: g,
    };
  }
  return null;
}

/** Emit a placement step and apply it to the working board, striking the placed
 * value from the rest of its row and column. With auto-pencil on (`autoClean`)
 * that cleanup is silent (the move's own `autoElim` does it on the real board);
 * with it off it becomes an explicit `pencilStrike` journey continuation. */
function emitPlacement(
  steps: HintStep<UnequalMove, UnequalHint>[],
  wGrid: Int8Array,
  wPen: Int32Array,
  o: number,
  x: number,
  y: number,
  n: number,
  reason: HintReason,
  autoClean: boolean,
): void {
  steps.push({
    move: { type: "set", x, y, n, pencil: false, autoElim: autoClean },
    explanation: narrate(reason, [n], o),
    highlights: {
      area:
        reason.kind === "hiddenSingle"
          ? hiddenSingleLine(reason.line, reason.index, o)
          : [],
      targets: [{ x, y }],
      marks: [],
    },
  });
  wGrid[y * o + x] = n;
  wPen[y * o + x] = 0;

  const dupMarks: { x: number; y: number; n: number }[] = [];
  for (let k = 0; k < o; k++) {
    if (k !== x && wPen[y * o + k] & (1 << n)) dupMarks.push({ x: k, y, n });
    if (k !== y && wPen[k * o + x] & (1 << n)) dupMarks.push({ x, y: k, n });
  }
  for (const m of dupMarks) wPen[m.y * o + m.x] &= ~(1 << n);

  if (!autoClean && dupMarks.length > 0) {
    steps.push({
      move: { type: "pencilStrike", marks: dupMarks },
      explanation: narrate({ kind: "dup", n, px: x, py: y }, [], o),
      highlights: {
        area: [],
        targets: dupMarks.map((m) => ({ x: m.x, y: m.y })),
        marks: dupMarks,
      },
      continuesPrevious: true,
    });
  }
}

/** Build the hint plan by walking a working copy the way a person solves it: a
 * naked single first; else (after a lazy populate) the basic-Latin row/column
 * cull a given/placed value forces; else the next clue elimination; else a forced
 * placement. `autoClean` (the auto-pencil preference) decides whether a
 * placement's trivial row/column eliminations are silent or taught. */
function buildSteps(
  state: UnequalState,
  autoClean: boolean,
): HintStep<UnequalMove, UnequalHint>[] {
  const o = state.order;
  const steps: HintStep<UnequalMove, UnequalHint>[] = [];
  const wGrid = Int8Array.from(state.grid);
  const wPen = Int32Array.from(state.pencil);
  const maxdiff = Math.min(diffToLevel(state.diff), DIFF_EXTREME);

  let populated = !anyEmptyLacksNotes(state.grid, state.pencil, o);
  const ensurePopulated = (): void => {
    if (populated) return;
    const all = (1 << (o + 1)) - (1 << 1);
    for (let i = 0; i < o * o; i++) if (!wGrid[i]) wPen[i] = all;
    steps.push({
      move: { type: "pencilAll" },
      explanation: POPULATE_TEXT,
      highlights: { area: [], targets: [], marks: [] },
    });
    populated = true;
  };

  let ops = recordUnequalDeductions(
    o,
    state.mode,
    state.clueFlags,
    Uint8Array.from(wGrid),
    maxdiff,
  );
  const budget = stepBudget("unequal hint plan");
  const cap = o * o * o * 4 + 4;
  // A counter for my own (non-recorded) basic-Latin firings, kept distinct from
  // the recording solver's `group` ids so journey linking never confuses them.
  let myGroup = -1000;
  // The firing whose strike the previous step emitted, so a same-firing strike of
  // a *different* cell (a link's other end) continues the journey.
  let lastStrikeGroup = Number.NaN;
  for (let guard = 0; guard < cap; guard++) {
    budget.tick();
    let filled = true;
    for (let i = 0; i < o * o; i++) if (!wGrid[i]) filled = false;
    if (filled) break;

    // 1. A naked single — the next move a human makes.
    const ns = nakedSingle(wGrid, wPen, o);
    if (ns) {
      emitPlacement(
        steps,
        wGrid,
        wPen,
        o,
        ns.x,
        ns.y,
        ns.n,
        { kind: "single" },
        autoClean,
      );
      ops = recordUnequalDeductions(
        o,
        state.mode,
        state.clueFlags,
        Uint8Array.from(wGrid),
        maxdiff,
      );
      lastStrikeGroup = Number.NaN;
      continue;
    }

    // 2. Pencil in the notes (once) before any elimination needs them.
    if (!populated) {
      ensurePopulated();
      lastStrikeGroup = Number.NaN;
      continue;
    }

    // 3. The basic-Latin cull a given/placed value forces in its row and column.
    const bs = basicLatinStrike(wGrid, wPen, o);
    if (bs) {
      myGroup--;
      steps.push({
        move: { type: "pencilStrike", marks: bs.marks },
        explanation: narrate({ kind: "dup", n: bs.n, px: bs.px, py: bs.py }, [], o),
        highlights: {
          area: [{ x: bs.px, y: bs.py }],
          targets: bs.marks.map((m) => ({ x: m.x, y: m.y })),
          marks: bs.marks,
        },
      });
      for (const m of bs.marks) wPen[m.y * o + m.x] &= ~(1 << m.n);
      lastStrikeGroup = myGroup;
      continue;
    }

    // 4. The next clue elimination (the deduction worth teaching).
    const cs = nextClueStrike(ops, wGrid, wPen, o);
    if (cs) {
      const values = cs.marks.map((m) => m.n).sort((a, b) => a - b);
      steps.push({
        move: { type: "pencilStrike", marks: cs.marks },
        explanation: narrate(cs.reason, values, o),
        highlights: {
          area: reasonArea(cs.reason, { x: cs.marks[0].x, y: cs.marks[0].y }),
          targets: cs.marks.map((m) => ({ x: m.x, y: m.y })),
          marks: cs.marks,
        },
        continuesPrevious: cs.group === lastStrikeGroup,
      });
      for (const m of cs.marks) wPen[m.y * o + m.x] &= ~(1 << m.n);
      lastStrikeGroup = cs.group;
      continue;
    }

    // 5. A forced placement (a cube collapse the notes lag) — re-derive *why*
    // (naked vs hidden single) from the working board; the recorded `single`
    // reason conflates the two and would mis-narrate a hidden single.
    const pl = nextPlace(ops, wGrid, o);
    if (pl) {
      const reason =
        pl.reason.kind === "single"
          ? singlePlacementReason(wGrid, wPen, pl.x, pl.y, pl.n, o)
          : pl.reason;
      emitPlacement(steps, wGrid, wPen, o, pl.x, pl.y, pl.n, reason, autoClean);
      ops = recordUnequalDeductions(
        o,
        state.mode,
        state.clueFlags,
        Uint8Array.from(wGrid),
        maxdiff,
      );
      lastStrikeGroup = Number.NaN;
      continue;
    }

    break; // stuck (e.g. a Recursive board now needing a guess)
  }

  return steps;
}

function hint(
  state: UnequalState,
  _aux?: string,
  ui?: UnequalUi,
): HintResult<UnequalMove, UnequalHint> {
  if (state.completed) return { ok: false, error: "This board is already solved." };
  if (findMistakes(state).length > 0) {
    return {
      ok: false,
      error:
        "Fix the highlighted mistakes first — a hint can't deduce from a wrong board.",
    };
  }
  const autoClean = ui?.autoPencil ?? true;
  const steps = buildSteps(state, autoClean);
  if (steps.length === 0) {
    return { ok: false, error: "No further move can be deduced from this position." };
  }
  return { ok: true, steps };
}

/** Classify a player move against the displayed hint step (shared
 * candidate-elimination keep-track; `UnequalHint` is structurally
 * `CandidateHighlights`). */
function hintKeepTrack(
  m: UnequalMove,
  step: HintStep<UnequalMove, UnequalHint>,
  state: UnequalState,
): HintTrackVerdict {
  return keepCandidateHintTrack(m, step, state.pencil, state.order);
}

/** Re-validate a stored hint step against the current board before it is
 * (re-)displayed (shared "never show a stale step" guarantee). */
function refreshHintStep(
  step: HintStep<UnequalMove, UnequalHint>,
  state: UnequalState,
): HintStep<UnequalMove, UnequalHint> | null {
  return refreshCandidateHintStep(step, state.grid, state.pencil, state.order);
}

function flashLength(
  from: UnequalState,
  to: UnequalState,
  _dir: number,
  _ui: UnequalUi,
): number {
  if (!from.completed && to.completed && !from.cheated && !to.cheated)
    return FLASH_TIME;
  return 0;
}

export const unequalGame: Game<
  UnequalParams,
  UnequalState,
  UnequalMove,
  UnequalUi,
  UnequalDrawState,
  UnequalMistake
> = {
  id: "unequal",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,
  canMarkAll: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  // Keys/shape match the `unequal` config template in augmentation.ts
  // ("{mode:Unequal|Adjacent}: {size}x{size} {difficulty:...}").
  describeParams: (p): ConfigValues => ({
    mode: p.mode === "adjacent" ? 1 : 0,
    size: String(p.order),
    difficulty: diffToLevel(p.diff),
  }),

  newDesc: (p, rng: RandomState) => newUnequalDesc(p, rng),
  validateDesc,
  newState,
  newUi,
  changedState,

  interpretMove,
  executeMove,
  status: (s): GameStatus => status(s),

  solve,
  hint,
  hintKeepTrack,
  refreshHintStep,
  findMistakes,
  textFormat,

  prefs: [
    {
      kw: "auto-pencil",
      name: "When you place a number, remove it from pencil marks in its row and column",
      type: "boolean",
      get: (ui) => ui.autoPencil,
      set: (ui, v) => {
        ui.autoPencil = v;
      },
    },
    {
      kw: "sticky-pencil-mode",
      name: "Right-click toggles a sticky pencil mode (stays on until right-clicked again)",
      type: "boolean",
      get: (ui) => ui.pencilSticky,
      set: (ui, v) => {
        ui.pencilSticky = v;
      },
    },
    {
      kw: "pencil-keep-highlight",
      name: "Keep mouse highlight after changing a pencil mark",
      type: "boolean",
      get: (ui) => ui.pencilKeepHighlight,
      set: (ui, v) => {
        ui.pencilKeepHighlight = v;
      },
    },
  ],

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: UnequalParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(unequalGame);
