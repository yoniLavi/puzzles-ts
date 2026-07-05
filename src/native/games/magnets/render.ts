/**
 * Magnets rendering — faithful port of `game_redraw` / `draw_tile` /
 * `draw_tile_col` / `draw_sym` / `draw_num` in `magnets.c`. Rounded-corner
 * dominoes (borrowed from dominosa), `+`/`−` magnet symbols, a green neutral
 * cross, a blue not-neutral `?`, singleton black squares, and the `+`/`−` clue
 * counts on all four borders with the corner `+`/`−` symbols.
 *
 * Geometry note: the web C build defines `NARROW_BORDERS`
 * (cmake/platforms/webapp.cmake), so `BORDER = 0` and the canvas is
 * `(w+2) × (h+2)` tiles (a one-tile clue margin each side + the play area).
 *
 * The per-tile cache packs the cell value plus every overlay (set / error /
 * cursor / not-flags / flash / mistake) into one `Int32Array` word, so the
 * diff key covers every overlay (playbook §3.2); the four-border clue colours
 * diff parallel per-clue arrays.
 */
import type { Colour, Size } from "../../../puzzle/types.ts";
import { mkhighlight } from "../../engine/colour-mkhighlight.ts";
import type { GameDrawing } from "../../engine/game.ts";
import {
  COLUMN,
  clueIndex,
  countRowcol,
  EMPTY,
  GS_ERROR,
  GS_NOTNEGATIVE,
  GS_NOTNEUTRAL,
  GS_NOTPOSITIVE,
  GS_SET,
  type MagnetsMistake,
  type MagnetsParams,
  type MagnetsState,
  type MagnetsUi,
  NEGATIVE,
  NEUTRAL,
  POSITIVE,
  ROW,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 32;
export const FLASH_TIME = 0.7;

// --- palette (mirrors the magnets.c colour enum index-for-index) ----------
export const COL_BACKGROUND = 0;
export const COL_HIGHLIGHT = 1;
export const COL_LOWLIGHT = 2;
export const COL_TEXT = 3;
export const COL_ERROR = 4;
export const COL_CURSOR = 5;
export const COL_DONE = 6;
export const COL_NEUTRAL = 7;
export const COL_NEGATIVE = 8;
export const COL_POSITIVE = 9;
export const COL_NOT = 10;
// Fork mistake overlay, appended past the upstream enum.
export const COL_MISTAKE = 11;

export function colours(defaultBackground: Colour): Colour[] {
  const { background, highlight, lowlight } = mkhighlight(defaultBackground);
  const out: Colour[] = [];
  out[COL_BACKGROUND] = background;
  out[COL_HIGHLIGHT] = highlight;
  out[COL_LOWLIGHT] = lowlight;
  out[COL_TEXT] = [0, 0, 0];
  out[COL_ERROR] = [1, 0, 0];
  out[COL_CURSOR] = [0.9, 0.9, 0.9];
  out[COL_DONE] = [background[0] / 1.5, background[1] / 1.5, background[2] / 1.5];
  out[COL_NEUTRAL] = [0.1, 0.6, 0.1];
  out[COL_NEGATIVE] = [0, 0, 0];
  out[COL_POSITIVE] = [0.8, 0, 0];
  out[COL_NOT] = [0.2, 0.2, 1];
  out[COL_MISTAKE] = [0.85, 0, 0];
  return out;
}

// --- packed tile bits (DS_*; which in the low nibble) ---------------------
const DS_WHICH_MASK = 0xf;
const DS_ERROR = 0x10;
const DS_CURSOR = 0x20;
const DS_SET = 0x40;
const DS_NOTPOS = 0x80;
const DS_NOTNEG = 0x100;
const DS_NOTNEU = 0x200;
const DS_FLASH = 0x400;
const DS_MISTAKE = 0x800; // fork overlay

// --- geometry (NARROW_BORDERS: BORDER = 0) --------------------------------
const BORDER = 0;
const coord = (n: number, ts: number) => (n + 1) * ts + BORDER;

export function computeSize(p: MagnetsParams, ts: number): Size {
  return { w: ts * (p.w + 2) + 2 * BORDER, h: ts * (p.h + 2) + 2 * BORDER };
}

// --- draw state -----------------------------------------------------------

export interface MagnetsDrawState {
  started: boolean;
  tilesize: number;
  w: number;
  h: number;
  /** Last-drawn packed word per tile; −1 forces a draw. */
  what: Int32Array;
  /** Last-drawn colour per column clue (3·w: [neutral,+,−]); −1 forces. */
  colwhat: Int32Array;
  /** Last-drawn colour per row clue (3·h). */
  rowwhat: Int32Array;
}

export function newDrawState(state: MagnetsState): MagnetsDrawState {
  return {
    started: false,
    tilesize: 0,
    w: state.w,
    h: state.h,
    what: new Int32Array(state.wh).fill(-1),
    colwhat: new Int32Array(state.w * 3).fill(-1),
    rowwhat: new Int32Array(state.h * 3).fill(-1),
  };
}

// --- symbol / tile drawing ------------------------------------------------

function drawSym(
  dr: GameDrawing,
  ts: number,
  x: number,
  y: number,
  which: number,
  col: number,
): void {
  const cx = coord(x, ts);
  const cy = coord(y, ts);
  const ccx = cx + Math.floor(ts / 2);
  const ccy = cy + Math.floor(ts / 2);
  const roff = Math.floor(ts / 4);
  const rsz = 2 * roff + 1;
  const soff = Math.floor(ts / 16);
  const ssz = 2 * soff + 1;

  if (which === POSITIVE || which === NEGATIVE) {
    dr.drawRect({ x: ccx - roff, y: ccy - soff, w: rsz, h: ssz }, col);
    if (which === POSITIVE) {
      dr.drawRect({ x: ccx - soff, y: ccy - roff, w: ssz, h: rsz }, col);
    }
  } else if (col === COL_NOT) {
    dr.drawText(
      { x: ccx, y: ccy },
      {
        align: "center",
        baseline: "mathematical",
        fontType: "variable",
        size: Math.floor((7 * ts) / 10),
      },
      col,
      "?",
    );
  } else {
    dr.drawLine(
      { x: ccx - roff, y: ccy - roff },
      { x: ccx + roff, y: ccy + roff },
      col,
      1,
    );
    dr.drawLine(
      { x: ccx + roff, y: ccy - roff },
      { x: ccx - roff, y: ccy + roff },
      col,
      1,
    );
  }
}

const TYPE_L = 0;
const TYPE_R = 1;
const TYPE_T = 2;
const TYPE_B = 3;

/** Fill the domino covering `(x, y)` with `bg` (rounded outer corners), then
 * draw its symbol in `fg` (skip when `fg < 0`). NOT responsible for the tile
 * background or draw_update. Upstream draw_tile_col. */
function drawTileCol(
  dr: GameDrawing,
  ds: MagnetsDrawState,
  dominoes: Int32Array,
  x: number,
  y: number,
  which: number,
  bg: number,
  fg: number,
  perc: number,
): void {
  const ts = ds.tilesize;
  const cx = coord(x, ts);
  const cy = coord(y, ts);
  const gutter =
    Math.floor(ts / 16) + Math.floor(((100 - perc) * (7 * Math.floor(ts / 16))) / 100);
  const radius = Math.floor((perc * Math.floor(ts / 8)) / 100);
  const coffset = gutter + radius;

  const i = y * ds.w + x;
  const other = dominoes[i];
  if (other === i) return;
  let type = TYPE_B;
  if (other === i + 1) type = TYPE_L;
  else if (other === i - 1) type = TYPE_R;
  else if (other === i + ds.w) type = TYPE_T;
  else if (other === i - ds.w) type = TYPE_B;

  const circ = (px: number, py: number) =>
    dr.drawCircle({ x: px, y: py }, radius, bg, bg);
  if (type === TYPE_L || type === TYPE_T) circ(cx + coffset, cy + coffset);
  if (type === TYPE_R || type === TYPE_T) circ(cx + ts - 1 - coffset, cy + coffset);
  if (type === TYPE_L || type === TYPE_B) circ(cx + coffset, cy + ts - 1 - coffset);
  if (type === TYPE_R || type === TYPE_B)
    circ(cx + ts - 1 - coffset, cy + ts - 1 - coffset);

  for (let k = 0; k < 2; k++) {
    let x1 = cx + (k ? gutter : coffset);
    let y1 = cy + (k ? coffset : gutter);
    let x2 = cx + ts - 1 - (k ? gutter : coffset);
    let y2 = cy + ts - 1 - (k ? coffset : gutter);
    if (type === TYPE_L) x2 = cx + ts;
    else if (type === TYPE_R) x1 = cx;
    else if (type === TYPE_T) y2 = cy + ts;
    else if (type === TYPE_B) y1 = cy;
    dr.drawRect({ x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 }, bg);
  }

  if (fg !== -1) drawSym(dr, ts, x, y, which, fg);
}

function drawTile(
  dr: GameDrawing,
  ds: MagnetsDrawState,
  dominoes: Int32Array,
  x: number,
  y: number,
  packed: number,
): void {
  const ts = ds.tilesize;
  const cx = coord(x, ts);
  const cy = coord(y, ts);
  let which = packed & DS_WHICH_MASK;
  const flags = packed & ~DS_WHICH_MASK;
  let perc = 100;

  dr.drawRect({ x: cx, y: cy, w: ts, h: ts }, COL_BACKGROUND);

  let bg: number;
  if (flags & DS_CURSOR) bg = COL_CURSOR;
  else if (which === POSITIVE) bg = COL_POSITIVE;
  else if (which === NEGATIVE) bg = COL_NEGATIVE;
  else if (flags & DS_SET) bg = COL_NEUTRAL;
  else bg = COL_LOWLIGHT;

  let fg: number;
  if (which === EMPTY && !(flags & DS_SET)) {
    let notwhich = -1;
    fg = -1;
    if (flags & DS_NOTPOS) notwhich = POSITIVE;
    if (flags & DS_NOTNEG) notwhich = NEGATIVE;
    if (flags & DS_NOTNEU) notwhich = NEUTRAL;
    if (notwhich !== -1) {
      which = notwhich;
      fg = COL_NOT;
    }
  } else {
    fg = flags & DS_ERROR ? COL_ERROR : flags & DS_CURSOR ? COL_TEXT : COL_BACKGROUND;
  }

  if (flags & DS_FLASH) {
    drawTileCol(dr, ds, dominoes, x, y, which, COL_HIGHLIGHT, -1, perc);
    perc = Math.floor((3 * perc) / 4);
  }
  drawTileCol(dr, ds, dominoes, x, y, which, bg, fg, perc);

  // Fork findMistakes overlay: an inset red outline (distinct from symbol red).
  if (flags & DS_MISTAKE) {
    const thick = Math.max(1, Math.floor(ts / 16));
    const inset = Math.max(2, Math.floor(ts / 8));
    const sx = cx + inset;
    const sy = cy + inset;
    const span = ts - 2 * inset;
    dr.drawRect({ x: sx, y: sy, w: span, h: thick }, COL_MISTAKE);
    dr.drawRect({ x: sx, y: sy + span - thick, w: span, h: thick }, COL_MISTAKE);
    dr.drawRect({ x: sx, y: sy, w: thick, h: span }, COL_MISTAKE);
    dr.drawRect({ x: sx + span - thick, y: sy, w: thick, h: span }, COL_MISTAKE);
  }

  dr.drawUpdate({ x: cx, y: cy, w: ts, h: ts });
}

// --- clue numbers ---------------------------------------------------------

function drawNum(
  dr: GameDrawing,
  ds: MagnetsDrawState,
  rowcol: number,
  which: number,
  idx: number,
  colbg: number,
  col: number,
  num: number,
): void {
  if (num < 0) return;
  const ts = ds.tilesize;
  const buf = String(num);
  const tsz =
    buf.length === 1
      ? Math.floor((7 * ts) / 10)
      : Math.floor((9 * ts) / 10 / buf.length);

  let cx: number;
  let cy: number;
  if (rowcol === ROW) {
    cx = BORDER + (which === NEGATIVE ? ts * (ds.w + 1) : 0);
    cy = BORDER + ts * (idx + 1);
  } else {
    cx = BORDER + ts * (idx + 1);
    cy = BORDER + (which === NEGATIVE ? ts * (ds.h + 1) : 0);
  }

  dr.drawRect({ x: cx, y: cy, w: ts, h: ts }, colbg);
  dr.drawText(
    { x: cx + Math.floor(ts / 2), y: cy + Math.floor(ts / 2) },
    { align: "center", baseline: "mathematical", fontType: "variable", size: tsz },
    col,
    buf,
  );
  dr.drawUpdate({ x: cx, y: cy, w: ts, h: ts });
}

function getCountColour(
  state: MagnetsState,
  rowcol: number,
  which: number,
  index: number,
  target: number,
): number {
  const { w, h } = state;
  const count = countRowcol(state, index, rowcol, which);
  if (
    count > target ||
    (count < target && countRowcol(state, index, rowcol, -1) === 0)
  ) {
    return COL_ERROR;
  }
  const idx =
    rowcol === COLUMN
      ? clueIndex(w, h, index, which === POSITIVE ? -1 : h)
      : clueIndex(w, h, which === POSITIVE ? -1 : w, index);
  if (state.countsDone[idx]) return COL_DONE;
  return COL_TEXT;
}

// --- redraw ---------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: MagnetsDrawState | null,
  _prev: MagnetsState | null,
  state: MagnetsState,
  _dir: number,
  ui: MagnetsUi,
  _animTime: number,
  flashTime: number,
  mistakes?: readonly MagnetsMistake[],
): void {
  if (!ds) return;
  const ts = ds.tilesize;
  const { w, h, grid, flags, common } = state;
  const { dominoes, colcount, rowcount } = common;

  const flash = Math.floor((flashTime * 5) / FLASH_TIME) % 2 !== 0;

  if (!ds.started) {
    const size = computeSize({ w, h, diff: 0, stripclues: false }, ts);
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_BACKGROUND);
    // Corner +/− symbols.
    drawSym(dr, ts, -1, -1, POSITIVE, COL_TEXT);
    drawSym(dr, ts, w, h, NEGATIVE, COL_TEXT);
    dr.drawUpdate({ x: 0, y: 0, w: size.w, h: size.h });
  }

  const mistakeSet = new Set<number>();
  if (mistakes) for (const m of mistakes) mistakeSet.add(m.y * w + m.x);

  const cx = ui.cursorVisible ? ui.curX : -1;
  const cy = ui.cursorVisible ? ui.curY : -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      let c = grid[idx];
      if (flags[idx] & GS_ERROR) c |= DS_ERROR;
      if (flags[idx] & GS_SET) c |= DS_SET;
      if (x === cx && y === cy) c |= DS_CURSOR;
      if (flash) c |= DS_FLASH;
      if (flags[idx] & GS_NOTPOSITIVE) c |= DS_NOTPOS;
      if (flags[idx] & GS_NOTNEGATIVE) c |= DS_NOTNEG;
      if (flags[idx] & GS_NOTNEUTRAL) c |= DS_NOTNEU;
      if (mistakeSet.has(idx)) c |= DS_MISTAKE;
      if (ds.what[idx] !== c) {
        drawTile(dr, ds, dominoes, x, y, c);
        ds.what[idx] = c;
      }
    }
  }

  // Clue counts around the four borders.
  for (const which of [POSITIVE, NEGATIVE]) {
    for (let i = 0; i < w; i++) {
      const index = i * 3 + which;
      const target = colcount[index];
      const colour = getCountColour(state, COLUMN, which, i, target);
      if (ds.colwhat[index] !== colour) {
        drawNum(dr, ds, COLUMN, which, i, COL_BACKGROUND, colour, target);
        ds.colwhat[index] = colour;
      }
    }
    for (let i = 0; i < h; i++) {
      const index = i * 3 + which;
      const target = rowcount[index];
      const colour = getCountColour(state, ROW, which, i, target);
      if (ds.rowwhat[index] !== colour) {
        drawNum(dr, ds, ROW, which, i, COL_BACKGROUND, colour, target);
        ds.rowwhat[index] = colour;
      }
    }
  }

  ds.started = true;
}
