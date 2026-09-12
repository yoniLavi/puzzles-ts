/**
 * Tents — native TS port of `tents.c`. Place a tent orthogonally next to each
 * tree in a one-to-one matching, no two tents even diagonally adjacent, and
 * each row/column holding its edge-clue number of tents.
 *
 * Input is drag-based (upstream): pressing a button starts a one-cell drag;
 * releasing enacts it. A left click sets a blank to a tent (or clears a
 * non-blank); a right click sets a blank to a non-tent; a right-drag paints
 * blanks to non-tents along one row/column. A keyboard cursor places
 * tents/non-tents via select/select2 and the literal keys T/N/B.
 */

import type { DifficultyContract } from "../../engine/difficulty.ts";
import { winFlash } from "../../engine/flash.ts";
import type { Game, SolveResult, UiUpdate } from "../../engine/game.ts";
import { UI_UPDATE } from "../../engine/game.ts";
import { fromCoord as fromCoordE } from "../../engine/geometry.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  endDrag,
  hideCursor,
  isCursorMove,
  isMouseDrag,
  isMouseRelease,
  LEFT_BUTTON,
  MOD_CTRL,
  MOD_SHFT,
  moveCursor,
  moveDrag,
  newCursor,
  newDrag,
  RIGHT_BUTTON,
  showCursor,
  startDrag,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import type { Point } from "../../engine/types.ts";
