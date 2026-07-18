/**
 * Pearl rendering — faithful port of `game_redraw` / `draw_square` /
 * `draw_lines_specific` / `game_colours` / `game_compute_size` (pearl.c),
 * using the `NARROW_BORDERS` geometry the web build compiles (border =
 * BORDER_WIDTH + 1, not a half/eighth-tile gutter).
 *
 * Two appearance styles select off the `appearance` preference on the Ui:
 * traditional Masyu (square cell outlines + a full grid border) and loopy
 * (centre dots + inter-cell grid lines). A per-cell packed `Int32Array`
 * cache mirrors upstream's `lflags`; the `findMistakes` wrong-edge overlay
 * rides its own bit field in that word so it is part of the diff key
 * (playbook §3.2). The palette is index-for-index with the C colour enum
 * (dark-mode `paletteOverrides` in augmentation.ts target indices 0/3/4).
 */
import type { Colour, Size } from "../../../puzzle/types.ts";
import { mkhighlight } from "../../engine/colour-mkhighlight.ts";
import type { GameDrawing } from "../../engine/game.ts";
import { interpretUiDrag } from "./moves.ts";
import {
  CW,
  D,
  DX,
  DY,
  ERROR_CLUE,
  F,
  L,
  NOCLUE,
  type PearlParams,
  type PearlState,
  type PearlUi,
  R,
  STRAIGHT,
  U,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 31;
export const FLASH_TIME = 0.5;

// --- palette (index-for-index with the pearl.c colour enum) ---------------
export const COL_BACKGROUND = 0;
export const COL_HIGHLIGHT = 1;
export const COL_LOWLIGHT = 2;
export const COL_CURSOR_BACKGROUND = COL_LOWLIGHT;
export const COL_BLACK = 3;
export const COL_WHITE = 4;
export const COL_ERROR = 5;
export const COL_GRID = 6;
export const COL_FLASH = 7;
export const COL_DRAGON = 8;
export const COL_DRAGOFF = 9;
export const COL_MISTAKE = 10; // appended past the C enum (findMistakes overlay)

export function colours(defaultBackground: Colour): Colour[] {
  const { background, highlight, lowlight } = mkhighlight(defaultBackground);
  const out: Colour[] = [];
  out[COL_BACKGROUND] = background;
  out[COL_HIGHLIGHT] = highlight;
  out[COL_LOWLIGHT] = lowlight;
  out[COL_BLACK] = [0, 0, 0];
  out[COL_WHITE] = [1, 1, 1];
  out[COL_GRID] = [0.4, 0.4, 0.4];
  out[COL_ERROR] = [1, 0, 0];
  out[COL_FLASH] = [1, 1, 1];
  out[COL_DRAGON] = [0, 0, 1];
  out[COL_DRAGOFF] = [0.8, 0.8, 1];
  out[COL_MISTAKE] = [1, 0, 0];
  return out;
}

// --- appearance styles (upstream gui_style) -------------------------------
export const GUI_MASYU = 0;
export const GUI_LOOPY = 1;

// --- drawstate flag bits (upstream DS_*) ----------------------------------
const DS_ESHIFT = 4; // R/U/L/D shift, error flags
const DS_DSHIFT = 8; // R/U/L/D shift, drag-in-progress flags
const DS_MSHIFT = 12; // R/U/L/D shift, no-line marks
const DS_XSHIFT = 16; // R/U/L/D shift, findMistakes wrong-edge overlay
const DS_ERROR_CLUE = 1 << 20;
const DS_FLASH = 1 << 21;
const DS_CURSOR = 1 << 22;

export interface PearlDrawState {
  halfsz: number;
  started: boolean;
  tileSize: number;
  w: number;
  h: number;
  lflags: Int32Array;
}

export function newDrawState(state: PearlState): PearlDrawState {
  return {
    halfsz: 0,
    started: false,
    tileSize: PREFERRED_TILE_SIZE,
    w: state.w,
    h: state.h,
    lflags: new Int32Array(state.w * state.h),
  };
}

// --- geometry (NARROW_BORDERS) --------------------------------------------
export interface Metrics {
  halfsz: number;
  tile: number;
  borderWidth: number;
  border: number;
}
export function metrics(tileSize: number): Metrics {
  const halfsz = (tileSize - 1) >> 1;
  const tile = halfsz * 2 + 1;
  const borderWidth = Math.max((tile / 32) | 0, 1);
  return { halfsz, tile, borderWidth, border: borderWidth + 1 };
}
export function coord(x: number, m: Metrics): number {
  return x * m.tile + m.border;
}
export function centeredCoord(x: number, m: Metrics): number {
  return coord(x, m) + ((m.tile / 2) | 0);
}
export function fromCoord(px: number, m: Metrics): number {
  return px < m.border ? -1 : Math.floor((px - m.border) / m.tile);
}

export function computeSize(p: PearlParams, tileSize: number): Size {
  const m = metrics(tileSize);
  return { w: p.w * m.tile + 2 * m.border, h: p.h * m.tile + 2 * m.border };
}

// --- drawing ---------------------------------------------------------------
function drawLine(
  dr: GameDrawing,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  c: number,
): void {
  dr.drawLine({ x: x1, y: y1 }, { x: x2, y: y2 }, c, 1);
}

/** Draw the four laid/error/drag/mistake segments in a cell for one flag
 * layer (upstream `draw_lines_specific`). */
function drawLinesSpecific(
  dr: GameDrawing,
  m: Metrics,
  x: number,
  y: number,
  lflags: number,
  shift: number,
  c: number,
): void {
  const ox = coord(x, m);
  const oy = coord(y, m);
  const t2 = m.halfsz;
  const t16 = m.halfsz >> 2;
  const cx = ox + t2;
  const cy = oy + t2;

  for (let d = 1; d < 16; d *= 2) {
    const xoff = t2 * DX(d);
    const yoff = t2 * DY(d);
    const xnudge = Math.abs(t16 * DX(CW(d)));
    const ynudge = Math.abs(t16 * DY(CW(d)));

    if ((lflags >> shift) & d) {
      const lx = cx + (xoff < 0 ? xoff : 0) - xnudge;
      const ly = cy + (yoff < 0 ? yoff : 0) - ynudge;
      if (c === COL_DRAGOFF && !(lflags & d)) continue;
      if (c === COL_DRAGON && lflags & d) continue;
      dr.drawRect(
        {
          x: lx,
          y: ly,
          w: Math.abs(xoff) + 2 * xnudge + 1,
          h: Math.abs(yoff) + 2 * ynudge + 1,
        },
        c,
      );
      // end cap
      dr.drawRect({ x: cx - t16, y: cy - t16, w: 2 * t16 + 1, h: 2 * t16 + 1 }, c);
    }
  }
}

function drawSquare(
  dr: GameDrawing,
  ds: PearlDrawState,
  guiStyle: number,
  x: number,
  y: number,
  lflags: number,
  clue: number,
): void {
  const m = metrics(ds.tileSize);
  const ox = coord(x, m);
  const oy = coord(y, m);
  const t2 = m.halfsz;
  const t16 = m.halfsz >> 2;
  const cx = ox + t2;
  const cy = oy + t2;

  dr.clip({ x: ox, y: oy, w: m.tile, h: m.tile });
  dr.drawRect(
    { x: ox, y: oy, w: m.tile, h: m.tile },
    lflags & DS_CURSOR ? COL_CURSOR_BACKGROUND : COL_BACKGROUND,
  );

  if (guiStyle === GUI_LOOPY) {
    dr.drawCircle({ x: cx, y: cy }, t16, COL_GRID, COL_GRID);
  } else {
    drawLine(dr, ox, oy, coord(x + 1, m), oy, COL_GRID);
    drawLine(dr, ox, oy, ox, coord(y + 1, m), COL_GRID);
  }

  // Thin gridlines or no-line marks (drawn first; thick lines go on top).
  for (let d = 1; d < 16; d *= 2) {
    const xoff = t2 * DX(d);
    const yoff = t2 * DY(d);
    if (
      (x === 0 && d === L) ||
      (y === 0 && d === U) ||
      (x === ds.w - 1 && d === R) ||
      (y === ds.h - 1 && d === D)
    )
      continue; // no gridlines out to the border
    if ((lflags >> DS_MSHIFT) & d) {
      const mx = cx + xoff;
      const my = cy + yoff;
      const msz = t16;
      drawLine(dr, mx - msz, my - msz, mx + msz, my + msz, COL_BLACK);
      drawLine(dr, mx - msz, my + msz, mx + msz, my - msz, COL_BLACK);
    } else if (guiStyle === GUI_LOOPY) {
      drawLine(dr, cx, cy, cx + xoff, cy + yoff, COL_GRID);
    }
  }

  // Laid lines. Order matters for the exposed end-cap colours.
  drawLinesSpecific(dr, m, x, y, lflags, 0, lflags & DS_FLASH ? COL_FLASH : COL_BLACK);
  drawLinesSpecific(dr, m, x, y, lflags, DS_ESHIFT, COL_ERROR);
  drawLinesSpecific(dr, m, x, y, lflags, DS_XSHIFT, COL_MISTAKE);
  drawLinesSpecific(dr, m, x, y, lflags, DS_DSHIFT, COL_DRAGOFF);
  drawLinesSpecific(dr, m, x, y, lflags, DS_DSHIFT, COL_DRAGON);

  // Clue.
  if (clue !== NOCLUE) {
    const c = lflags & DS_FLASH ? COL_FLASH : clue === STRAIGHT ? COL_WHITE : COL_BLACK;
    if (lflags & DS_ERROR_CLUE)
      dr.drawCircle({ x: cx, y: cy }, ((m.tile * 3) / 8) | 0, COL_ERROR, COL_ERROR);
    dr.drawCircle({ x: cx, y: cy }, (m.tile / 4) | 0, c, COL_BLACK);
  }

  dr.unclip();
  dr.drawUpdate({ x: ox, y: oy, w: m.tile, h: m.tile });
}

export function redraw(
  dr: GameDrawing,
  ds: PearlDrawState | null,
  _prev: PearlState | null,
  state: PearlState,
  _dir: number,
  ui: PearlUi,
  _animTime: number,
  flashTime: number,
  _hint?: unknown,
  mistakes?: readonly { x: number; y: number; dir: number }[],
): void {
  if (ds === null) return;
  const { w, h } = state;
  const m = metrics(ds.tileSize);
  const guiStyle = ui.guiStyle;
  let force = false;

  if (!ds.started) {
    if (guiStyle === GUI_MASYU) {
      // The black rectangle behind the whole grid.
      dr.drawRect(
        {
          x: m.border - m.borderWidth,
          y: m.border - m.borderWidth,
          w: w * m.tile + 2 * m.borderWidth + 1,
          h: h * m.tile + 2 * m.borderWidth + 1,
        },
        COL_GRID,
      );
    }
    dr.drawUpdate({
      x: 0,
      y: 0,
      w: w * m.tile + 2 * m.border,
      h: h * m.tile + 2 * m.border,
    });
    ds.started = true;
    force = true;
  }

  let flashing = 0;
  if (
    flashTime > 0 &&
    (flashTime <= FLASH_TIME / 3 || flashTime >= (FLASH_TIME * 2) / 3)
  )
    flashing = DS_FLASH;

  // In-progress drag preview.
  const draglines = new Uint8Array(w * h);
  if (ui.ndragcoords > 0) {
    const clearing = { v: true };
    for (let i = 0; i < ui.ndragcoords - 1; i++) {
      const leg = interpretUiDrag(state, ui.dragcoords, clearing, i);
      draglines[leg.sy * w + leg.sx] ^= leg.oldstate ^ leg.newstate;
      draglines[leg.dy * w + leg.dx] ^= F(leg.oldstate) ^ F(leg.newstate);
    }
  }

  // findMistakes wrong-edge overlay → per-cell bitmap.
  const wrong = new Uint8Array(w * h);
  if (mistakes) for (const mk of mistakes) wrong[mk.y * w + mk.x] |= mk.dir;

  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++) {
      const i = y * w + x;
      let f = state.lines[i];
      f |= (state.errors[i] & (R | U | L | D)) << DS_ESHIFT;
      f |= draglines[i] << DS_DSHIFT;
      f |= state.marks[i] << DS_MSHIFT;
      f |= wrong[i] << DS_XSHIFT;
      if (state.errors[i] & ERROR_CLUE) f |= DS_ERROR_CLUE;
      f |= flashing;
      if (ui.cursorActive && x === ui.curx && y === ui.cury) f |= DS_CURSOR;

      if (f !== ds.lflags[i] || force) {
        ds.lflags[i] = f;
        drawSquare(dr, ds, guiStyle, x, y, f, state.clues[i]);
      }
    }
}
