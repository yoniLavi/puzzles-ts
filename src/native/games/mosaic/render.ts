/**
 * Mosaic rendering — faithful port of `draw_cell` / `game_redraw` in
 * mosaic.c: a (width+1)×(height+1) per-cell diffed loop (the extra
 * margin row/column draws the closing grid lines and cursor edges),
 * with the completion flash inverting marked/blank in the first and
 * last thirds of the flash.
 */
import type { Colour, Size } from "../../../puzzle/types.ts";
import type { GameDrawing } from "../../engine/game.ts";
import {
  type MosaicMistake,
  type MosaicParams,
  type MosaicState,
  type MosaicUi,
  STATE_BLANK,
  STATE_ERROR,
  STATE_MARKED,
  STATE_SOLVED,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 32;
export const FLASH_TIME = 0.5;

// --- palette ---------------------------------------------------------------

export const COL_BACKGROUND = 0;
export const COL_UNMARKED = 1;
export const COL_GRID = 2;
export const COL_MARKED = 3;
export const COL_BLANK = 4;
export const COL_TEXT_SOLVED = 5;
export const COL_ERROR = 6;
export const COL_CURSOR = 7;
const COL_TEXT_DARK = COL_MARKED;
const COL_TEXT_LIGHT = COL_BLANK;

export function colours(defaultBackground: Colour): Colour[] {
  const out: Colour[] = [];
  out[COL_BACKGROUND] = defaultBackground;
  out[COL_UNMARKED] = [148 / 255, 196 / 255, 190 / 255];
  out[COL_GRID] = [0, 102 / 255, 99 / 255];
  out[COL_MARKED] = [20 / 255, 20 / 255, 20 / 255];
  out[COL_BLANK] = [236 / 255, 236 / 255, 236 / 255];
  out[COL_TEXT_SOLVED] = [100 / 255, 100 / 255, 100 / 255];
  out[COL_ERROR] = [1, 0, 0];
  out[COL_CURSOR] = [1, 200 / 255, 200 / 255];
  return out;
}

// --- geometry ---------------------------------------------------------------

const margin = (ts: number) => Math.floor(ts / 2);

export function computeSize(p: MosaicParams, ts: number): Size {
  return {
    w: p.width * ts + 2 * margin(ts),
    h: p.height * ts + 2 * margin(ts),
  };
}

// --- draw state ---------------------------------------------------------------

// Extra flags packed above the cell-state bits in the cache (upstream's
// DRAWFLAG_* values, plus our mistake-overlay bit).
const DRAWFLAG_CURSOR = 0x100;
const DRAWFLAG_CURSOR_U = 0x200;
const DRAWFLAG_CURSOR_L = 0x400;
const DRAWFLAG_CURSOR_UL = 0x800;
const DRAWFLAG_MARGIN_R = 0x1000;
const DRAWFLAG_MARGIN_D = 0x2000;
const DRAWFLAG_MISTAKE = 0x4000;

export interface MosaicDrawState {
  started: boolean;
  tilesize: number;
  width: number;
  height: number;
  /** (width+1)×(height+1) cache of last-drawn packed cell values; -1
   * forces a draw (the documented no-BigInt Int32Array pattern). */
  cache: Int32Array;
}

export function newDrawState(state: MosaicState): MosaicDrawState {
  return {
    started: false,
    tilesize: 0,
    width: state.width,
    height: state.height,
    cache: new Int32Array((state.width + 1) * (state.height + 1)).fill(-1),
  };
}

// --- cell drawing ---------------------------------------------------------------

function drawCell(
  dr: GameDrawing,
  cell: number,
  ts: number,
  clueVal: number,
  x: number,
  y: number,
): void {
  const startX = x * ts + margin(ts);
  const startY = y * ts + margin(ts);

  dr.clip({ x: startX - 1, y: startY - 1, w: ts, h: ts });

  // Top and left grid lines live inside this cell's tile; the margin
  // row/column draws only the closing lines of the previous cells.
  if (!(cell & DRAWFLAG_MARGIN_R)) {
    dr.drawRect(
      { x: startX - 1, y: startY - 1, w: ts, h: 1 },
      cell & (DRAWFLAG_CURSOR | DRAWFLAG_CURSOR_U) ? COL_CURSOR : COL_GRID,
    );
  }
  if (!(cell & DRAWFLAG_MARGIN_D)) {
    dr.drawRect(
      { x: startX - 1, y: startY - 1, w: 1, h: ts },
      cell & (DRAWFLAG_CURSOR | DRAWFLAG_CURSOR_L) ? COL_CURSOR : COL_GRID,
    );
  }
  if (cell & DRAWFLAG_CURSOR_UL) {
    dr.drawRect({ x: startX - 1, y: startY - 1, w: 1, h: 1 }, COL_CURSOR);
  }

  if (!(cell & (DRAWFLAG_MARGIN_R | DRAWFLAG_MARGIN_D))) {
    let colour: number;
    let textColour: number;
    if (cell & STATE_MARKED) {
      colour = COL_MARKED;
      textColour = COL_TEXT_LIGHT;
    } else if (cell & STATE_BLANK) {
      colour = COL_BLANK;
      textColour = COL_TEXT_DARK;
    } else {
      colour = COL_UNMARKED;
      textColour = COL_TEXT_DARK;
    }
    if (cell & STATE_ERROR) textColour = COL_ERROR;
    else if (cell & STATE_SOLVED) textColour = COL_TEXT_SOLVED;

    dr.drawRect({ x: startX, y: startY, w: ts - 1, h: ts - 1 }, colour);

    if (cell & DRAWFLAG_MISTAKE) {
      // Mistake overlay: an inset error-coloured outline.
      const t = Math.max(1, Math.floor(ts / 16));
      const inset = Math.max(1, Math.floor(ts / 8));
      const sx = startX + inset;
      const sy = startY + inset;
      const span = ts - 1 - 2 * inset;
      dr.drawRect({ x: sx, y: sy, w: span, h: t }, COL_ERROR);
      dr.drawRect({ x: sx, y: sy + span - t, w: span, h: t }, COL_ERROR);
      dr.drawRect({ x: sx, y: sy, w: t, h: span }, COL_ERROR);
      dr.drawRect({ x: sx + span - t, y: sy, w: t, h: span }, COL_ERROR);
    }

    if (clueVal >= 0) {
      dr.drawText(
        { x: startX + Math.floor(ts / 2) - 1, y: startY + Math.floor(ts / 2) - 1 },
        {
          align: "center",
          baseline: "mathematical",
          fontType: "variable",
          size: Math.floor((ts * 3) / 5),
        },
        textColour,
        String(clueVal),
      );
    }
  }

  dr.unclip();
  dr.drawUpdate({ x: startX - 1, y: startY - 1, w: ts, h: ts });
}

// --- redraw ---------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: MosaicDrawState | null,
  _prev: MosaicState | null,
  state: MosaicState,
  _dir: number,
  ui: MosaicUi,
  _animTime: number,
  flashTime: number,
  _hint?: unknown,
  mistakes?: readonly MosaicMistake[],
): void {
  if (!ds) return;
  const ts = ds.tilesize;
  const { width, height, board, cells } = state;

  if (!ds.started) {
    // The engine paints no pixels of its own; fill our own background.
    const size = computeSize({ width, height, aggressive: true }, ts);
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_BACKGROUND);
    ds.started = true;
  }

  // The flash inverts marked/blank during its first and last thirds.
  const flashing =
    flashTime > 0 && (flashTime <= FLASH_TIME / 3 || flashTime > (2 * FLASH_TIME) / 3);

  let mistakeSet: Set<number> | null = null;
  if (mistakes && mistakes.length > 0) {
    mistakeSet = new Set(mistakes.map((m) => m.y * width + m.x));
  }

  for (let y = 0; y <= height; y++) {
    for (let x = 0; x <= width; x++) {
      const inBounds = x < width && y < height;
      let cell = inBounds ? cells[y * width + x] : 0;
      if (x === width) cell |= DRAWFLAG_MARGIN_R;
      if (y === height) cell |= DRAWFLAG_MARGIN_D;
      if (flashing) cell ^= STATE_BLANK | STATE_MARKED;
      if (ui.cursorVisible) {
        if (ui.curX === x && ui.curY === y) cell |= DRAWFLAG_CURSOR;
        if (ui.curX === x - 1 && ui.curY === y) cell |= DRAWFLAG_CURSOR_L;
        if (ui.curX === x && ui.curY === y - 1) cell |= DRAWFLAG_CURSOR_U;
        if (ui.curX === x - 1 && ui.curY === y - 1) cell |= DRAWFLAG_CURSOR_UL;
      }
      if (mistakeSet?.has(y * width + x) && inBounds) cell |= DRAWFLAG_MISTAKE;

      const clueVal = inBounds ? board.clues[y * width + x] : -1;

      const cachePos = y * (width + 1) + x;
      if (ds.cache[cachePos] !== cell) {
        drawCell(dr, cell, ts, clueVal, x, y);
        ds.cache[cachePos] = cell;
      }
    }
  }
}
