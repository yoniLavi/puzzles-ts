/**
 * Keen (KenKen / Inshi No Heya) — native TS port of `keen.c`. Fill a `w × w`
 * grid with digits `1..w` so every row and column holds each digit once, and so
 * each arithmetic cage's digits satisfy its clue (target value + operation).
 * Left-click / cursor select highlights a cell for a real entry; right-click /
 * select2 highlights it for a pencil mark (or toggles sticky pencil mode); a
 * digit enters (or pencil-toggles) that value; backspace/space clears. Rule
 * violations highlight live; Check & Save additionally flags cells that
 * contradict the unique solution.
 */

import type {
  Colour,
  ConfigValues,
  GameStatus,
  Point,
  Size,
} from "../../../puzzle/types.ts";
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
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  CURSOR_UP,
  isCursorMove,
  LEFT_BUTTON,
  RIGHT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import { hiddenSingleLine, singlePlacementReason } from "../../engine/latin-hint.ts";
import { registerGame } from "../../engine/registry.ts";
import { stepBudget } from "../../engine/step-budget.ts";
import type { RandomState } from "../../random/index.ts";
import { newKeenDesc } from "./generator.ts";
import {
  colours,
  computeSize,
  FLASH_TIME,
  fromCoord,
  type KeenDrawState,
  type KeenHint,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  setTileSize,
} from "./render.ts";
import {
  DIFF_AMBIGUOUS,
  DIFF_IMPOSSIBLE,
  type HintOp,
  type HintReason,
  recordKeenDeductions,
  solveKeen,
} from "./solver.ts";
import {
  C_ADD,
  C_DIV,
  C_MUL,
  C_SUB,
  checkErrors,
  cloneState,
  DIFF_EXTREME,
  DIFF_UNREASONABLE,
  decodeParams,
  defaultParams,
  diffName,
  diffToLevel,
  encodeParams,
  type KeenMove,
  type KeenParams,
  type KeenState,
  type KeenUi,
  newState,
  newUi,
  status,
  validateDesc,
  validateParams,
} from "./state.ts";

/** A player marking that contradicts the unique solution:
 * - `"cell"` — a filled-in digit that is wrong;
 * - `"note"` — an empty cell whose non-empty pencil notes have crossed out the
 *   cell's solution digit. */
export interface KeenMistake {
  kind: "cell" | "note";
  x: number;
  y: number;
}

const PRESETS: KeenParams[] = [
  { w: 4, diff: "easy", multiplicationOnly: false },
  { w: 5, diff: "easy", multiplicationOnly: false },
  { w: 5, diff: "easy", multiplicationOnly: true },
  { w: 6, diff: "easy", multiplicationOnly: false },
  { w: 6, diff: "normal", multiplicationOnly: false },
  { w: 6, diff: "normal", multiplicationOnly: true },
  { w: 6, diff: "hard", multiplicationOnly: false },
  { w: 6, diff: "extreme", multiplicationOnly: false },
  { w: 6, diff: "unreasonable", multiplicationOnly: false },
  { w: 9, diff: "normal", multiplicationOnly: false },
];

function presetTitle(p: KeenParams): string {
  return `${p.w}x${p.w} ${diffName(p.diff)}${p.multiplicationOnly ? ", multiplication only" : ""}`;
}

function presets(): PresetMenu<KeenParams> {
  return {
    title: "Keen",
    submenu: PRESETS.map((p) => ({ title: presetTitle(p), params: p })),
  };
}

function inGrid(w: number, x: number, y: number): boolean {
  return x >= 0 && x < w && y >= 0 && y < w;
}

/** Move the keyboard cursor (clamped); reveal it on first press. Mirrors
 * `move_cursor`: the position moves even on the reveal press. */
function moveCursor(button: number, ui: KeenUi, w: number): UiUpdate | null {
  const ox = ui.hx;
  const oy = ui.hy;
  if (button === CURSOR_UP) ui.hy = Math.max(ui.hy - 1, 0);
  else if (button === CURSOR_DOWN) ui.hy = Math.min(ui.hy + 1, w - 1);
  else if (button === CURSOR_LEFT) ui.hx = Math.max(ui.hx - 1, 0);
  else if (button === CURSOR_RIGHT) ui.hx = Math.min(ui.hx + 1, w - 1);
  if (!ui.hshow) {
    ui.hshow = true;
    return UI_UPDATE;
  }
  return ui.hx !== ox || ui.hy !== oy ? UI_UPDATE : null;
}

