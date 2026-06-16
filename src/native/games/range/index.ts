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
import type { Colour, Point, Size } from "../../../puzzle/types.ts";
import {
  type Game,
  type SolveResult,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  cursorDelta,
  LEFT_BUTTON,
  MIDDLE_BUTTON,
  RIGHT_BUTTON,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import {
  colours,
  computeSize,
  FLASH_TIME,
  newDrawState,
  PREFERRED_TILE_SIZE,
  type RangeDrawState,
  redraw,
  setTileSize,
} from "./render.ts";
import { findErrors, fullSolve, generateGrid } from "./solver.ts";
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

const MOD_SHFT = 0x2000;
const MOD_MASK = 0x7800;

export interface RangeMistake {
  r: number;
  c: number;
}

function newUi(_state: RangeState): RangeUi {
  return { r: 0, c: 0, cursorShow: false };
}

function isMouseDown(button: number): boolean {
  return button === LEFT_BUTTON || button === MIDDLE_BUTTON || button === RIGHT_BUTTON;
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
  ds: RangeDrawState | null,
  p: Point,
  rawButton: number,
): RangeMove | null | UiUpdate {
  const { w, h, grid } = state;
  const shift = !!(rawButton & MOD_SHFT);
  const button = rawButton & ~MOD_MASK;

  if ((button === CURSOR_SELECT || button === CURSOR_SELECT2) && !ui.cursorShow) {
    return null;
  }

  let r = ui.r;
  let c = ui.c;

  if (isMouseDown(button)) {
    const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
    const border = Math.floor(ts / 2);
    const fromCoord = (v: number): number => Math.floor((v - border) / ts);
    r = fromCoord(p.y + ts) - 1;
    c = fromCoord(p.x + ts) - 1;
    if (outOfBounds(r, c, w, h)) return null;
    ui.r = r;
    ui.c = c;
    ui.cursorShow = false;
  }

  let forwards: boolean | null = null;
  if (button === LEFT_BUTTON || button === CURSOR_SELECT) forwards = false;
  else if (button === RIGHT_BUTTON || button === CURSOR_SELECT2) forwards = true;

  const delta = cursorDelta(button);
  if (delta) {
    if (!ui.cursorShow) {
      ui.cursorShow = true;
      return UI_UPDATE;
    }
    const dr = delta.dy;
    const dc = delta.dx;
    if (shift) {
      const preR = ui.r;
      const preC = ui.c;
      const doPre = grid[idx(preR, preC, w)] === EMPTY;
      if (outOfBounds(ui.r + dr, ui.c + dc, w, h)) {
        return doPre ? { sets: [{ r: preR, c: preC, value: "white" }] } : null;
      }
      ui.r += dr;
      ui.c += dc;
      const doPost = grid[idx(ui.r, ui.c, w)] === EMPTY;
      const sets: RangeMove["sets"] = [];
      if (doPre) sets.push({ r: preR, c: preC, value: "white" });
      if (doPost) sets.push({ r: ui.r, c: ui.c, value: "white" });
      return sets.length > 0 ? { sets } : UI_UPDATE;
    }
    if (!outOfBounds(ui.r + dr, ui.c + dc, w, h)) {
      ui.r += dr;
      ui.c += dc;
    }
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
  const next = cloneState(state);
  for (const { r, c, value } of move.sets) {
    if (outOfBounds(r, c, next.w, next.h)) throw new Error("Range move out of bounds");
    const cell = idx(r, c, next.w);
    if (next.grid[cell] > 0) throw new Error("Range move targets a clue cell");
    next.grid[cell] = cellValueToGrid(value);
  }
  if (move.solve) {
    next.hasCheated = true;
    next.wasSolved = true;
  } else if (!next.wasSolved) {
    next.wasSolved = !findErrors(next.grid, next.w, next.h);
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

function flashLength(
  from: RangeState,
  to: RangeState,
  _dir: number,
  _ui: RangeUi,
): number {
  if (!from.wasSolved && to.wasSolved && !to.hasCheated) return FLASH_TIME;
  return 0;
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

  newDesc: (p, rng) => ({ desc: encodeDesc(p.w * p.h, generateGrid(p, rng)) }),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status,

  solve,
  findMistakes,

  textFormat,

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: RangeParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(rangeGame);
