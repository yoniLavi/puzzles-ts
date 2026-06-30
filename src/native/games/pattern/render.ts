/**
 * Pattern rendering — faithful port of `game_redraw` / `grid_square` /
 * `draw_numbers` in pattern.c. Per-cell `Int32Array` cache keyed on the
 * cell's displayed value (drag- and flash-adjusted) plus cursor/mistake
 * overlay bits; a per-line cache of the last clue-number colour, recoloured
 * red when a completed line contradicts its clue (`check_errors`). The
 * palette mirrors the C colour enum index-for-index.
 */
import type { Colour, Size } from "../../../puzzle/types.ts";
import { mkhighlight } from "../../engine/colour-mkhighlight.ts";
import type { GameDrawing } from "../../engine/game.ts";
import { lineHasError } from "./solver.ts";
import {
  GRID_EMPTY,
  GRID_FULL,
  GRID_UNKNOWN,
  type PatternMistake,
  type PatternParams,
  type PatternState,
  type PatternUi,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 24;
export const FLASH_TIME = 0.13;

// --- palette (mirrors the pattern.c colour enum index-for-index) ---------
export const COL_BACKGROUND = 0;
export const COL_EMPTY = 1;
export const COL_FULL = 2;
export const COL_TEXT = 3;
export const COL_UNKNOWN = 4;
export const COL_GRID = 5;
export const COL_CURSOR = 6;
export const COL_ERROR = 7;
export const COL_CURSOR_GUIDE = 8;

const grey = (v: number): Colour => [v, v, v];

export function colours(defaultBackground: Colour): Colour[] {
  const out: Colour[] = [];
  // Upstream pattern.c shifts COL_BACKGROUND off pure white via mkhighlight
  // so a pure-white empty cell stays distinguishable from the surround.
  out[COL_BACKGROUND] = mkhighlight(defaultBackground).background;
  out[COL_GRID] = grey(0.3);
  out[COL_UNKNOWN] = grey(0.5);
  out[COL_TEXT] = grey(0);
  out[COL_FULL] = grey(0);
  out[COL_EMPTY] = grey(1);
  out[COL_CURSOR_GUIDE] = grey(0.5);
  out[COL_CURSOR] = [1, 0.25, 0.25];
  out[COL_ERROR] = [1, 0, 0];
  return out;
}

// --- geometry (upstream macros; BORDER is the wide non-NARROW form) ------
const border = (ts: number): number => Math.floor((3 * ts) / 4);
const gutter = (ts: number): number => Math.floor(ts / 2);
const tlborder = (d: number): number => Math.floor(d / 5) + 2;

/** Pixel origin of cell coordinate `n` along a dimension of size `d`. */
function toCoord(ts: number, d: number, n: number): number {
  return border(ts) + gutter(ts) + ts * (tlborder(d) + n);
}

/** Cell coordinate under pixel `px` along a dimension of size `d` (or out of
 * range). */
export function fromCoord(ts: number, d: number, px: number): number {
  return Math.floor((px - (border(ts) + gutter(ts) + ts * (tlborder(d) - 1))) / ts) - 1;
}

function sizeOf(ts: number, d: number): number {
  return 2 * border(ts) + gutter(ts) + ts * (tlborder(d) + d);
}

export function computeSize(p: PatternParams, ts: number): Size {
  return { w: sizeOf(ts, p.w), h: sizeOf(ts, p.h) };
}

// --- draw state ----------------------------------------------------------

export interface PatternDrawState {
  started: boolean;
  tilesize: number;
  w: number;
  h: number;
  /** Per-cell packed display key; -1 forces a redraw. */
  visible: Int32Array;
  /** Per-line last-drawn clue colour; -1 forces a redraw. */
  numColours: Int32Array;
}

export function newDrawState(state: PatternState): PatternDrawState {
  const { w, h } = state.common;
  return {
    started: false,
    tilesize: 0,
    w,
    h,
    visible: new Int32Array(w * h).fill(-1),
    numColours: new Int32Array(w + h).fill(-1),
  };
}

// Packed display-key bits beyond the 2-bit cell value.
const K_CURSOR = 1 << 2;
const K_MISTAKE = 1 << 3;

function rectOutline(
  dr: GameDrawing,
  x: number,
  y: number,
  w: number,
  h: number,
  thick: number,
  colour: number,
): void {
  dr.drawRect({ x, y, w, h: thick }, colour);
  dr.drawRect({ x, y: y + h - thick, w, h: thick }, colour);
  dr.drawRect({ x, y, w: thick, h }, colour);
  dr.drawRect({ x: x + w - thick, y, w: thick, h }, colour);
}

function gridSquare(
  dr: GameDrawing,
  ds: PatternDrawState,
  y: number,
  x: number,
  val: number,
  cur: boolean,
  mistake: boolean,
): void {
  const ts = ds.tilesize;
  const { w, h } = ds;
  const tx = toCoord(ts, w, x);
  const ty = toCoord(ts, h, y);

  dr.drawRect({ x: tx, y: ty, w: ts, h: ts }, COL_GRID);

  // Thicker separators every fifth cell and at the far edges.
  const xl = x % 5 === 0 ? 1 : 0;
  const yt = y % 5 === 0 ? 1 : 0;
  const xr = x % 5 === 4 || x === w - 1 ? 1 : 0;
  const yb = y % 5 === 4 || y === h - 1 ? 1 : 0;

  const dx = tx + 1 + xl;
  const dy = ty + 1 + yt;
  const dw = ts - xl - xr - 1;
  const dh = ts - yt - yb - 1;

  const fill =
    val === GRID_FULL ? COL_FULL : val === GRID_EMPTY ? COL_EMPTY : COL_UNKNOWN;
  dr.drawRect({ x: dx, y: dy, w: dw, h: dh }, fill);

  if (mistake) {
    const t = Math.max(1, Math.floor(ts / 12));
    const inset = Math.max(1, Math.floor(ts / 8));
    rectOutline(
      dr,
      dx + inset,
      dy + inset,
      dw - 2 * inset,
      dh - 2 * inset,
      t,
      COL_ERROR,
    );
  }

  if (cur) {
    // Upstream's double 1px outline → a 2px frame.
    rectOutline(dr, dx, dy, dw, dh, 2, COL_CURSOR);
  }

  dr.drawUpdate({ x: tx, y: ty, w: ts, h: ts });
}

function drawNumbers(
  dr: GameDrawing,
  ds: PatternDrawState,
  state: PatternState,
  i: number,
  colour: number,
): void {
  const ts = ds.tilesize;
  const { w, h, clues, fontLarge } = state.common;
  const rowdata = clues[i];
  const rowlen = rowdata.length;

  let rx: number;
  let ry: number;
  let rw: number;
  let rh: number;
  if (i < w) {
    rx = toCoord(ts, w, i);
    ry = 0;
    rw = ts;
    rh = border(ts) + tlborder(h) * ts;
  } else {
    rx = 0;
    ry = toCoord(ts, h, i - w);
    rw = border(ts) + tlborder(w) * ts;
    rh = ts;
  }

  dr.clip({ x: rx, y: ry, w: rw, h: rh });
  dr.drawRect({ x: rx, y: ry, w: rw, h: rh }, COL_BACKGROUND);

  const fontsize = Math.floor((ts + 0.5) / (fontLarge ? 1.2 : 1.8));
  const half = Math.floor(ts / 2);

  if (rowlen > 0) {
    if (i < w) {
      const nfit = Math.max(rowlen, tlborder(h)) - 1;
      for (let j = 0; j < rowlen; j++) {
        const x = rx;
        let yy = border(ts) + ts * (tlborder(h) - 1);
        yy -= Math.floor(((rowlen - j - 1) * ts * (tlborder(h) - 1)) / nfit);
        dr.drawText(
          { x: x + half, y: yy + half },
          {
            align: "center",
            baseline: "mathematical",
            fontType: "variable",
            size: fontsize,
          },
          colour,
          String(rowdata[j]),
        );
      }
    } else {
      const sep = rowlen > tlborder(w) ? " " : "  ";
      const str = rowdata.join(sep);
      const x = border(ts) + ts * (tlborder(w) - 1);
      dr.drawText(
        { x: x + ts, y: ry + half },
        {
          align: "right",
          baseline: "mathematical",
          fontType: "variable",
          size: fontsize,
        },
        colour,
        str,
      );
    }
  }

  dr.unclip();
  dr.drawUpdate({ x: rx, y: ry, w: rw, h: rh });
}

export function redraw(
  dr: GameDrawing,
  ds: PatternDrawState | null,
  _prev: PatternState | null,
  state: PatternState,
  _dir: number,
  ui: PatternUi,
  _animTime: number,
  flashTime: number,
  _hint?: unknown,
  mistakes?: readonly PatternMistake[],
): void {
  if (!ds) return;
  const ts = ds.tilesize;
  const { w, h } = state.common;
  const { grid } = state;
  const mistakeSet =
    mistakes && mistakes.length > 0
      ? new Set(mistakes.map((m) => m.y * w + m.x))
      : null;

  if (!ds.started) {
    // The engine paints no pixels of its own: fill the background, then the
    // grid outline frame.
    const size = computeSize({ w, h }, ts);
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_BACKGROUND);
    dr.drawRect(
      {
        x: toCoord(ts, w, 0) - 1,
        y: toCoord(ts, h, 0) - 1,
        w: w * ts + 3,
        h: h * ts + 3,
      },
      COL_GRID,
    );
    dr.drawUpdate({ x: 0, y: 0, w: size.w, h: size.h });
    ds.started = true;
  }

  // Drag preview rectangle.
  let x1 = -1;
  let x2 = -1;
  let y1 = -1;
  let y2 = -1;
  if (ui.dragging) {
    x1 = Math.min(ui.dragStartX, ui.dragEndX);
    x2 = Math.max(ui.dragStartX, ui.dragEndX);
    y1 = Math.min(ui.dragStartY, ui.dragEndY);
    y2 = Math.max(ui.dragStartY, ui.dragEndY);
  }
  // A multi-cell paint drag previews only on blank cells (matching the
  // onlyBlank fill it will emit), so it never visually clobbers a placed mark.
  const dragOnlyBlank = (x2 > x1 || y2 > y1) && ui.state !== GRID_UNKNOWN;

  const cx = ui.curVisible ? ui.curX : -1;
  const cy = ui.curVisible ? ui.curY : -1;

  // Invert filled cells twice during the completion flash (upstream).
  const flashing =
    flashTime > 0 && (flashTime <= FLASH_TIME / 3 || flashTime >= (FLASH_TIME * 2) / 3);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let val: number;
      if (
        ui.dragging &&
        x1 <= x &&
        x <= x2 &&
        y1 <= y &&
        y <= y2 &&
        !state.common.immutable[i] &&
        (!dragOnlyBlank || grid[i] === GRID_UNKNOWN)
      ) {
        val = ui.state;
      } else {
        val = grid[i];
      }
      if (flashing && val !== GRID_UNKNOWN) val ^= 1; // FULL <-> EMPTY

      const cur = x === cx && y === cy;
      const mistake = mistakeSet?.has(i) ?? false;
      const key = val | (cur ? K_CURSOR : 0) | (mistake ? K_MISTAKE : 0);
      if (ds.visible[i] !== key) {
        ds.visible[i] = key;
        gridSquare(dr, ds, y, x, val, cur, mistake);
      }
    }
  }

  // Recolour clue numbers: red on a contradicting completed line, else the
  // cursor-guide grey for the cursor's row/column, else plain text.
  for (let i = 0; i < w + h; i++) {
    let colour = lineHasError(state, i) ? COL_ERROR : COL_TEXT;
    if (colour === COL_TEXT && ((cx >= 0 && i === cx) || (cy >= 0 && i === cy + w))) {
      colour = COL_CURSOR_GUIDE;
    }
    if (ds.numColours[i] !== colour) {
      ds.numColours[i] = colour;
      drawNumbers(dr, ds, state, i, colour);
    }
  }
}
