/**
 * Pattern rendering, a port of `game_redraw` / `grid_square` / `draw_numbers`
 * in pattern.c. A per-cell cache keyed on the displayed value (drag- and
 * flash-adjusted) plus overlay bits, and a per-line cache of the clue color,
 * which turns red when a completed line contradicts its clue (`check_errors`).
 */

import { mkhighlight } from "../../engine/color/color-mkhighlight.ts";
import { BLACK, WHITE } from "../../engine/color/colors.ts";
import {
  CURSOR,
  ERROR,
  GRID_DARK,
  HINT_ACTION,
  HINT_BLACKREF,
  HINT_EVIDENCE_WASH,
  HINT_WHITEREF,
  INK,
  UNDECIDED,
} from "../../engine/color/palette.ts";
import { drawThickRectOutline, glyphFont } from "../../engine/draw.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import { fromCoord as fromCoordE } from "../../engine/geometry.ts";
import { drawMarkSides, MARK_ALL } from "../../engine/hint-mark.ts";
import type { Color, Size } from "../../engine/types.ts";
import type { PatternHint } from "./index.ts";
import { lineHasError } from "./solver.ts";
import {
  GRID_EMPTY,
  GRID_FULL,
  GRID_UNKNOWN,
  type PatternMistake,
  type PatternMove,
  type PatternParams,
  type PatternState,
  type PatternUi,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 24;
export const FLASH_TIME = 0.13;

// --- palette (mirrors the pattern.c color enum index-for-index) ---------
export const COL_BACKGROUND = 0;
export const COL_EMPTY = 1;
export const COL_FULL = 2;
export const COL_TEXT = 3;
export const COL_UNKNOWN = 4;
export const COL_GRID = 5;
export const COL_CURSOR = 6;
export const COL_ERROR = 7;
export const COL_CURSOR_GUIDE = 8;
// Hint colors, appended past the C enum (0–8). The forced cell is ringed
// COL_HINT, the reasoned line's undecided cells shade COL_HINT_CELL, and cited
// black / white marks ring COL_HINT_BLACKREF / COL_HINT_WHITEREF (the
// cross-game element-type legend).
export const COL_HINT = 9;
export const COL_HINT_CELL = 10;
export const COL_HINT_BLACKREF = 11;
export const COL_HINT_WHITEREF = 12;

export function colors(defaultBackground: Color): Color[] {
  const out: Color[] = [];
  // Upstream pattern.c shifts COL_BACKGROUND off pure white via mkhighlight
  // so a pure-white empty cell stays distinguishable from the surround.
  out[COL_BACKGROUND] = mkhighlight(defaultBackground).background;
  out[COL_GRID] = GRID_DARK;
  out[COL_UNKNOWN] = UNDECIDED;
  out[COL_TEXT] = INK;
  out[COL_FULL] = BLACK;
  out[COL_EMPTY] = WHITE;
  // The clue numbers of the cursor's own row and column: the cursor, projected
  // into the margin, so it takes the cursor's color rather than a gray of its own.
  out[COL_CURSOR_GUIDE] = CURSOR;
  out[COL_CURSOR] = CURSOR;
  out[COL_ERROR] = ERROR;
  out[COL_HINT] = HINT_ACTION;
  out[COL_HINT_CELL] = HINT_EVIDENCE_WASH;
  out[COL_HINT_BLACKREF] = HINT_BLACKREF;
  out[COL_HINT_WHITEREF] = HINT_WHITEREF;
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
  // The origin clears the clue block: the border, the gutter, and `tlborder(d)`
  // whole tiles of clue rows/columns.
  return fromCoordE(px, ts, border(ts) + gutter(ts) + ts * tlborder(d));
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
  /** Per-line last-drawn clue color; -1 forces a redraw. */
  numColors: Int32Array;
}

export function newDrawState(state: PatternState): PatternDrawState {
  const { w, h } = state.common;
  return {
    started: false,
    tilesize: 0,
    w,
    h,
    visible: new Int32Array(w * h).fill(-1),
    numColors: new Int32Array(w + h).fill(-1),
  };
}

// Packed display-key bits beyond the 2-bit cell value.
const K_CURSOR = 1 << 2;
const K_MISTAKE = 1 << 3;
// Hint-overlay bits (no upstream analog), also folded into the cache key.
const K_HINT_TARGET = 1 << 4; // a forced cell (COL_HINT highlight)
const K_HINT_SHADE = 1 << 5; // an undecided cell of the reasoned line
const K_HINT_BLACKREF = 1 << 6; // a cited black mark (teal ring)
const K_HINT_WHITEREF = 1 << 7; // a cited white mark (violet ring)

function gridSquare(
  dr: GameDrawing,
  ds: PatternDrawState,
  y: number,
  x: number,
  val: number,
  cur: boolean,
  mistake: boolean,
  hintBits: number,
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

  // A hint target is ringed below, never filled: where the move is exactly
  // "make this square black or white", a fill would state the answer the
  // narration is proposing. An undecided cell of the reasoned line shades,
  // since nothing is drawn on it for the wash to cover. A cited mark keeps its
  // own color (the premise) and gets a ring below.
  const baseFill =
    val === GRID_FULL ? COL_FULL : val === GRID_EMPTY ? COL_EMPTY : COL_UNKNOWN;
  const fill = hintBits & K_HINT_SHADE ? COL_HINT_CELL : baseFill;
  dr.drawRect({ x: dx, y: dy, w: dw, h: dh }, fill);

  if (hintBits & K_HINT_TARGET) {
    drawMarkSides(
      dr,
      {
        box: { x: dx, y: dy, w: dw, h: dh },
        outer: 0,
        inner: Math.max(2, Math.floor(ts / 10)),
      },
      MARK_ALL,
      COL_HINT,
    );
  }

  if (hintBits & (K_HINT_BLACKREF | K_HINT_WHITEREF)) {
    const t = Math.max(1, Math.floor(ts / 10));
    drawThickRectOutline(
      dr,
      dx,
      dy,
      dw,
      dh,
      t,
      hintBits & K_HINT_BLACKREF ? COL_HINT_BLACKREF : COL_HINT_WHITEREF,
    );
  }

  if (mistake) {
    const t = Math.max(1, Math.floor(ts / 12));
    const inset = Math.max(1, Math.floor(ts / 8));
    drawThickRectOutline(
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
    drawThickRectOutline(dr, dx, dy, dw, dh, 2, COL_CURSOR);
  }

  dr.drawUpdate({ x: tx, y: ty, w: ts, h: ts });
}

function drawNumbers(
  dr: GameDrawing,
  ds: PatternDrawState,
  state: PatternState,
  i: number,
  color: number,
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
        let yy = border(ts) + ts * (tlborder(h) - 1);
        yy -= Math.floor(((rowlen - j - 1) * ts * (tlborder(h) - 1)) / nfit);
        dr.drawText(
          { x: rx + half, y: yy + half },
          glyphFont(fontsize),
          color,
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
        color,
        str,
      );
    }
  }

  dr.unclip();
  dr.drawUpdate({ x: rx, y: ry, w: rw, h: rh });
}

