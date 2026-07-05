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
import type { Colour, Point, Size } from "../../../puzzle/types.ts";
import type { Game, UiUpdate } from "../../engine/game.ts";
import { UI_UPDATE } from "../../engine/game.ts";
import { dimensionParamConfig } from "../../engine/params.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  gridCursorMove,
  isCursorMove,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
  MIDDLE_DRAG,
  MIDDLE_RELEASE,
  MOD_CTRL,
  MOD_SHFT,
  RIGHT_BUTTON,
  RIGHT_DRAG,
  RIGHT_RELEASE,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import type { RandomState } from "../../random/index.ts";
import { newTentsDesc } from "./generator.ts";
import {
  colours,
  computeSize,
  dragXform,
  FLASH_TIME,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  type TentsDrawState,
} from "./render.ts";
import { tentsSolve } from "./solver.ts";
import {
  BLANK,
  decodeParams,
  defaultParams,
  DIFF_COUNT,
  DIFF_NAMES,
  encodeParams,
  executeMove,
  NONTENT,
  newState,
  presets,
  status,
  TENT,
  type TentsMistake,
  type TentsMove,
  type TentsParams,
  type TentsState,
  type TentsUi,
  textFormat,
  TREE,
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
    dsx: -1,
    dsy: -1,
    dex: -1,
    dey: -1,
    dragButton: -1,
    dragOk: false,
    cx: 0,
    cy: 0,
    cursorVisible: false,
  };
}

const isMouseDrag = (b: number) =>
  b === LEFT_DRAG || b === MIDDLE_DRAG || b === RIGHT_DRAG;
const isMouseRelease = (b: number) =>
  b === LEFT_RELEASE || b === MIDDLE_RELEASE || b === RIGHT_RELEASE;

function interpretMove(
  state: TentsState,
  ui: TentsUi,
  ds: TentsDrawState | null,
  p: Point,
  rawButton: number,
): TentsMove | null | UiUpdate {
  const { w, h, grid } = state;
  const shift = rawButton & MOD_SHFT;
  const control = rawButton & MOD_CTRL;
  const button = stripModifiers(rawButton);
  const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE;
  // NARROW_BORDERS FROMCOORD: TLBORDER = 1.
  const fromCoord = (v: number) => Math.floor((v - 1 + ts) / ts) - 1;

  if (button === LEFT_BUTTON || button === RIGHT_BUTTON) {
    const x = fromCoord(p.x);
    const y = fromCoord(p.y);
    if (x < 0 || y < 0 || x >= w || y >= h) return null;
    ui.dragButton = button;
    ui.dsx = ui.dex = x;
    ui.dsy = ui.dey = y;
    ui.dragOk = true;
    ui.cursorVisible = false;
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
      if (Math.abs(x - ui.dsx) < Math.abs(y - ui.dsy)) x = ui.dsx;
      else y = ui.dsy;
      ui.dex = x;
      ui.dey = y;
      ui.dragOk = true;
    }

    if (isMouseDrag(button)) return UI_UPDATE;

    // Release — enact the drag.
    if (!ui.dragOk) {
      ui.dragButton = -1;
      return UI_UPDATE;
    }
    const xmin = Math.min(ui.dsx, ui.dex);
    const xmax = Math.max(ui.dsx, ui.dex);
    const ymin = Math.min(ui.dsy, ui.dey);
    const ymax = Math.max(ui.dsy, ui.dey);
    const cells: { x: number; y: number; v: number }[] = [];
    for (let yy = ymin; yy <= ymax; yy++) {
      for (let xx = xmin; xx <= xmax; xx++) {
        const v = dragXform(ui, xx, yy, grid[yy * w + xx]);
        if (grid[yy * w + xx] !== v) cells.push({ x: xx, y: yy, v });
      }
    }
    ui.dragButton = -1;
    if (cells.length === 0) return UI_UPDATE;
    return { type: "cells", cells };
  }

  if (isCursorMove(button)) {
    const wasVisible = ui.cursorVisible;
    if (shift || control) {
      const idx0 = ui.cx + w * ui.cy;
      const moved = gridCursorMove(button, ui.cx, ui.cy, w, h);
      if (moved) {
        ui.cx = moved.x;
        ui.cy = moved.y;
      }
      ui.cursorVisible = true;
      const idx1 = ui.cx + w * ui.cy;
      const cells: { x: number; y: number; v: number }[] = [];
      const idxs = idx0 !== idx1 ? [idx0, idx1] : [idx0];
      for (const i of idxs) {
        if (grid[i] === BLANK || (control && grid[i] === TENT)) {
          cells.push({ x: i % w, y: Math.floor(i / w), v: NONTENT });
        }
      }
      if (cells.length) return { type: "cells", cells };
      return moved || !wasVisible ? UI_UPDATE : null;
    }
    const moved = gridCursorMove(button, ui.cx, ui.cy, w, h);
    if (moved) {
      ui.cx = moved.x;
      ui.cy = moved.y;
    }
    ui.cursorVisible = true;
    return moved || !wasVisible ? UI_UPDATE : null;
  }

  if (ui.cursorVisible) {
    const v = grid[ui.cy * w + ui.cx];
    let rep: number | null = null;
    if (v !== TREE) {
      if (button === CURSOR_SELECT) rep = v === BLANK ? TENT : BLANK;
      else if (button === CURSOR_SELECT2) rep = v === BLANK ? NONTENT : BLANK;
      else if (button === KEY_T || button === KEY_t) rep = TENT;
      else if (button === KEY_N || button === KEY_n) rep = NONTENT;
      else if (button === KEY_B || button === KEY_b) rep = BLANK;
    }
    if (rep !== null) {
      return { type: "cells", cells: [{ x: ui.cx, y: ui.cy, v: rep }] };
    }
  } else if (button === CURSOR_SELECT || button === CURSOR_SELECT2) {
    ui.cursorVisible = true;
    return UI_UPDATE;
  }

  return null;
}

