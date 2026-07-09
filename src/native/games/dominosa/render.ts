/**
 * dominosa rendering — faithful port of `game_redraw` / `draw_tile` in
 * dominosa.c. Each square packs its full draw state (domino type, clash,
 * highlights, barrier edges, cursor sub-position, flash, and the fork mistake
 * overlay) into one `Int32Array` cache word, so the diff key covers every
 * overlay by construction (playbook §3.2).
 *
 * Geometry note: the web C build defines `NARROW_BORDERS`
 * (cmake/platforms/webapp.cmake), so `BORDER = −DOMINO_GUTTER` — a slight
 * negative inset that bleeds the domino gutters to the canvas edge, not the
 * desktop `¾·TS`.
 */

import type { Colour, Size } from "../../../puzzle/types.ts";
import { mkhighlight } from "../../engine/colour-mkhighlight.ts";
import type { GameDrawing } from "../../engine/game.ts";
import {
  DINDEX,
  type DominosaMistake,
  type DominosaParams,
  type DominosaState,
  type DominosaUi,
  EDGE_B,
  EDGE_L,
  EDGE_R,
  EDGE_T,
  TRI,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 32;
export const FLASH_TIME = 0.13;

// --- palette (mirrors the dominosa.c colour enum index-for-index) ----------
export const COL_BACKGROUND = 0;
export const COL_TEXT = 1;
export const COL_DOMINO = 2;
export const COL_DOMINOCLASH = 3;
export const COL_DOMINOTEXT = 4;
export const COL_EDGE = 5;
export const COL_HIGHLIGHT_1 = 6;
export const COL_HIGHLIGHT_2 = 7;
// Fork mistake overlay, appended past the upstream enum.
export const COL_MISTAKE = 8;

export function colours(defaultBackground: Colour): Colour[] {
  const { background } = mkhighlight(defaultBackground);
  const out: Colour[] = [];
  out[COL_BACKGROUND] = background;
  out[COL_TEXT] = [0, 0, 0];
  out[COL_DOMINO] = [0, 0, 0];
  out[COL_DOMINOCLASH] = [0.5, 0, 0];
  out[COL_DOMINOTEXT] = [1, 1, 1];
  out[COL_EDGE] = [
    (background[0] * 2) / 3,
    (background[1] * 2) / 3,
    (background[2] * 2) / 3,
  ];
  out[COL_HIGHLIGHT_1] = [0.85, 0.2, 0.2];
  out[COL_HIGHLIGHT_2] = [0.3, 0.85, 0.2];
  out[COL_MISTAKE] = [1, 0, 0];
  return out;
}

// --- packed draw bits (upstream drawstate flags; also the cache key) --------
const TYPE_L = 0;
const TYPE_R = 1;
const TYPE_T = 2;
const TYPE_B = 3;
const TYPE_BLANK = 4;
const TYPE_MASK = 0x0f;

const DF_HIGHLIGHT_1 = 0x10;
const DF_HIGHLIGHT_2 = 0x20;
const DF_FLASH = 0x40;
const DF_CLASH = 0x80;
// EDGE_* (0x100..0x800) reuse the state bits.

const DF_CURSOR = 0x01000;
const DF_CURSOR_USEFUL = 0x02000;
const DF_CURSOR_XBASE = 0x10000;
const DF_CURSOR_XMASK = 0x30000;
const DF_CURSOR_YBASE = 0x40000;
const DF_CURSOR_YMASK = 0xc0000;
// Fork mistake overlay bit (no upstream analogue): an inset red outline.
const DF_MISTAKE = 0x100000;

// --- geometry ---------------------------------------------------------------
const gutter = (ts: number) => Math.floor(ts / 16);
const border = (ts: number) => -gutter(ts); // NARROW_BORDERS
const coord = (n: number, ts: number) => n * ts + border(ts);
const dominoRadius = (ts: number) => Math.floor(ts / 8);
const coffset = (ts: number) => gutter(ts) + dominoRadius(ts);
const cursorRadius = (ts: number) => Math.floor(ts / 4);

export function computeSize(p: DominosaParams, ts: number): Size {
  const w = p.n + 2;
  const h = p.n + 1;
  return { w: w * ts + 2 * border(ts), h: h * ts + 2 * border(ts) };
}

// --- draw state -------------------------------------------------------------

export interface DominosaDrawState {
  started: boolean;
  tilesize: number;
  w: number;
  h: number;
  /** Last-drawn packed word per square; −1 forces a redraw. */
  visible: Int32Array;
}

export function newDrawState(state: DominosaState): DominosaDrawState {
  return {
    started: false,
    tilesize: 0,
    w: state.w,
    h: state.h,
    visible: new Int32Array(state.w * state.h).fill(-1),
  };
}

// --- tile drawing -----------------------------------------------------------

/** Four corner brackets around (cx,cy) of half-size r — upstream
 * `draw_rect_corners` (misc.c). */
function drawRectCorners(
  dr: GameDrawing,
  cx: number,
  cy: number,
  r: number,
  col: number,
): void {
  const seg = (x1: number, y1: number, x2: number, y2: number) =>
    dr.drawLine({ x: x1, y: y1 }, { x: x2, y: y2 }, col, 1);
  seg(cx - r, cy - r, cx - r, cy - (r >> 1));
  seg(cx - r, cy - r, cx - (r >> 1), cy - r);
  seg(cx - r, cy + r, cx - r, cy + (r >> 1));
  seg(cx - r, cy + r, cx - (r >> 1), cy + r);
  seg(cx + r, cy - r, cx + r, cy - (r >> 1));
  seg(cx + r, cy - r, cx + (r >> 1), cy - r);
  seg(cx + r, cy + r, cx + r, cy + (r >> 1));
  seg(cx + r, cy + r, cx + (r >> 1), cy + r);
}

function drawTile(
  dr: GameDrawing,
  ts: number,
  state: DominosaState,
  x: number,
  y: number,
  packed: number,
): void {
  const w = state.w;
  const cx = coord(x, ts);
  const cy = coord(y, ts);
  const g = gutter(ts);
  const co = coffset(ts);
  const rad = dominoRadius(ts);

  dr.clip({ x: cx, y: cy, w: ts, h: ts });
  dr.drawRect({ x: cx, y: cy, w: ts, h: ts }, COL_BACKGROUND);

  const flags = packed & ~TYPE_MASK;
  const type = packed & TYPE_MASK;
  let nc: number;

  if (type !== TYPE_BLANK) {
    let bg = flags & DF_CLASH ? COL_DOMINOCLASH : COL_DOMINO;
    nc = COL_DOMINOTEXT;
    if (flags & DF_FLASH) {
      const tmp = nc;
      nc = bg;
      bg = tmp;
    }

    // Rounded corners: filled circles at the domino's outer corners.
    if (type === TYPE_L || type === TYPE_T)
      dr.drawCircle({ x: cx + co, y: cy + co }, rad, bg, bg);
    if (type === TYPE_R || type === TYPE_T)
      dr.drawCircle({ x: cx + ts - 1 - co, y: cy + co }, rad, bg, bg);
    if (type === TYPE_L || type === TYPE_B)
      dr.drawCircle({ x: cx + co, y: cy + ts - 1 - co }, rad, bg, bg);
    if (type === TYPE_R || type === TYPE_B)
      dr.drawCircle({ x: cx + ts - 1 - co, y: cy + ts - 1 - co }, rad, bg, bg);

    for (let i = 0; i < 2; i++) {
      let x1 = cx + (i ? g : co);
      let y1 = cy + (i ? co : g);
      let x2 = cx + ts - 1 - (i ? g : co);
      let y2 = cy + ts - 1 - (i ? co : g);
      if (type === TYPE_L) x2 = cx + ts + Math.floor(ts / 16);
      else if (type === TYPE_R) x1 = cx - Math.floor(ts / 16);
      else if (type === TYPE_T) y2 = cy + ts + Math.floor(ts / 16);
      else if (type === TYPE_B) y1 = cy - Math.floor(ts / 16);
      dr.drawRect({ x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 }, bg);
    }
  } else {
    if (flags & EDGE_T)
      dr.drawRect({ x: cx + g, y: cy, w: ts - 2 * g, h: 1 }, COL_EDGE);
    if (flags & EDGE_B)
      dr.drawRect({ x: cx + g, y: cy + ts - 1, w: ts - 2 * g, h: 1 }, COL_EDGE);
    if (flags & EDGE_L)
      dr.drawRect({ x: cx, y: cy + g, w: 1, h: ts - 2 * g }, COL_EDGE);
    if (flags & EDGE_R)
      dr.drawRect({ x: cx + ts - 1, y: cy + g, w: 1, h: ts - 2 * g }, COL_EDGE);
    nc = COL_TEXT;
  }

  if (flags & DF_CURSOR) {
    const curx = Math.floor((flags & DF_CURSOR_XMASK) / DF_CURSOR_XBASE) & 3;
    const cury = Math.floor((flags & DF_CURSOR_YMASK) / DF_CURSOR_YBASE) & 3;
    const ox = cx + Math.floor((curx * ts) / 2);
    const oy = cy + Math.floor((cury * ts) / 2);
    drawRectCorners(dr, ox, oy, cursorRadius(ts), nc);
    if (flags & DF_CURSOR_USEFUL) drawRectCorners(dr, ox, oy, cursorRadius(ts) + 1, nc);
  }

  if (flags & DF_HIGHLIGHT_1) nc = COL_HIGHLIGHT_1;
  else if (flags & DF_HIGHLIGHT_2) nc = COL_HIGHLIGHT_2;

  // Fork findMistakes overlay: an inset red outline over the wrong domino.
  if (flags & DF_MISTAKE) {
    const t = Math.max(1, Math.floor(ts / 16));
    const inset = Math.max(2, Math.floor(ts / 8));
    const sx = cx + inset;
    const sy = cy + inset;
    const span = ts - 2 * inset;
    dr.drawRect({ x: sx, y: sy, w: span, h: t }, COL_MISTAKE);
    dr.drawRect({ x: sx, y: sy + span - t, w: span, h: t }, COL_MISTAKE);
    dr.drawRect({ x: sx, y: sy, w: t, h: span }, COL_MISTAKE);
    dr.drawRect({ x: sx + span - t, y: sy, w: t, h: span }, COL_MISTAKE);
  }

  dr.drawText(
    { x: cx + Math.floor(ts / 2), y: cy + Math.floor(ts / 2) },
    {
      align: "center",
      baseline: "mathematical",
      fontType: "variable",
      size: Math.floor(ts / 2),
    },
    nc,
    String(state.numbers[y * w + x]),
  );

  dr.drawUpdate({ x: cx, y: cy, w: ts, h: ts });
  dr.unclip();
}

// --- redraw -----------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: DominosaDrawState | null,
  _prev: DominosaState | null,
  state: DominosaState,
  _dir: number,
  ui: DominosaUi,
  _animTime: number,
  flashTime: number,
  _hint?: unknown,
  mistakes?: readonly DominosaMistake[],
): void {
  if (!ds) return;
  const ts = ds.tilesize;
  const { w, h, grid, numbers } = state;
  const wh = w * h;
  const n = state.params.n;

  if (!ds.started) {
    const size = computeSize({ n, diff: 0 }, ts);
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_BACKGROUND);
    dr.drawUpdate({ x: 0, y: 0, w: size.w, h: size.h });
    ds.started = true;
  }

  // Count domino-value occurrences (capped at 2) so a value placed twice
  // highlights in red.
  const used = new Uint8Array(TRI(n + 1));
  for (let i = 0; i < wh; i++)
    if (grid[i] > i) {
      const di = DINDEX(numbers[i], numbers[grid[i]]);
      if (used[di] < 2) used[di]++;
    }

  const mistakeSet = mistakes?.length
    ? new Set(mistakes.map((m) => m.index))
    : null;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let c: number;
      if (grid[i] === i - 1) c = TYPE_R;
      else if (grid[i] === i + 1) c = TYPE_L;
      else if (grid[i] === i - w) c = TYPE_B;
      else if (grid[i] === i + w) c = TYPE_T;
      else c = TYPE_BLANK;

      const n1 = numbers[i];
      if (c !== TYPE_BLANK) {
        const di = DINDEX(n1, numbers[grid[i]]);
        if (used[di] > 1) c |= DF_CLASH;
      } else {
        c |= state.edges[i];
      }

      if (n1 === ui.highlight1) c |= DF_HIGHLIGHT_1;
      if (n1 === ui.highlight2) c |= DF_HIGHLIGHT_2;

      if (flashTime !== 0) c |= DF_FLASH;

      if (ui.cursorVisible) {
        const curx = ui.curX - (2 * x - 1);
        const cury = ui.curY - (2 * y - 1);
        if (curx >= 0 && curx < 3 && cury >= 0 && cury < 3) {
          c |= DF_CURSOR | (curx * DF_CURSOR_XBASE) | (cury * DF_CURSOR_YBASE);
          if ((ui.curX ^ ui.curY) & 1) c |= DF_CURSOR_USEFUL;
        }
      }

      if (mistakeSet?.has(i)) c |= DF_MISTAKE;

      if (ds.visible[i] !== c) {
        drawTile(dr, ts, state, x, y, c);
        ds.visible[i] = c;
      }
    }
  }
}
