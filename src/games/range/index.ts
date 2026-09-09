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
import { fromCoord as fromCoordE } from "../../engine/geometry.ts";
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
import type { Color, Point, Size } from "../../engine/types.ts";
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
  deduceHintPlan,
  findErrors,
  fullSolve,
  generateGrid,
  type HintReason,
} from "./solver.ts";
import {
  BLACK,
  cellValueToGrid,
  cloneState,
  decodeParams,
  defaultParams,
  EMPTY,
  encodeDesc,
  encodeParams,
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

export interface RangeMistake {
  r: number;
  c: number;
}

function newUi(_state: RangeState): RangeUi {
  return { cursor: newCursor() };
}

/** The mark a cell becomes under a forward (right) or backward (left)
 * cycle, given its current value. Clue cells (handled by the caller)
 * never reach here. */
function cycle(cell: number, forwards: boolean): RangeCellValue | null {
  if (forwards) {
    if (cell === EMPTY) return "white";
    if (cell === WHITE) return "black";
    if (cell === BLACK) return "empty";
  } else {
    if (cell === BLACK) return "white";
    if (cell === WHITE) return "empty";
    if (cell === EMPTY) return "black";
  }
  return null;
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
    const b = border(ts);
    const fromCoord = (v: number): number => fromCoordE(v, ts, b);
    r = fromCoord(p.y + ts) - 1;
    c = fromCoord(p.x + ts) - 1;
    if (outOfBounds(r, c, w, h)) return null;
    ui.cursor.y = r;
    ui.cursor.x = c;
    ui.cursor.visible = false;
  }

  let forwards: boolean | null = null;
  if (button === LEFT_BUTTON || button === CURSOR_SELECT) forwards = false;
  else if (button === RIGHT_BUTTON || button === CURSOR_SELECT2) forwards = true;

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
    // Reveal *and* move in one press, as the rest of the collection does. The
    // grid is `w × h` in (x, y); the cursor is too, transposed from Range's
    // own `(r, c)` at the boundary.
    moveCursor(ui.cursor, button, w, h);
    return UI_UPDATE;
  }

  if (forwards === null) return null;

  const cell = grid[idx(r, c, w)];
  if (cell > 0) return null; // clue cell — inert
  const value = cycle(cell, forwards);
  if (!value) return null;
  return { sets: [{ r, c, value }] };
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
      const cell = idx(r, c, orig.w);
      if (solution[cell] <= 0) {
        sets.push({ r, c, value: solution[cell] === BLACK ? "black" : "white" });
      }
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
      if (v !== BLACK && v !== WHITE) continue; // clue or undecided
      const sol = solution[cell];
      if ((v === BLACK && sol !== BLACK) || (v === WHITE && sol !== WHITE)) {
        out.push({ r, c });
      }
    }
  }
  return out;
}

// --- hint ------------------------------------------------------------------

/** Highlight data for a Range hint step. `target` is the cell the
 * deduction forces (and the mark it forces). `area` is the deduction's
 * evidence to shade light-blue — the clue's line of sight, the line it
 * must reach along, or the white cells a cut would isolate — so a
 * beginner can *see* the reasoning, not just the conclusion (the
 * Palisade region-highlight convention). `blackRefs` are black premise
 * cells (an adjacent black) that stay black and are ringed instead. */
export interface RangeHint {
  target: { r: number; c: number; value: RangeCellValue };
  area: { r: number; c: number }[];
  blackRefs?: { r: number; c: number }[];
  /** The clue driving a line-of-sight deduction, its digit recolored
   * `COL_HINT`. A clue sits *inside* its own shaded line of sight, and a
   * board can put two clues of the same value in one such run — seen live on
   * `9x6` seed `range-a`, where "Clue 5" named either of two shaded 5s. The
   * value is not a name when the value repeats, so the driving one is marked
   * (Light Up's recolored digit, the same element-type legend). */
  clue?: { r: number; c: number };
}