export function redraw(
  dr: GameDrawing,
  ds: PatternDrawState,
  _prev: PatternState | null,
  state: PatternState,
  _dir: number,
  ui: PatternUi,
  _animTime: number,
  flashTime: number,
  hint?: HintStep<PatternMove, PatternHint>,
  mistakes?: readonly PatternMistake[],
): void {
  const ts = ds.tilesize;
  const { w, h } = state.common;
  const { grid } = state;
  const mistakeSet =
    mistakes && mistakes.length > 0
      ? new Set(mistakes.map((m) => m.y * w + m.x))
      : null;

  // Hint overlay: forced targets, the reasoned line's cells (line of sight),
  // and the cited marks to ring by their own color.
  const hl = hint?.highlights;
  const hintTargets = hl ? new Set(hl.cells) : null;
  const hintBlackRefs = hl ? new Set(hl.blackRefs) : null;
  const hintWhiteRefs = hl ? new Set(hl.whiteRefs) : null;
  const hintLine = hl?.line ?? -1;
  const inReasonedLine = (x: number, y: number): boolean =>
    hintLine < 0 ? false : hintLine < w ? x === hintLine : y === hintLine - w;

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

  const cx = ui.cursor.visible ? ui.cursor.x : -1;
  const cy = ui.cursor.visible ? ui.cursor.y : -1;

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
      let hintBits = 0;
      if (hl) {
        if (hintTargets?.has(i)) hintBits = K_HINT_TARGET;
        else if (hintBlackRefs?.has(i)) hintBits = K_HINT_BLACKREF;
        else if (hintWhiteRefs?.has(i)) hintBits = K_HINT_WHITEREF;
        else if (grid[i] === GRID_UNKNOWN && inReasonedLine(x, y)) {
          hintBits = K_HINT_SHADE;
        }
      }
      const key = val | (cur ? K_CURSOR : 0) | (mistake ? K_MISTAKE : 0) | hintBits;
      if (ds.visible[i] !== key) {
        ds.visible[i] = key;
        gridSquare(dr, ds, y, x, val, cur, mistake, hintBits);
      }
    }
  }

  // Recolor clue numbers: red on a contradicting completed line, else the
  // cursor guide for the cursor's row/column, else plain text.
  for (let i = 0; i < w + h; i++) {
    let color = lineHasError(state, i) ? COL_ERROR : COL_TEXT;
    if (color === COL_TEXT && ((cx >= 0 && i === cx) || (cy >= 0 && i === cy + w))) {
      color = COL_CURSOR_GUIDE;
    }
    // The reasoned line's clue is highlighted so it ties to the shaded line.
    if (i === hintLine) color = COL_HINT;
    if (ds.numColors[i] !== color) {
      ds.numColors[i] = color;
      drawNumbers(dr, ds, state, i, color);
    }
  }
}
