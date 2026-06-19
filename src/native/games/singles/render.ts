/**
 * Singles (Hitori) rendering — port of `game_redraw` / `tile_redraw` in
 * `singles.c`. A per-tile diffed loop draws a grid-outlined tile (black or
 * error fill for a blackened cell, lowlight under the completion flash,
 * otherwise the background), a circle ring for a white mark, the cell
 * number (always for a white cell; on a black cell only when the
 * show-black-numbers preference is on), cursor corner brackets, and a red
 * grid outline when the board is in an impossible state. Cells flagged by
 * Check & Save (`findMistakes`) get an inset error outline.
 */
import type { Colour, Size } from "../../../puzzle/types.ts";
import { mkhighlight } from "../../engine/colour-mkhighlight.ts";
import { drawRectOutline } from "../../engine/draw.ts";
import type { GameDrawing } from "../../engine/game.ts";
import {
  F_BLACK,
  F_CIRCLE,
  F_ERROR,
  type SinglesState,
  type SinglesUi,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 32;
export const FLASH_TIME = 0.7;

// --- palette (index-for-index with the upstream COL_* enum) ----------------

export const COL_BACKGROUND = 0;
export const COL_UNUSED1 = 1;
export const COL_LOWLIGHT = 2;
export const COL_BLACK = 3;
export const COL_WHITE = 4;
export const COL_BLACKNUM = 5;
export const COL_GRID = 6;
export const COL_CURSOR = 7;
export const COL_ERROR = 8;

export function colours(defaultBackground: Colour): Colour[] {
  const { background, lowlight } = mkhighlight(defaultBackground);
  const out: Colour[] = [];
  out[COL_BACKGROUND] = background;
  out[COL_UNUSED1] = [0, 0, 0];
  out[COL_LOWLIGHT] = lowlight;
  out[COL_BLACK] = [0, 0, 0];
  out[COL_WHITE] = [1, 1, 1];
  out[COL_BLACKNUM] = [0.4, 0.4, 0.4];
  out[COL_GRID] = lowlight; // COL_GRID == COL_LOWLIGHT
  out[COL_CURSOR] = [0.2, 0.8, 0];
  out[COL_ERROR] = [1, 0, 0];
  return out;
}

// --- geometry --------------------------------------------------------------

const border = (ts: number): number => Math.floor(ts / 2);
const crad = (ts: number): number => Math.floor(ts / 2) - 1;
const textsz = (ts: number): number => Math.floor((14 * crad(ts)) / 10) - 1;
const coord = (v: number, ts: number): number => v * ts + border(ts);

export function computeSize(p: { w: number; h: number }, ts: number): Size {
  return { w: ts * p.w + 2 * border(ts), h: ts * p.h + 2 * border(ts) };
}

// --- draw state ------------------------------------------------------------

const DS_BLACK = 0x1;
const DS_CIRCLE = 0x2;
const DS_CURSOR = 0x4;
const DS_BLACK_NUM = 0x8;
const DS_ERROR = 0x10;
const DS_FLASH = 0x20;
const DS_IMPOSSIBLE = 0x40;
const DS_MISTAKE = 0x80;

export interface SinglesDrawState {
  started: boolean;
  tilesize: number;
  w: number;
  h: number;
  cache: Int32Array;
}

export function newDrawState(state: SinglesState): SinglesDrawState {
  return {
    started: false,
    tilesize: 0,
    w: state.w,
    h: state.h,
    cache: new Int32Array(state.n).fill(-1),
  };
}

export function setTileSize(ds: SinglesDrawState, ts: number): void {
  ds.tilesize = ts;
}

// --- cursor corner brackets (misc.c draw_rect_corners) ---------------------

function drawRectCorners(
  dr: GameDrawing,
  cx: number,
  cy: number,
  r: number,
  col: number,
): void {
  const hr = Math.floor(r / 2);
  const segs: [number, number, number, number][] = [
    [cx - r, cy - r, cx - r, cy - hr],
    [cx - r, cy - r, cx - hr, cy - r],
    [cx - r, cy + r, cx - r, cy + hr],
    [cx - r, cy + r, cx - hr, cy + r],
    [cx + r, cy - r, cx + r, cy - hr],
    [cx + r, cy - r, cx + hr, cy - r],
    [cx + r, cy + r, cx + r, cy + hr],
    [cx + r, cy + r, cx + hr, cy + r],
  ];
  for (const [x0, y0, x1, y1] of segs) {
    dr.drawLine({ x: x0, y: y0 }, { x: x1, y: y1 }, col, 1);
  }
}

// --- tile drawing ----------------------------------------------------------

function tileRedraw(
  dr: GameDrawing,
  ts: number,
  x: number,
  y: number,
  num: number,
  f: number,
): void {
  let bg: number;
  let tcol: number;
  let dnum: boolean;

  if (f & DS_BLACK) {
    bg = f & DS_ERROR ? COL_ERROR : COL_BLACK;
    tcol = COL_BLACKNUM;
    dnum = !!(f & DS_BLACK_NUM);
  } else {
    bg = f & DS_FLASH ? COL_LOWLIGHT : COL_BACKGROUND;
    tcol = f & DS_ERROR ? COL_ERROR : COL_BLACK;
    dnum = true;
  }

  const cx = x + Math.floor(ts / 2);
  const cy = y + Math.floor(ts / 2);
  const cr = crad(ts);

  dr.drawRect({ x, y, w: ts, h: ts }, bg);
  drawRectOutline(dr, x, y, ts, ts, f & DS_IMPOSSIBLE ? COL_ERROR : COL_GRID);

  if (f & DS_CIRCLE) {
    dr.drawCircle({ x: cx, y: cy }, cr, tcol, tcol);
    dr.drawCircle({ x: cx, y: cy }, cr - 1, bg, tcol);
  }

  if (dnum) {
    const buf = String(num);
    const tsz = buf.length === 1 ? textsz(ts) : Math.floor((cr * 2 - 1) / buf.length);
    dr.drawText(
      { x: cx, y: cy },
      { align: "center", baseline: "mathematical", fontType: "variable", size: tsz },
      tcol,
      buf,
    );
  }

  if (f & DS_CURSOR)
    drawRectCorners(dr, cx, cy, Math.floor(textsz(ts) / 2), COL_CURSOR);

  // Check & Save: an inset error outline marks a cell contradicting the
  // unique solution (the fork's mistake overlay; not in upstream).
  if (f & DS_MISTAKE) {
    drawRectOutline(dr, x + 2, y + 2, ts - 4, ts - 4, COL_ERROR);
    drawRectOutline(dr, x + 3, y + 3, ts - 6, ts - 6, COL_ERROR);
  }

  dr.drawUpdate({ x, y, w: ts, h: ts });
}

// --- redraw ----------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: SinglesDrawState | null,
  _prev: SinglesState | null,
  state: SinglesState,
  _dir: number,
  ui: SinglesUi,
  _animTime: number,
  flashTime: number,
  _hint?: unknown,
  mistakes?: readonly { x: number; y: number }[],
): void {
  if (!ds) return;
  const ts = ds.tilesize;
  const { w, h } = state;

  if (!ds.started) {
    const size = computeSize({ w, h }, ts);
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_BACKGROUND);
    // The outer grid frame (one pixel outside the tile grid).
    drawRectOutline(
      dr,
      coord(0, ts) - 1,
      coord(0, ts) - 1,
      ts * w + 2,
      ts * h + 2,
      COL_GRID,
    );
    dr.drawUpdate({ x: 0, y: 0, w: size.w, h: size.h });
  }

  const flash = flashTime > 0 && Math.floor((flashTime * 5) / FLASH_TIME) % 2 === 1;
  const mistakeSet = mistakes ? new Set(mistakes.map((m) => m.y * w + m.x)) : null;

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const i = y * w + x;
      let f = 0;

      if (flash) f |= DS_FLASH;
      if (state.impossible) f |= DS_IMPOSSIBLE;
      if (ui.cshow && x === ui.cx && y === ui.cy) f |= DS_CURSOR;
      if (state.flags[i] & F_BLACK) {
        f |= DS_BLACK;
        if (ui.showBlackNums) f |= DS_BLACK_NUM;
      }
      if (state.flags[i] & F_CIRCLE) f |= DS_CIRCLE;
      if (state.flags[i] & F_ERROR) f |= DS_ERROR;
      if (mistakeSet?.has(i)) f |= DS_MISTAKE;

      if (!ds.started || ds.cache[i] !== f) {
        tileRedraw(dr, ts, coord(x, ts), coord(y, ts), state.nums[i], f);
        ds.cache[i] = f;
      }
    }
  }
  ds.started = true;
}