import { newTentsDesc } from "./generator.ts";
import {
  colors,
  computeSize,
  dragXform,
  FLASH_TIME,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  type TentsDrawState,
  TLBORDER,
} from "./render.ts";
import { tentsSolve } from "./solver.ts";
import {
  BLANK,
  DIFF_COUNT,
  decodeParams,
  defaultParams,
  encodeParams,
  executeMove,
  NONTENT,
  newState,
  paramConfig,
  presets,
  status,
  TENT,
  type TentsMistake,
  type TentsMove,
  type TentsParams,
  type TentsState,
  type TentsUi,
  TREE,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

// Keyboard letter codes (both cases, tolerant of frontend casing).
const KEY_T = "T".charCodeAt(0);
const KEY_t = "t".charCodeAt(0);
const KEY_N = "N".charCodeAt(0);
const KEY_n = "n".charCodeAt(0);
const KEY_B = "B".charCodeAt(0);
const KEY_b = "b".charCodeAt(0);

function newUi(_state: TentsState): TentsUi {
  return {
    drag: newDrag(),
    dragButton: -1,
    dragOk: false,
    cursor: newCursor(),
  };
}

function interpretMove(
  state: TentsState,
  ui: TentsUi,
  ds: TentsDrawState,
  p: Point,
  rawButton: number,
): TentsMove | null | UiUpdate {
  const { w, h, grid } = state;
  const shift = rawButton & MOD_SHFT;
  const control = rawButton & MOD_CTRL;
  const button = stripModifiers(rawButton);
  const ts = ds.tilesize;
  const fromCoord = (v: number) => fromCoordE(v, ts, TLBORDER);

  if (button === LEFT_BUTTON || button === RIGHT_BUTTON) {
    const x = fromCoord(p.x);
    const y = fromCoord(p.y);
    if (x < 0 || y < 0 || x >= w || y >= h) return null;
    ui.dragButton = button;
    startDrag(ui.drag, x, y);
    ui.dragOk = true;
    hideCursor(ui.cursor);
    return UI_UPDATE;
  }

  if ((isMouseDrag(button) || isMouseRelease(button)) && ui.dragButton >= 0) {
    let x = fromCoord(p.x);
    let y = fromCoord(p.y);
    if (x < 0 || y < 0 || x >= w || y >= h) {
      ui.dragOk = false;
    } else {
      // Drags are limited to one row or column: move the axis-nearer
      // coordinate back to the drag start.
      if (Math.abs(x - ui.drag.sx) < Math.abs(y - ui.drag.sy)) x = ui.drag.sx;
      else y = ui.drag.sy;
      moveDrag(ui.drag, x, y);
      ui.dragOk = true;
    }

    if (isMouseDrag(button)) return UI_UPDATE;

    // Release — enact the drag.
    if (!ui.dragOk) {
      ui.dragButton = -1;
      endDrag(ui.drag);
      return UI_UPDATE;
    }
    const xmin = Math.min(ui.drag.sx, ui.drag.ex);
    const xmax = Math.max(ui.drag.sx, ui.drag.ex);
    const ymin = Math.min(ui.drag.sy, ui.drag.ey);
    const ymax = Math.max(ui.drag.sy, ui.drag.ey);
    const cells: { x: number; y: number; v: number }[] = [];
    for (let yy = ymin; yy <= ymax; yy++) {
      for (let xx = xmin; xx <= xmax; xx++) {
        const v = dragXform(ui, xx, yy, grid[yy * w + xx]);
        if (grid[yy * w + xx] !== v) cells.push({ x: xx, y: yy, v });
      }
    }
    ui.dragButton = -1;
    endDrag(ui.drag);
    if (cells.length === 0) return UI_UPDATE;
    return { type: "cells", cells };
  }

  if (isCursorMove(button)) {
    // The shared helper carries the cursor; painting the cells it passed over
    // is Tents' own verb, so it reads the index either side of the move.
    const idx0 = ui.cursor.x + w * ui.cursor.y;
    const changed = moveCursor(ui.cursor, button, w, h);
    if (shift || control) {
      const idx1 = ui.cursor.x + w * ui.cursor.y;
      const cells: { x: number; y: number; v: number }[] = [];
      const idxs = idx0 !== idx1 ? [idx0, idx1] : [idx0];
      for (const i of idxs) {
        if (grid[i] === BLANK || (control && grid[i] === TENT)) {
          cells.push({ x: i % w, y: Math.floor(i / w), v: NONTENT });
        }
      }
      if (cells.length) return { type: "cells", cells };
    }
    return changed ? UI_UPDATE : null;
  }

  if (ui.cursor.visible) {
    const v = grid[ui.cursor.y * w + ui.cursor.x];
    let rep: number | null = null;
    if (v !== TREE) {
      if (button === CURSOR_SELECT) rep = v === BLANK ? TENT : BLANK;
      else if (button === CURSOR_SELECT2) rep = v === BLANK ? NONTENT : BLANK;
      else if (button === KEY_T || button === KEY_t) rep = TENT;
      else if (button === KEY_N || button === KEY_n) rep = NONTENT;
      else if (button === KEY_B || button === KEY_b) rep = BLANK;
    }
    if (rep !== null) {
      return { type: "cells", cells: [{ x: ui.cursor.x, y: ui.cursor.y, v: rep }] };
    }
  } else if (button === CURSOR_SELECT || button === CURSOR_SELECT2) {
    showCursor(ui.cursor);
    return UI_UPDATE;
  }

  return null;
}

/** Solve from the trees and edge numbers alone, never the player's marks.
 * `ret` is 1 when both the grid and the tent–tree links come out complete, 0
 * on an inconsistency the solver can prove, and 2 when it simply runs dry. */
function solveFromClues(state: TentsState, cap = DIFF_COUNT - 1) {
  const puzzle = Int8Array.from(state.grid, (v) => (v === TREE ? TREE : BLANK));
  return tentsSolve(state.w, state.h, puzzle, state.numbers, cap);
}

function solve(
  orig: TentsState,
  _curr: TentsState,
  aux?: string,
): SolveResult<TentsMove> {
  if (aux) {
    // aux is "S;T<x>,<y>;…" — the generator's known solution.
    const tents: number[] = [];
    for (const part of aux.split(";")) {
      const m = /^T(\d+),(\d+)$/.exec(part);
      if (m) tents.push(Number(m[2]) * orig.w + Number(m[1]));
    }
    if (tents.length > 0) return { ok: true, move: { type: "solve", tents } };
  }
  const { ret, soln } = solveFromClues(orig);
  if (ret !== 1) {
    return {
      ok: false,
      error:
        ret === 0
          ? "This puzzle is not self-consistent"
          : "Unable to find a unique solution for this puzzle",
    };
  }
  const tents: number[] = [];
  for (let i = 0; i < soln.length; i++) if (soln[i] === TENT) tents.push(i);
  return { ok: true, move: { type: "solve", tents } };
}

/** Re-solve from the clues and flag every placed square that contradicts the
 * unique solution (a tent where none belongs, a non-tent where a tent
 * belongs). Blanks are never mistakes; a non-uniquely-solvable board yields
 * none. */
function findMistakes(state: TentsState): readonly TentsMistake[] {
  const { ret, soln } = solveFromClues(state);
  if (ret !== 1) return [];
  const { w, h, grid } = state;
  const out: TentsMistake[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const g = grid[y * w + x];
      const s = soln[y * w + x];
      if (g === TENT && s !== TENT) out.push({ x, y, kind: "tent" });
      else if (g === NONTENT && s === TENT) out.push({ x, y, kind: "nontent" });
    }
  }
  return out;
}

/** Tents' difficulty contract (`engine/difficulty.ts`). */
const difficulty: DifficultyContract<TentsParams> = {
  tierOf: (p) => p.diff,
  withTier: (p, tier) => ({ ...p, diff: tier }),
  solveAtCap: (p, desc, cap) => {
    const { ret } = solveFromClues(newState(p, desc), cap);
    return ret === 1 ? "solved" : ret === 0 ? "impossible" : "unsolved";
  },
};

export const tentsGame: Game<
  TentsParams,
  TentsState,
  TentsMove,
  TentsUi,
  TentsDrawState,
  TentsMistake
> = {
  id: "tents",
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
  describeParams: (p) => ({
    width: String(p.w),
    height: String(p.h),
    difficulty: p.diff,
  }),

  newDesc: newTentsDesc,
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status,

  solve,
  difficulty,
  findMistakes,

  textFormat,

  colors,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize,
  setTileSize: (ds, ts) => {
    ds.tilesize = ts;
  },
  newDrawState,
  redraw,

  flashLength: (from, to) => winFlash(from, to, FLASH_TIME),
};

registerGame(tentsGame);
