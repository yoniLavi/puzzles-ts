/**
 * Sticks rendering — port of `game_redraw` in `puzzles/unreleased/sticks.c`.
 *
 * A per-tile diffed loop over a black grid backing: each cell is a full-tile
 * `COL_GRID` rect under a one-pixel-smaller fill (black for a wall,
 * background for a white cell), a green centre bar for a placed line, the
 * clue number as text (white on black cells, dark on white cells, red when
 * its constraint is currently violated), and a blue frame under the keyboard
 * cursor. The in-flight drag previews its accreted cells; on a fresh win the
 * lines blink off on alternate 0.1 s flash frames. `findMistakes` cells get
 * an inset red frame via an `OverlaySidecar` (playbook §3.2 — the overlay is
 * part of the diff key so Check & Save repaints an otherwise-unchanged
 * frame).
 *
 * Sticks is compiled with `NARROW_BORDERS` (cmake/platforms/webapp.cmake),
 * so `BORDER = tilesize / 10` — not the desktop `tilesize / 2` — and
 * `computeSize` subtracts 1 to meet the outer grid line.
 */
import type { Colour, Size } from "../../../puzzle/types.ts";
import type { GameDrawing } from "../../engine/game.ts";
import { OverlaySidecar } from "../../engine/overlay-sidecar.ts";
import { ERROR, INK, PAPER } from "../../engine/palette.ts";
import { STICKS_CURSOR, STICKS_LINE } from "../../engine/palette-games.ts";
import { findLiveErrors } from "./solver.ts";
import {
  F_BLOCK,
  F_HOR,
  F_VER,
  type SticksMistake,
  type SticksParams,
  type SticksState,
  type SticksUi,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 48;
const FLASH_FRAME = 0.1;
export const FLASH_TIME = FLASH_FRAME * 5;

// --- palette (upstream COL_* enum, index-for-index) -------------------------

export const COL_BACKGROUND = 0;
export const COL_GRID = 1;
export const COL_LINE = 2;
export const COL_NUMBER = 3;
export const COL_ERROR = 4;
export const COL_CURSOR = 5;

export function colours(defaultBackground: Colour): Colour[] {
  const out: Colour[] = [];
  out[COL_BACKGROUND] = defaultBackground;
  out[COL_GRID] = INK;
  out[COL_LINE] = STICKS_LINE;
  out[COL_NUMBER] = PAPER;
  out[COL_ERROR] = ERROR;
  out[COL_CURSOR] = STICKS_CURSOR;
  return out;
}

// --- geometry ---------------------------------------------------------------

export const border = (ts: number): number => Math.floor(ts / 10);

export function computeSize(p: SticksParams, ts: number): Size {
  // NARROW_BORDERS: -1 to match the grid outline drawn on first paint.
  return { w: p.w * ts + 2 * border(ts) - 1, h: p.h * ts + 2 * border(ts) - 1 };
}

// --- draw state -------------------------------------------------------------

// Cache flags above the tile bits (0..2: F_HOR | F_VER | F_BLOCK).
const F_ERR = 1 << 8;
const F_CUR = 1 << 9;
const F_FLASH = 1 << 10;

export interface SticksDrawState {
  started: boolean;
  tilesize: number;
  cache: Int32Array;
  mistakes: OverlaySidecar;
}

export function newDrawState(state: SticksState): SticksDrawState {
  return {
    started: false,
    tilesize: 0,
    cache: new Int32Array(state.w * state.h).fill(-1),
    mistakes: new OverlaySidecar(state.w * state.h),
  };
}

export function setTileSize(ds: SticksDrawState, ts: number): void {
  ds.tilesize = ts;
}

// --- cell drawing -----------------------------------------------------------

function drawTile(
  dr: GameDrawing,
  ts: number,
  x: number,
  y: number,
  tile: number,
  clue: number,
  error: boolean,
  cursor: boolean,
  mistake: boolean,
): void {
  const b = border(ts);
  const px = x * ts + b;
  const py = y * ts + b;

  dr.drawRect({ x: px, y: py, w: ts, h: ts }, COL_GRID);
  dr.drawRect(
    { x: px, y: py, w: ts - 1, h: ts - 1 },
    tile & F_BLOCK ? COL_GRID : COL_BACKGROUND,
  );

  if (tile & F_HOR) {
    dr.drawRect(
      { x: px, y: py + Math.floor((ts * 2) / 5), w: ts - 1, h: Math.floor(ts / 5) },
      COL_LINE,
    );
  }
  if (tile & F_VER) {
    dr.drawRect(
      { x: px + Math.floor((ts * 2) / 5), y: py, w: Math.floor(ts / 5), h: ts - 1 },
      COL_LINE,
    );
  }

  if (clue !== -1) {
    dr.drawText(
      { x: Math.floor((x + 0.5) * ts) + b, y: Math.floor((y + 0.5) * ts) + b },
      {
        align: "center",
        baseline: "mathematical",
        fontType: "variable",
        size: Math.floor(ts * 0.7),
      },
      error ? COL_ERROR : tile & F_BLOCK ? COL_NUMBER : COL_GRID,
      String(clue),
    );
  }

  if (mistake) {
    // Inset red frame: this placed line contradicts the unique solution
    // (Check & Save's overlay — distinct from the red clue-number live
    // errors, which recolour the text above).
    const thick = Math.floor(ts / 7);
    const margin = Math.floor(ts / 20);
    const inner = ts - 1 - 2 * margin;
    dr.drawRect({ x: px + margin, y: py + margin, w: inner, h: thick }, COL_ERROR);
    dr.drawRect({ x: px + margin, y: py + margin, w: thick, h: inner }, COL_ERROR);
    dr.drawRect(
      { x: px + margin, y: py + ts - 1 - margin - thick, w: inner, h: thick },
      COL_ERROR,
    );
    dr.drawRect(
      { x: px + ts - 1 - margin - thick, y: py + margin, w: thick, h: inner },
      COL_ERROR,
    );
  }

  if (cursor) {
    const t = Math.floor(ts / 12);
    dr.drawRect({ x: px, y: py, w: t, h: ts - 1 }, COL_CURSOR);
    dr.drawRect({ x: px, y: py, w: ts - 1, h: t }, COL_CURSOR);
    dr.drawRect({ x: px + ts - 1 - t, y: py, w: t, h: ts - 1 }, COL_CURSOR);
    dr.drawRect({ x: px, y: py + ts - 1 - t, w: ts - 1, h: t }, COL_CURSOR);
  }

  dr.drawUpdate({ x: px, y: py, w: ts, h: ts });
}

// --- redraw -----------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: SticksDrawState | null,
  _prev: SticksState | null,
  state: SticksState,
  _dir: number,
  ui: SticksUi,
  _animTime: number,
  flashTime: number,
  _hint?: unknown,
  mistakes?: readonly SticksMistake[],
): void {
  if (!ds) return;
  const ts = ds.tilesize;
  const { w, h, grid, numbers } = state;
  const b = border(ts);

  if (!ds.started) {
    const fullW = w * ts + 2 * b;
    const fullH = h * ts + 2 * b;
    dr.drawRect({ x: 0, y: 0, w: fullW, h: fullH }, COL_BACKGROUND);
    dr.drawUpdate({ x: 0, y: 0, w: fullW, h: fullH });
    // Outer grid frame (upstream: COORD(0) − tilesize/10 == 0); the per-tile
    // COL_GRID rects draw the interior lines.
    dr.drawRect({ x: 0, y: 0, w: fullW - 1, h: fullH - 1 }, COL_GRID);
    ds.started = true;
  }

  const flash = flashTime > 0 && Math.floor(flashTime / FLASH_FRAME) % 2 === 0;

  // Live clue violations, recomputed pure from the committed grid (upstream
  // stores the equivalent F_ERROR bits in the state; same verdicts).
  const errorList = findLiveErrors(state);
  const errorSet = errorList.length > 0 ? new Set(errorList) : null;

  // In-flight drag preview: cell index → previewed tile value.
  const dragMap = ui.drag.length > 0 ? new Map<number, number>() : null;
  if (dragMap) {
    for (let d = 0; d < ui.drag.length; d++) dragMap.set(ui.drag[d], ui.dragMove[d]);
  }

  ds.mistakes.clear();
  for (const m of mistakes ?? []) ds.mistakes.add(m.index, 1);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let tile = grid[i];

      const preview = !(tile & F_BLOCK) ? dragMap?.get(i) : undefined;
      if (preview !== undefined) tile = preview;

      if (flash) tile &= ~(F_HOR | F_VER);
      const cursor = ui.cursor && ui.cx === x && ui.cy === y;
      // A previewed (uncommitted) cell suppresses its error highlight — the
      // committed grid is what the error check ran on.
      const error = preview === undefined && (errorSet?.has(i) ?? false);

      const packed =
        (tile & 0x7) |
        (error ? F_ERR : 0) |
        (cursor ? F_CUR : 0) |
        (flash ? F_FLASH : 0);
      if (ds.cache[i] !== packed || ds.mistakes.stale(i)) {
        drawTile(
          dr,
          ts,
          x,
          y,
          tile,
          numbers[i],
          error,
          cursor,
          ds.mistakes.packed[i] !== 0,
        );
        ds.cache[i] = packed;
        ds.mistakes.commit(i);
      }
    }
  }
}