function interpretMove(
  state: KeenState,
  ui: KeenUi,
  ds: KeenDrawState | null,
  p: Point,
  rawButton: number,
): KeenMove | null | UiUpdate {
  const w = state.params.w;
  const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
  const button = stripModifiers(rawButton);

  const tx = fromCoord(p.x, ts);
  const ty = fromCoord(p.y, ts);

  if (inGrid(w, tx, ty)) {
    if (button === LEFT_BUTTON) {
      // Sticky pencil mode: a left-click keeps the current pencil/real mode (it
      // only moves the highlight); non-sticky (upstream) reverts to real entry.
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
        ui.hshow = true; // Keen has no immutable givens
        if (!ui.pencilSticky) ui.hpencil = false;
      }
      ui.hcursor = false;
      return UI_UPDATE;
    }
    if (button === RIGHT_BUTTON) {
      if (ui.pencilSticky) {
        // Toggle the persistent pencil mode (CapsLock-style). Only move the
        // highlight onto an empty cell — a filled cell can't take a pencil mark.
        ui.hpencil = !ui.hpencil;
        if (state.grid[ty * w + tx] === 0) {
          ui.hx = tx;
          ui.hy = ty;
          ui.hshow = true;
        }
      } else if (state.grid[ty * w + tx] === 0) {
        if (tx === ui.hx && ty === ui.hy && ui.hshow && ui.hpencil) {
          ui.hshow = false;
        } else {
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
  }

  if (isCursorMove(button)) {
    ui.hcursor = true;
    return moveCursor(button, ui, w);
  }

  if (ui.hshow && button === CURSOR_SELECT) {
    ui.hpencil = !ui.hpencil;
    ui.hcursor = true;
    return UI_UPDATE;
  }

  const isNum = button >= 48 && button <= 57 && button - 48 <= w;
  const isClear = button === CURSOR_SELECT2 || button === 8 || button === 127;
  if (ui.hshow && (isNum || isClear)) {
    const n = isClear ? 0 : button - 48;
    const i = ui.hy * w + ui.hx;

    // Can't pencil-mark a filled square (reachable only via the cursor).
    if (ui.hpencil && state.grid[i]) return null;

    // No-op: setting a square to what it already holds (and no pencil marks).
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

  if (button === 77 || button === 109) return { type: "pencilAll" }; // 'M' / 'm'

  return null;
}

function executeMove(state: KeenState, move: KeenMove): KeenState {
  const w = state.params.w;
  const next = cloneState(state);

  switch (move.type) {
    case "set": {
      const i = move.y * w + move.x;
      if (move.pencil && move.n > 0) {
        next.pencil[i] ^= 1 << move.n;
      } else {
        next.grid[i] = move.n;
        next.pencil[i] = 0;
        if (move.autoElim && move.n > 0) {
          const bit = ~(1 << move.n);
          for (let k = 0; k < w; k++) {
            if (k !== move.x) next.pencil[move.y * w + k] &= bit;
            if (k !== move.y) next.pencil[k * w + move.x] &= bit;
          }
        }
        if (!next.completed && !checkErrors(next)) next.completed = true;
      }
      return next;
    }
    case "pencilAll": {
      const all = (1 << (w + 1)) - (1 << 1);
      for (let i = 0; i < w * w; i++) if (!next.grid[i]) next.pencil[i] = all;
      return next;
    }
    case "pencilStrike": {
      for (const { x, y, n } of move.marks) next.pencil[y * w + x] &= ~(1 << n);
      return next;
    }
    case "solve": {
      for (let i = 0; i < w * w; i++) {
        next.grid[i] = move.grid[i];
        next.pencil[i] = 0;
      }
      next.completed = true;
      next.cheated = true;
      return next;
    }
  }
}

function changedState(ui: KeenUi, _old: KeenState | null, newSt: KeenState): void {
  const w = newSt.params.w;
  if (ui.hshow && ui.hpencil && !ui.hcursor && newSt.grid[ui.hy * w + ui.hx] !== 0) {
    ui.hshow = false;
  }
}

function solve(orig: KeenState, _curr: KeenState, aux?: string): SolveResult<KeenMove> {
  const w = orig.params.w;
  if (aux) {
    const grid: number[] = [];
    for (let i = 0; i < w * w; i++) grid[i] = aux.charCodeAt(i + 1) - 48;
    return { ok: true, move: { type: "solve", grid } };
  }
  const soln = new Uint8Array(w * w);
  const ret = solveKeen(w, orig.clues, soln, DIFF_UNREASONABLE);
  if (ret === DIFF_IMPOSSIBLE)
    return { ok: false, error: "No solution exists for this puzzle" };
  if (ret === DIFF_AMBIGUOUS)
    return { ok: false, error: "Multiple solutions exist for this puzzle" };
  return { ok: true, move: { type: "solve", grid: Array.from(soln, (v) => v) } };
}

function findMistakes(state: KeenState): readonly KeenMistake[] {
  const w = state.params.w;
  // The solution is derived from the cage clue structure only (Keen has no
  // givens) — never from the player's notes (a note can be wrong; that is what
  // we are checking).
  const soln = new Uint8Array(w * w);
  const ret = solveKeen(w, state.clues, soln, DIFF_UNREASONABLE);
  if (ret === DIFF_IMPOSSIBLE || ret === DIFF_AMBIGUOUS) return [];
  const out: KeenMistake[] = [];
  for (let i = 0; i < w * w; i++) {
    if (state.grid[i]) {
      if (state.grid[i] !== soln[i])
        out.push({ kind: "cell", x: i % w, y: (i / w) | 0 });
    } else if (state.pencil[i] !== 0 && !(state.pencil[i] & (1 << soln[i]))) {
      out.push({ kind: "note", x: i % w, y: (i / w) | 0 });
    }
  }
  return out;
}

// --- hint ------------------------------------------------------------------

const POPULATE_TEXT =
  "Start by pencilling in every candidate number in each empty cell, so the eliminations that follow have something to cross out.";

/** Join a value list for narration: `[3]`→"3", `[1,2]`→"1 and 2",
 * `[1,2,3]`→"1, 2 and 3". */
function joinNums(ns: number[]): string {
  if (ns.length <= 1) return `${ns[0] ?? ""}`;
  if (ns.length === 2) return `${ns[0]} and ${ns[1]}`;
  return `${ns.slice(0, -1).join(", ")} and ${ns[ns.length - 1]}`;
}

/** The cage's arithmetic goal as a verb phrase, read off its packed clue — the
 * indication a cage deduction leads with (hint-authoring §2.2). Reads across the
 * whole operation set: `sum to 15`, `multiply to 72`, `differ by 3`,
 * `have a ratio of 2`. */
function cageGoal(op: number, value: number): string {
  switch (op) {
    case C_ADD:
      return `sum to ${value}`;
    case C_MUL:
      return `multiply to ${value}`;
    case C_SUB:
      return `differ by ${value}`;
    case C_DIV:
      return `have a ratio of ${value}`;
    default:
      return `total ${value}`;
  }
}

/** Narrate *why* a firing is forced (hint-authoring §2): indication → reasoning →
 * necessity-voice conclusion. `ns` is the struck value list (a placement passes
 * its single digit); `w` is the grid order. Cage deductions name the cage by its
 * clue; the generic Latin techniques carry no clean local area (the struck notes
 * carry the premise). */
function narrate(reason: HintReason, ns: number[], _w: number): string {
  switch (reason.kind) {
    case "cage":
      return `No way to make this cage ${cageGoal(reason.op, reason.value)} leaves room for ${joinNums(ns)} in this cell, so we must cross out ${joinNums(ns)}.`;
    case "cageLine":
      return `This cage must ${cageGoal(reason.op, reason.value)}, and every way to fill it places a ${ns[0]} in this ${reason.horizontal ? "row" : "column"} — so the ${ns[0]} here must be crossed out.`;
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

/** The deduction's evidence cells to shade `COL_HINT_CELL`: a cage deduction
 * names the whole cage (the player sees the block the arithmetic reasons over);
 * the generic Latin techniques have no clean local area. */
function reasonArea(reason: HintReason): { x: number; y: number }[] {
  return reason.kind === "cage" || reason.kind === "cageLine" ? reason.cells : [];
}

/** A placement's evidence cells: a hidden single shades the whole row/column it
 * reasons over (so the player sees that no *other* cell in the line can take the
 * digit); a naked single needs no area (its own collapsed candidates are the
 * premise). */
function placementArea(reason: HintReason, w: number): { x: number; y: number }[] {
  return reason.kind === "hiddenSingle"
    ? hiddenSingleLine(reason.line, reason.index, w)
    : [];
}


/** True iff some empty cell carries no pencil notes — i.e. the board needs a
 * fill-all populate before the eliminations have anything to cross out. */
function anyEmptyLacksNotes(state: KeenState): boolean {
  const a = state.params.w * state.params.w;
  for (let i = 0; i < a; i++) {
    if (state.grid[i] === 0 && state.pencil[i] === 0) return true;
  }
  return false;
}

/** A naked single in the working notes: the first empty cell whose pencil set has
 * exactly one candidate. On a mistake-free board that lone candidate is the
 * solution, so placing it is sound — and it is the move a human makes next, so the
 * hint surfaces it ahead of any further elimination (hint-authoring §9.3). */
function nakedSingle(
  wGrid: Int8Array,
  wPen: Int32Array,
  w: number,
): { x: number; y: number; n: number } | null {
  for (let i = 0; i < w * w; i++) {
    if (wGrid[i] !== 0 || wPen[i] === 0) continue;
    if ((wPen[i] & (wPen[i] - 1)) !== 0) continue; // more than one bit set
    let n = 0;
    for (let v = 1; v <= w; v++) {
      if (wPen[i] & (1 << v)) {
        n = v;
        break;
      }
    }
    if (n > 0) return { x: i % w, y: (i / w) | 0, n };
  }
  return null;
}

/** The next basic-Latin cleanup: the first filled cell whose value still appears
 * as a live pencil mark elsewhere in its row or column. Keen has no givens, but a
 * player can place a digit with auto-pencil off, leaving its row/column dups live;
 * the recording solver culls those during `alloc` (before recording), so they are
 * never in the recorded script and must be taught explicitly (hint-authoring §9.2,
 * the basic-Latin opening). Returns one firing — one placed value and every stray
 * copy of it in its line. On a fresh board with no placements it finds nothing. */
function basicLatinStrike(
  wGrid: Int8Array,
  wPen: Int32Array,
  w: number,
): { px: number; py: number; n: number; marks: { x: number; y: number; n: number }[] } | null {
  for (let i = 0; i < w * w; i++) {
    const v = wGrid[i];
    if (v === 0) continue;
    const px = i % w;
    const py = (i / w) | 0;
    const bit = 1 << v;
    const marks: { x: number; y: number; n: number }[] = [];
    for (let k = 0; k < w; k++) {
      if (k !== px && wGrid[py * w + k] === 0 && wPen[py * w + k] & bit)
        marks.push({ x: k, y: py, n: v });
      if (k !== py && wGrid[k * w + px] === 0 && wPen[k * w + px] & bit)
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
function firstUnreflectedPlaceIndex(ops: HintOp[], wGrid: Int8Array, w: number): number {
  for (let i = 0; i < ops.length; i++) {
    if (ops[i].kind === "place" && wGrid[ops[i].y * w + ops[i].x] === 0) return i;
  }
  return ops.length;
}

/** The next deduction-strike *firing* whose marks are still live, considering only
 * eliminations valid against the current grid. `dup` strikes are excluded (those
 * are placement bookkeeping handled by `emitPlacement`). One returned firing is one
 * `group` (one cage's candidate pruning, or one digit-out-of-one-line cross-cage
 * elimination); the caller splits it into a per-cell journey. */
function nextStrike(
  ops: HintOp[],
  wGrid: Int8Array,
  wPen: Int32Array,
  w: number,
): { ops: HintOp[]; group: number } | null {
  const lim = firstUnreflectedPlaceIndex(ops, wGrid, w);
  const liveAt = (op: HintOp) =>
    op.kind === "elim" &&
    wGrid[op.y * w + op.x] === 0 &&
    (wPen[op.y * w + op.x] & (1 << op.n)) !== 0;
  let i = 0;
  while (i < lim) {
    const g = ops[i].group;
    const group: HintOp[] = [];
    while (i < lim && ops[i].group === g) group.push(ops[i++]);
    const live = group.filter((op) => liveAt(op) && op.reason.kind !== "dup");
    if (live.length === 0) continue;
    return { ops: live, group: g };
  }
  return null;
}

/** The next forced placement the recording solver makes whose cell is still empty
 * — a cube collapse the working notes lag (a naked or hidden single). The *why*
 * is re-derived from the working board at emit time, so the recorded reason is
 * not returned here. */
function nextPlace(
  ops: HintOp[],
  wGrid: Int8Array,
  w: number,
): { x: number; y: number; n: number } | null {
  for (const op of ops) {
    if (op.kind === "place" && wGrid[op.y * w + op.x] === 0) {
      return { x: op.x, y: op.y, n: op.n };
    }
  }
  return null;
}

/** Emit one firing's strikes as a single journey: split the firing's live ops by
 * cell (one cell = one leg), so each leg narrates "this cell" and highlights a
 * single target, with the legs flagged `continuesPrevious` (quality-bar rule 2 —
 * one firing = one journey). Applies each leg's strikes to the working notes. */
function emitStrikeJourney(
  steps: HintStep<KeenMove, KeenHint>[],
  wPen: Int32Array,
  w: number,
  groupOps: HintOp[],
): void {
  const byCell = new Map<number, HintOp[]>();
  for (const op of groupOps) {
    const key = op.y * w + op.x;
    const arr = byCell.get(key);
    if (arr) arr.push(op);
    else byCell.set(key, [op]);
  }
  let first = true;
  for (const [key, cellOps] of byCell) {
    const x = key % w;
    const y = (key / w) | 0;
    const marks = cellOps.map((op) => ({ x, y, n: op.n }));
    const values = marks.map((m) => m.n).sort((a, b) => a - b);
    const reason = cellOps[0].reason;
    steps.push({
      move: { type: "pencilStrike", marks },
      explanation: narrate(reason, values, w),
      highlights: { area: reasonArea(reason), targets: [{ x, y }], marks },
      continuesPrevious: !first,
    });
    for (const m of marks) wPen[m.y * w + m.x] &= ~(1 << m.n);
    first = false;
  }
}

/** Emit a placement step and apply it to the working board, striking the placed
 * value from the rest of its row and column. With auto-pencil on (`autoClean`)
 * that cleanup is silent (the move's own `autoElim` does it on the real board);
 * with it off it becomes an explicit `pencilStrike` journey continuation. */
function emitPlacement(
  steps: HintStep<KeenMove, KeenHint>[],
  wGrid: Int8Array,
  wPen: Int32Array,
  w: number,
  x: number,
  y: number,
  n: number,
  reason: HintReason,
  autoClean: boolean,
): void {
  steps.push({
    move: { type: "set", x, y, n, pencil: false, autoElim: autoClean },
    explanation: narrate(reason, [n], w),
    highlights: { area: placementArea(reason, w), targets: [{ x, y }], marks: [] },
  });
  wGrid[y * w + x] = n;
  wPen[y * w + x] = 0;

  const dupMarks: { x: number; y: number; n: number }[] = [];
  for (let k = 0; k < w; k++) {
    if (k !== x && wPen[y * w + k] & (1 << n)) dupMarks.push({ x: k, y, n });
    if (k !== y && wPen[k * w + x] & (1 << n)) dupMarks.push({ x, y: k, n });
  }
  for (const m of dupMarks) wPen[m.y * w + m.x] &= ~(1 << n);

  if (!autoClean && dupMarks.length > 0) {
    steps.push({
      move: { type: "pencilStrike", marks: dupMarks },
      explanation: narrate({ kind: "dup", n, px: x, py: y }, [], w),
      highlights: { area: [], targets: dupMarks.map((m) => ({ x: m.x, y: m.y })), marks: dupMarks },
      continuesPrevious: true,
    });
  }
}

/** Build the hint plan by walking a working copy the way a person solves it: a
 * naked single first; else (after a lazy populate) the basic-Latin row/column cull
 * a placed value forces; else the next cage elimination; else a forced placement.
 * `autoClean` (the auto-pencil preference) decides whether a placement's trivial
 * row/column eliminations are silent or taught. */
function buildSteps(state: KeenState, autoClean: boolean): HintStep<KeenMove, KeenHint>[] {
  const w = state.params.w;
  const steps: HintStep<KeenMove, KeenHint>[] = [];
  const wGrid = Int8Array.from(state.grid);
  const wPen = Int32Array.from(state.pencil);
  const maxdiff = Math.min(diffToLevel(state.params.diff), DIFF_EXTREME);

  let populated = !anyEmptyLacksNotes(state);
  const ensurePopulated = (): void => {
    if (populated) return;
    const all = (1 << (w + 1)) - (1 << 1);
    for (let i = 0; i < w * w; i++) if (!wGrid[i]) wPen[i] = all;
    steps.push({
      move: { type: "pencilAll" },
      explanation: POPULATE_TEXT,
      highlights: { area: [], targets: [], marks: [] },
    });
    populated = true;
  };

  let ops = recordKeenDeductions(w, state.clues, Uint8Array.from(wGrid), maxdiff);
  const budget = stepBudget("keen hint plan");
  const cap = w * w * w * 4 + 4;
  for (let guard = 0; guard < cap; guard++) {
    budget.tick();
    let filled = true;
    for (let i = 0; i < w * w; i++) if (!wGrid[i]) filled = false;
    if (filled) break;

    // 1. A naked single — the next move a human makes.
    const ns = nakedSingle(wGrid, wPen, w);
    if (ns) {
      emitPlacement(steps, wGrid, wPen, w, ns.x, ns.y, ns.n, { kind: "single" }, autoClean);
      ops = recordKeenDeductions(w, state.clues, Uint8Array.from(wGrid), maxdiff);
      continue;
    }

    // 2. Pencil in the notes (once) before any elimination needs them.
    if (!populated) {
      ensurePopulated();
      continue;
    }

    // 3. The basic-Latin cull a placed value forces in its row and column.
    const bs = basicLatinStrike(wGrid, wPen, w);
    if (bs) {
      steps.push({
        move: { type: "pencilStrike", marks: bs.marks },
        explanation: narrate({ kind: "dup", n: bs.n, px: bs.px, py: bs.py }, [], w),
        highlights: {
          area: [{ x: bs.px, y: bs.py }],
          targets: bs.marks.map((m) => ({ x: m.x, y: m.y })),
          marks: bs.marks,
        },
      });
      for (const m of bs.marks) wPen[m.y * w + m.x] &= ~(1 << m.n);
      continue;
    }

    // 4. The next cage elimination (the deduction worth teaching).
    const cs = nextStrike(ops, wGrid, wPen, w);
    if (cs) {
      emitStrikeJourney(steps, wPen, w, cs.ops);
      continue;
    }

    // 5. A forced placement (a cube collapse the notes lag) — re-derive *why*
    // (naked vs hidden single) from the working board; the recorded `single`
    // reason conflates the two and would mis-narrate a hidden single.
    const pl = nextPlace(ops, wGrid, w);
    if (pl) {
      const reason = singlePlacementReason(wGrid, wPen, pl.x, pl.y, pl.n, w);
      emitPlacement(steps, wGrid, wPen, w, pl.x, pl.y, pl.n, reason, autoClean);
      ops = recordKeenDeductions(w, state.clues, Uint8Array.from(wGrid), maxdiff);
      continue;
    }

    break; // stuck (e.g. an Unreasonable board now needing a guess)
  }

  return steps;
}

function hint(state: KeenState, _aux?: string, ui?: KeenUi): HintResult<KeenMove, KeenHint> {
  if (state.completed) return { ok: false, error: "This board is already solved." };
  if (findMistakes(state).length > 0) {
    return {
      ok: false,
      error: "Fix the highlighted mistakes first — a hint can't deduce from a wrong board.",
    };
  }
  const autoClean = ui?.autoPencil ?? true;
  const steps = buildSteps(state, autoClean);
  if (steps.length === 0) {
    return { ok: false, error: "No further move can be deduced from this position." };
  }
  return { ok: true, steps };
}

/** Classify a player move against the displayed hint step. A `pencilAll` matches a
 * populate step; a real placement matches a `set` step; a pencil toggle that
 * *clears* one of a strike step's marks shrinks it (`onTrack`) or finishes it
 * (`completed`). Anything else drops the plan. */
function hintKeepTrack(
  m: KeenMove,
  step: HintStep<KeenMove, KeenHint>,
  state: KeenState,
): HintTrackVerdict {
  const sm = step.move;
  const w = state.params.w;
  if (sm.type === "pencilAll") return m.type === "pencilAll" ? "completed" : "off";
  if (sm.type === "set") {
    return m.type === "set" && !m.pencil && m.x === sm.x && m.y === sm.y && m.n === sm.n
      ? "completed"
      : "off";
  }
  if (sm.type === "pencilStrike") {
    // The player strikes a candidate with a pencil toggle (`set { pencil }`).
    if (m.type !== "set" || !m.pencil) return "off";
    const hit = sm.marks.findIndex((k) => k.x === m.x && k.y === m.y && k.n === m.n);
    if (hit < 0) return "off"; // touched a non-target candidate
    // `state` is the PRE-move board. A pencil toggle clears the candidate iff it
    // is present now; if already absent the toggle would re-add it — off-plan.
    if (!(state.pencil[m.y * w + m.x] & (1 << m.n))) return "off";
    const remaining = sm.marks.filter((_, j) => j !== hit);
    if (remaining.length === 0) return "completed";
    step.move = { type: "pencilStrike", marks: remaining };
    if (step.highlights) {
      step.highlights = {
        ...step.highlights,
        targets: remaining.map((k) => ({ x: k.x, y: k.y })),
        marks: remaining,
      };
    }
    return "onTrack";
  }
  return "off";
}

/** Re-validate a stored hint step against the current board before it is
 * (re-)displayed (the engine's "never show a stale step" guarantee). The way a
 * kept plan goes stale here is auto-pencil: turning it on silently strikes a
 * placed value from its row/column, so a later stored `pencilStrike` may name
 * notes already gone. Drop dead marks; if none survive the step is resolved. */
function refreshHintStep(
  step: HintStep<KeenMove, KeenHint>,
  state: KeenState,
): HintStep<KeenMove, KeenHint> | null {
  const m = step.move;
  const w = state.params.w;
  if (m.type === "pencilStrike") {
    const live = m.marks.filter(
      ({ x, y, n }) => state.grid[y * w + x] === 0 && (state.pencil[y * w + x] & (1 << n)) !== 0,
    );
    if (live.length === 0) return null;
    if (live.length === m.marks.length) return step;
    return {
      ...step,
      move: { type: "pencilStrike", marks: live },
      highlights: step.highlights
        ? { ...step.highlights, targets: live.map((k) => ({ x: k.x, y: k.y })), marks: live }
        : undefined,
    };
  }
  if (m.type === "set" && !m.pencil) {
    // A placement step is resolved once its cell is filled.
    return state.grid[m.y * w + m.x] !== 0 ? null : step;
  }
  if (m.type === "pencilAll") {
    for (let i = 0; i < w * w; i++) {
      if (state.grid[i] === 0 && state.pencil[i] === 0) return step;
    }
    return null;
  }
  return step;
}

function flashLength(
  from: KeenState,
  to: KeenState,
  _dir: number,
  _ui: KeenUi,
): number {
  if (!from.completed && to.completed && !from.cheated && !to.cheated)
    return FLASH_TIME;
  return 0;
}

export const keenGame: Game<
  KeenParams,
  KeenState,
  KeenMove,
  KeenUi,
  KeenDrawState,
  KeenMistake
> = {
  id: "keen",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: false,
  canMarkAll: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  // Keys/shape match the `keen` config template in augmentation.ts
  // ("{grid-size}x{grid-size} {difficulty:...}{multiplication-only:|, …}").
  describeParams: (p): ConfigValues => ({
    "grid-size": String(p.w),
    difficulty: diffToLevel(p.diff),
    "multiplication-only": p.multiplicationOnly ? 1 : 0,
  }),

  newDesc: (p, rng: RandomState) => newKeenDesc(p, rng),
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
  computeSize: (p: KeenParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(keenGame);
