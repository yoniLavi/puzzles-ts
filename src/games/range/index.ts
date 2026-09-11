/**
 * Range (Kurodoko / Kuromasu) — native TS port of `range.c`. Numbered
 * clues state how many white squares are visible from them in a straight
 * line (counting the clue once); paint squares black so no two blacks
 * touch, the whites stay connected, and every clue is satisfied.
 *
 * Left-click / select cycles a non-clue cell empty → black → white →
 * empty; right-click / select2 cycles the other way. White is the
 * player's optional "this is white" dot. Errors (rule violations) are
 * highlighted live; Check & Save additionally flags cells that
 * contradict the unique solution.
 */

import { rejectMove } from "../../engine/assert-never.ts";
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
import { fromCoord } from "../../engine/geometry.ts";
import { commonHintRefusal, DEDUCTION_EXHAUSTED } from "../../engine/hint-refusal.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  cursorDelta,
  isMouseDown,
  LEFT_BUTTON,
  MOD_SHFT,
  moveCursor,
  newCursor,
  RIGHT_BUTTON,
  showCursor,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import type { Point } from "../../engine/types.ts";
import { say } from "./hint-text.ts";
import {
  border,
  colors,
  computeSize,
  FLASH_TIME,
  newDrawState,
  PREFERRED_TILE_SIZE,
  type RangeDrawState,
  redraw,
  setTileSize,
} from "./render.ts";
import {
  DC,
  DR,
  deduceHintPlan,
  findErrors,
  fullSolve,
  generateGrid,
  type HintReason,
} from "./solver.ts";
import {
  BLACK,
  type Cell,
  cellValueToGrid,
  cloneState,
  decodeParams,
  defaultParams,
  EMPTY,
  encodeDesc,
  encodeParams,
  gridValueToCell,
  idx,
  newState,
  outOfBounds,
  paramConfig,
  presets,
  type RangeCellValue,
  type RangeMove,
  type RangeParams,
  type RangeState,
  type RangeUi,
  status,
  textFormat,
  validateDesc,
  validateParams,
  WHITE,
} from "./state.ts";

export type RangeMistake = Cell;

function newUi(_state: RangeState): RangeUi {
  return { cursor: newCursor() };
}

/** The forward (right-button) cycle; a backward step is two forward ones. */
const CYCLE: RangeCellValue[] = ["empty", "white", "black"];

/** The mark a non-clue cell becomes under a forward or backward cycle. */
function cycle(cell: number, forwards: boolean): RangeCellValue {
  const i = CYCLE.indexOf(gridValueToCell(cell));
  return CYCLE[(i + (forwards ? 1 : 2)) % 3];
}

function interpretMove(
  state: RangeState,
  ui: RangeUi,
  ds: RangeDrawState,
  p: Point,
  rawButton: number,
): RangeMove | null | UiUpdate {
  const { w, h, grid } = state;
  const shift = !!(rawButton & MOD_SHFT);
  const button = stripModifiers(rawButton);

  if ((button === CURSOR_SELECT || button === CURSOR_SELECT2) && !ui.cursor.visible) {
    return null;
  }

  let r = ui.cursor.y;
  let c = ui.cursor.x;

  if (isMouseDown(button)) {
    const ts = ds.tilesize;
    r = fromCoord(p.y, ts, border(ts));
    c = fromCoord(p.x, ts, border(ts));
    if (outOfBounds(r, c, w, h)) return null;
    ui.cursor.y = r;
    ui.cursor.x = c;
    ui.cursor.visible = false;
  }

  const delta = cursorDelta(button);
  if (delta) {
    const dr = delta.dy;
    const dc = delta.dx;
    if (shift) {
      // A shifted arrow *dots* the cells it passes, which is too much to do to
      // a player who cannot yet see the cursor — that one still only reveals.
      if (showCursor(ui.cursor)) return UI_UPDATE;
      const preR = ui.cursor.y;
      const preC = ui.cursor.x;
      const doPre = grid[idx(preR, preC, w)] === EMPTY;
      if (outOfBounds(ui.cursor.y + dr, ui.cursor.x + dc, w, h)) {
        return doPre ? { sets: [{ r: preR, c: preC, value: "white" }] } : null;
      }
      ui.cursor.y += dr;
      ui.cursor.x += dc;
      const doPost = grid[idx(ui.cursor.y, ui.cursor.x, w)] === EMPTY;
      const sets: RangeMove["sets"] = [];
      if (doPre) sets.push({ r: preR, c: preC, value: "white" });
      if (doPost) sets.push({ r: ui.cursor.y, c: ui.cursor.x, value: "white" });
      return sets.length > 0 ? { sets } : UI_UPDATE;
    }
    // Reveal *and* move in one press. The cursor is (x, y), transposed from
    // Range's own `(r, c)` at the boundary (see `RangeUi`).
    moveCursor(ui.cursor, button, w, h);
    return UI_UPDATE;
  }

  let forwards: boolean;
  if (button === LEFT_BUTTON || button === CURSOR_SELECT) forwards = false;
  else if (button === RIGHT_BUTTON || button === CURSOR_SELECT2) forwards = true;
  else return null;

  const cell = grid[idx(r, c, w)];
  if (cell > 0) return null; // clue cell — inert
  return { sets: [{ r, c, value: cycle(cell, forwards) }] };
}