const DR = [1, 0, -1, 0];
const DC = [0, 1, 0, -1];

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
): { r: number; c: number }[] {
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
function reachLine(
  cr: number,
  cc: number,
  tr: number,
  tc: number,
): { r: number; c: number }[] {
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
): { r: number; c: number }[] {
  const out: { r: number; c: number }[] = [];
  for (let j = 0; j < 4; j++) {
    const r = cr + DR[j];
    const c = cc + DC[j];
    if (!outOfBounds(r, c, w, h) && grid[idx(r, c, w)] !== BLACK) out.push({ r, c });
  }
  return out;
}

/** Narrate *why* the move is forced, per the deduction rule, referencing
 * the highlighted evidence so the words and the picture agree.
 *
 * **Every Range step shows a second mark** — a shaded area, or (for
 * `adjacency`) a ringed black premise — so no branch may leave "this cell"
 * bare: with two marks in view a bare deictic points at neither
 * (`disambiguate-hint-deixis`). The tie is the relation the rule itself
 * guarantees, never a color name:
 *
 * - `satisfied` / `overrun` place the target at `1 + rl[RUN_WHITE][j]` steps
 *   from the clue — that is, the **first cell past the shaded run** in one of
 *   the clue's four directions (past the clue itself where the run is empty,
 *   and the clue is shaded too).
 * - `reach` walks outward from the clue and `buildHighlights` shades the whole
 *   path behind the target, so the target is the run's **far end**.
 * - `connect` shades exactly the target's own non-black neighbors, so they are
 *   the cells **around it**.
 *
 * The three clue rules say *"the highlighted N"* rather than *"clue N"* for the
 * same reason in the other direction: a clue lies inside its own shaded line of
 * sight, and that run can hold a second clue of the same value, so the digit is
 * marked and the sentence points at the mark (see `RangeHint.clue`). */
function narrate(reason: HintReason): string {
  switch (reason.kind) {
    case "adjacency":
      return "No two black squares may touch. This cell sits right next to the ringed black square, so it must be white.";
    case "satisfied":
      return `The highlighted ${reason.n} can already see exactly ${reason.n} white cells (outlined). That count is complete, so its line of sight must stop at this cell, the next one out past the outlined run, which must be black.`;
    case "overrun":
      return `The highlighted ${reason.n} already sees the outlined white cells. Leaving this cell, the next one out past the outlined run, white would let it see more than ${reason.n}, so it must be black.`;
    case "reach":
      return `The highlighted ${reason.n} can't yet see ${reason.n} cells. The only way to reach ${reason.n} is to extend its line of sight along the outlined run as far as this cell, so this cell must be white.`;
    case "connect":
      // Both `ruleConnectedness` call sites record WHITE, so there is no
      // black-target branch to write: a cut vertex of the white region is
      // forced *white*, never black.
      return "Every white cell must join one connected group. Painting this cell black would cut the outlined cells around it off from the rest, so it must stay white.";
  }
}

function gridValueToCell(v: number): RangeCellValue {
  return v === BLACK ? "black" : v === WHITE ? "white" : "empty";
}

/** Build the highlight payload for a forced move: the area to shade and
 * any black premise cells to ring, derived from the deduction's reason. */
function buildHighlights(
  grid: Int8Array,
  w: number,
  h: number,
  reason: HintReason,
  target: { r: number; c: number; value: RangeCellValue },
): RangeHint {
  const hint = buildHighlightsInner(grid, w, h, reason, target);
  // The working-grid snapshot already has this move applied, so a
  // line-of-sight area could include the target; the target owns the
  // blue COL_HINT cell, never the light-blue area.
  hint.area = hint.area.filter((a) => !(a.r === target.r && a.c === target.c));
  return hint;
}

function buildHighlightsInner(
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
      const seen = lineOfSight(grid, w, h, reason.clue.r, reason.clue.c);
      const path = reachLine(reason.clue.r, reason.clue.c, target.r, target.c);
      const key = (cell: { r: number; c: number }) => idx(cell.r, cell.c, w);
      const byKey = new Map<number, { r: number; c: number }>();
      for (const cell of [...seen, ...path]) byKey.set(key(cell), cell);
      return { target, area: [...byKey.values()], clue: reason.clue };
    }
    case "connect":
      return { target, area: nonBlackNeighbors(grid, w, h, target.r, target.c) };
  }
}

function hint(state: RangeState): HintResult<RangeMove, RangeHint> {
  const refusal = commonHintRefusal(state.completed, findMistakes(state).length);
  if (refusal) return refusal;
  const plan = deduceHintPlan(state.grid, state.w, state.h);
  if (plan.length === 0) {
    return { ok: false, error: DEDUCTION_EXHAUSTED };
  }
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
  if (m.solve) return "off";
  const t = step.highlights?.target;
  if (!t) return "off";
  const sets = m.sets.filter((s) => s.r === t.r && s.c === t.c);
  if (sets.length === 0) return "off";
  return sets[sets.length - 1].value === t.value ? "completed" : "off";
}

function flashLength(
  from: RangeState,
  to: RangeState,
  _dir: number,
  _ui: RangeUi,
): number {
  return winFlash(from, to, FLASH_TIME);
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

  colors: (defaultBackground: Color): Color[] => colors(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: RangeParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(rangeGame);