function flashLength(
  oldState: TentsState,
  newState_: TentsState,
  _dir: number,
  _ui: TentsUi,
): number {
  return !oldState.completed &&
    newState_.completed &&
    !oldState.usedSolve &&
    !newState_.usedSolve
    ? FLASH_TIME
    : 0;
}

/** The unique solution to a board, from its trees + edge numbers only (never
 * the player's marks), or `null` when not uniquely deducible. */
function uniqueSolution(state: TentsState): Int8Array | null {
  const { w, h, grid, numbers } = state;
  const puzzle = new Int8Array(w * h);
  for (let i = 0; i < w * h; i++) puzzle[i] = grid[i] === TREE ? TREE : BLANK;
  const { ret, soln } = tentsSolve(w, h, puzzle, numbers, DIFF_COUNT - 1);
  return ret === 1 ? soln : null;
}

function solve(
  orig: TentsState,
  _curr: TentsState,
  aux?: string,
): ReturnType<NonNullable<Game<TentsParams, TentsState, TentsMove>["solve"]>> {
  if (aux) {
    // aux is "S;T<x>,<y>;…" — the generator's known solution.
    const tents: number[] = [];
    for (const part of aux.split(";")) {
      const m = /^T(\d+),(\d+)$/.exec(part);
      if (m) tents.push(Number(m[2]) * orig.w + Number(m[1]));
    }
    if (tents.length > 0) return { ok: true, move: { type: "solve", tents } };
  }
  const { w, h, grid, numbers } = orig;
  const puzzle = new Int8Array(w * h);
  for (let i = 0; i < w * h; i++) puzzle[i] = grid[i] === TREE ? TREE : BLANK;
  const { ret, soln } = tentsSolve(w, h, puzzle, numbers, DIFF_COUNT - 1);
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
  for (let i = 0; i < w * h; i++) if (soln[i] === TENT) tents.push(i);
  return { ok: true, move: { type: "solve", tents } };
}

/** Re-solve from the clues and flag every placed square that contradicts the
 * unique solution (a tent where none belongs, a non-tent where a tent
 * belongs). Blanks are never mistakes; a non-uniquely-solvable board yields
 * none. */
function findMistakes(state: TentsState): readonly TentsMistake[] {
  const soln = uniqueSolution(state);
  if (!soln) return [];
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
  needsRightButton: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,
  paramConfig: [
    ...dimensionParamConfig<TentsParams>(),
    {
      kw: "difficulty",
      name: "Difficulty",
      type: "choices",
      choices: [...DIFF_NAMES],
      get: (p) => p.diff,
      set: (p, v) => {
        p.diff = v;
      },
    },
  ],
  describeParams: (p) => ({
    width: String(p.w),
    height: String(p.h),
    difficulty: p.diff,
  }),

  newDesc: (p, rng: RandomState) => newTentsDesc(p, rng),
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
  computeSize: (p: TentsParams, ts: number): Size => computeSize(p, ts),
  setTileSize: (ds, ts) => {
    ds.tilesize = ts;
  },
  newDrawState,
  redraw: (dr, ds, prev, s, dir, ui, animTime, flashTime, _hint, mistakes) =>
    redraw(dr, ds, prev, s, dir, ui, animTime, flashTime, undefined, mistakes),

  flashLength,
};

registerGame(tentsGame);