function executeMove(state: RangeState, move: RangeMove): RangeState {
  // A move is a list of cell settings, not a union, so there is no discriminant
  // to narrow to `never`: check the one field the dispatch reads. (The `value`
  // inside each setting *is* a union — `cellValueToGrid` asserts on it.)
  if (!Array.isArray(move.sets)) rejectMove(move, "range: executeMove");

  const next = cloneState(state);
  for (const { r, c, value } of move.sets) {
    if (outOfBounds(r, c, next.w, next.h)) throw new Error("Range move out of bounds");
    const cell = idx(r, c, next.w);
    if (next.grid[cell] > 0) throw new Error("Range move targets a clue cell");
    next.grid[cell] = cellValueToGrid(value);
  }
  if (move.solve) {
    next.cheated = true;
    next.completed = true;
  } else if (!next.completed) {
    next.completed = !findErrors(next.grid, next.w, next.h);
  }
  return next;
}

/** Strip the player's marks, leaving the initial clue grid. */
function clueGrid(state: RangeState): Int8Array {
  const g = state.grid.slice();
  for (let i = 0; i < g.length; i++) {
    if (g[i] <= 0) g[i] = EMPTY;
  }
  return g;
}

function solve(orig: RangeState, _curr: RangeState): SolveResult<RangeMove> {
  const solution = fullSolve(clueGrid(orig), orig.w, orig.h);
  if (!solution)
    return { ok: false, error: "This puzzle instance contains a contradiction" };
  const sets: RangeMove["sets"] = [];
  for (let r = 0; r < orig.h; r++) {
    for (let c = 0; c < orig.w; c++) {
      const v = solution[idx(r, c, orig.w)];
      if (v <= 0) sets.push({ r, c, value: gridValueToCell(v) });
    }
  }
  return { ok: true, move: { solve: true, sets } };
}

function findMistakes(state: RangeState): readonly RangeMistake[] {
  const solution = fullSolve(clueGrid(state), state.w, state.h);
  if (!solution) return [];
  const out: RangeMistake[] = [];
  for (let r = 0; r < state.h; r++) {
    for (let c = 0; c < state.w; c++) {
      const cell = idx(r, c, state.w);
      const v = state.grid[cell];
      // Only a decided mark can be a mistake; clues and undecided cells never are.
      if ((v === BLACK || v === WHITE) && solution[cell] !== v) out.push({ r, c });
    }
  }
  return out;
}

// --- hint ------------------------------------------------------------------

/** Highlight data for a Range hint step. `target` is the cell the
 * deduction forces (and the mark it forces). `area` is the deduction's
 * evidence to outline — the clue's line of sight, the line it must reach
 * along, or the non-black cells a cut would isolate — so a beginner can
 * *see* the reasoning, not just the conclusion (the Palisade
 * region-highlight convention). `blackRefs` are black premise cells (an
 * adjacent black) that stay black and are ringed instead. */
export interface RangeHint {
  target: { r: number; c: number; value: RangeCellValue };
  area: Cell[];
  blackRefs?: Cell[];
  /** The clue driving a line-of-sight deduction, its digit recolored
   * `COL_HINT`. A clue sits *inside* its own shaded line of sight, and a
   * board can put two clues of the same value in one such run (as `9x6` seed
   * `range-a` does), so the value alone does not name it and the driving one
   * is marked (Light Up's recolored digit, the same element-type legend). */
  clue?: Cell;
}

/** A cell already known to be white: the player's white mark, or a clue
 * (clues are implicitly white). Mirrors the solver's RUN_WHITE mask. */
function knownWhite(v: number): boolean {
  return v === WHITE || v > 0;
}

/** The cells a clue currently *sees*: itself plus the run of known-white
 * cells in each of the four directions, stopping at the first undecided
 * or black cell (or the edge). This is exactly the count the run-length
 * rules reason about, made visible. */
function lineOfSight(
  grid: Int8Array,
  w: number,
  h: number,
  cr: number,
  cc: number,
): Cell[] {
  const cells = [{ r: cr, c: cc }];
  for (let j = 0; j < 4; j++) {
    let r = cr + DR[j];
    let c = cc + DC[j];
    while (!outOfBounds(r, c, w, h) && knownWhite(grid[idx(r, c, w)])) {
      cells.push({ r, c });
      r += DR[j];
      c += DC[j];
    }
  }
  return cells;
}

/** The straight line from a clue toward a target it must reach: the clue
 * plus every cell between it and the target (target excluded — that one
 * is the COL_HINT cell). Clue and target are collinear by construction. */
function reachLine(cr: number, cc: number, tr: number, tc: number): Cell[] {
  const cells = [{ r: cr, c: cc }];
  const dr = Math.sign(tr - cr);
  const dc = Math.sign(tc - cc);
  let r = cr + dr;
  let c = cc + dc;
  while (r !== tr || c !== tc) {
    cells.push({ r, c });
    r += dr;
    c += dc;
  }
  return cells;
}

/** The non-black orthogonal neighbors of a cell — the cells a cut at
 * this cell would risk isolating from each other. The connectedness rule
 * treats every non-black cell as part of the one white group, so these
 * include undecided cells, not only cells already marked white. */
function nonBlackNeighbors(
  grid: Int8Array,
  w: number,
  h: number,
  cr: number,
  cc: number,
): Cell[] {
  const out: Cell[] = [];
  for (let j = 0; j < 4; j++) {
    const r = cr + DR[j];
    const c = cc + DC[j];
    if (!outOfBounds(r, c, w, h) && grid[idx(r, c, w)] !== BLACK) out.push({ r, c });
  }
  return out;
}

/** Narrate *why* the move is forced, per the deduction rule. The words, and
 * the deixis ties each carries to the highlighted evidence, are
 * [`hint-text.ts`](./hint-text.ts)'s. */
function narrate(reason: HintReason): string {
  switch (reason.kind) {
    case "adjacency":
      return say.adjacency;
    case "satisfied":
      return say.satisfied(reason.n);
    case "overrun":
      return say.overrun(reason.n);
    case "reach":
      return say.reach(reason.n);
    case "connect":
      return say.connect;
  }
}

/** Build the highlight payload for a forced move: the area to outline and
 * any black premise cells to ring, derived from the deduction's reason.
 * `grid` is the solver's working grid with this move already applied, so the
 * target is never part of its own area: a black target cannot be in a line of
 * sight, and a `reach` target, which can, is taken out of it. */
function buildHighlights(
  grid: Int8Array,
  w: number,
  h: number,
  reason: HintReason,
  target: { r: number; c: number; value: RangeCellValue },
): RangeHint {
  switch (reason.kind) {
    case "adjacency":
      return { target, area: [], blackRefs: [reason.from] };
    case "satisfied":
    case "overrun":
      return {
        target,
        area: lineOfSight(grid, w, h, reason.clue.r, reason.clue.c),
        clue: reason.clue,
      };
    case "reach": {
      // Show the clue's whole current line of sight *and* the path it is
      // extending toward this target, so the shaded run the narration
      // names is actually visible even when the target is adjacent.
      const { r, c } = reason.clue;
      const area = new Map<number, Cell>();
      for (const cell of [
        ...lineOfSight(grid, w, h, r, c),
        ...reachLine(r, c, target.r, target.c),
      ]) {
        area.set(idx(cell.r, cell.c, w), cell);
      }
      area.delete(idx(target.r, target.c, w));
      return { target, area: [...area.values()], clue: reason.clue };
    }
    case "connect":
      return { target, area: nonBlackNeighbors(grid, w, h, target.r, target.c) };
  }
}

function hint(state: RangeState): HintResult<RangeMove, RangeHint> {
  const refusal = commonHintRefusal(state.completed, findMistakes(state).length);
  if (refusal) return refusal;
  const plan = deduceHintPlan(state.grid, state.w, state.h);
  if (plan.length === 0) return { ok: false, error: DEDUCTION_EXHAUSTED };
  const steps: HintStep<RangeMove, RangeHint>[] = plan.map((m) => {
    const value = gridValueToCell(m.value);
    const target = { r: m.r, c: m.c, value };
    return {
      move: { sets: [{ r: m.r, c: m.c, value }] },
      explanation: narrate(m.reason),
      highlights: buildHighlights(m.grid, state.w, state.h, m.reason, target),
    };
  });
  return { ok: true, steps };
}

/** A move completes the hint step iff it sets the hinted cell to the
 * hinted value; anything else drops the plan to recompute. */
function hintKeepTrack(
  m: RangeMove,
  step: HintStep<RangeMove, RangeHint>,
  _state: RangeState,
): HintTrackVerdict {
  const t = step.highlights?.target;
  if (m.solve || !t) return "off";
  const last = m.sets.findLast((s) => s.r === t.r && s.c === t.c);
  return last?.value === t.value ? "completed" : "off";
}

export const rangeGame: Game<
  RangeParams,
  RangeState,
  RangeMove,
  RangeUi,
  RangeDrawState,
  RangeMistake
> = {
  id: "range",
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

  newDesc: (p, rng) => ({ desc: encodeDesc(p.w * p.h, generateGrid(p, rng)) }),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status,

  solve,
  hint,
  hintKeepTrack,
  findMistakes,

  textFormat,

  colors,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize,
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength: (from, to) => winFlash(from, to, FLASH_TIME),
};

registerGame(rangeGame);
