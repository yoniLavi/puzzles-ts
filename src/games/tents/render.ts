/**
 * Tents rendering — `game_redraw` / `draw_tile` / `find_errors` from tents.c.
 * Non-blank tiles are grass-filled; trees draw a trunk + leaf circles, tents a
 * triangle; the edge numbers sit on the bottom (columns) and right (rows)
 * borders. Live error highlighting (adjacency diamonds, over/under-committed
 * numbers, over-committed tent/tree groups via two `dsf` passes) is computed
 * each frame over a drag-transformed grid, which is why it lives here and not
 * in state.
 *
 * Geometry is upstream's web build (`NARROW_BORDERS`): a 1px top/left border,
 * and `TS + 2` bottom/right to hold the numbers.
 *
 * The per-tile cache packs the square value plus every error / cursor / flash
 * / mistake overlay bit into one `Int32Array` word, so the diff key covers
 * every overlay (docs/games/rendering.md § "Overlay sidecars"). Edge numbers
 * diff a parallel error-flag array.
 */

import {
  BROWN,
  GREEN,
  GREEN_WASH,
  ORANGE,
  RED_BOLD,
} from "../../engine/color/colors.ts";
import { ERROR, ERROR_TEXT, INK } from "../../engine/color/palette.ts";
import { drawThickRectOutline } from "../../engine/draw.ts";
import { Dsf } from "../../engine/dsf.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import { LEFT_BUTTON } from "../../engine/pointer.ts";
import type { Color, Size } from "../../engine/types.ts";
import {
  BLANK,
  NONTENT,
  TENT,
  type TentsMistake,
  type TentsMove,
  type TentsParams,
  type TentsState,
  type TentsUi,
  TREE,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 32;
export const FLASH_TIME = 0.3;

// --- palette (the tents.c color enum, index for index) -------------------
export const COL_BACKGROUND = 0;
export const COL_GRID = 1;
export const COL_GRASS = 2;
export const COL_TREETRUNK = 3;
export const COL_TREELEAF = 4;
export const COL_TENT = 5;
export const COL_ERROR = 6;
export const COL_ERRTEXT = 7;
export const COL_ERRTRUNK = 8;
// The findMistakes overlay, appended past upstream's enum.
export const COL_MISTAKE = 9;

export function colors(defaultBackground: Color): Color[] {
  const out: Color[] = [];
  out[COL_BACKGROUND] = defaultBackground;
  out[COL_GRID] = INK;
  out[COL_GRASS] = GREEN_WASH;
  out[COL_TREETRUNK] = BROWN;
  out[COL_TREELEAF] = GREEN;
  out[COL_TENT] = ORANGE;
  out[COL_ERROR] = ERROR;
  out[COL_ERRTEXT] = ERROR_TEXT;
  out[COL_ERRTRUNK] = RED_BOLD;
  out[COL_MISTAKE] = ERROR;
  return out;
}

// --- packed tile word: v in the low nibble, error and overlay bits above ---
const ERR_ADJ_TOPLEFT = 1 << 4;
const ERR_ADJ_TOP = 1 << 5;
const ERR_ADJ_TOPRIGHT = 1 << 6;
const ERR_ADJ_LEFT = 1 << 7;
const ERR_ADJ_RIGHT = 1 << 8;
const ERR_ADJ_BOTLEFT = 1 << 9;
const ERR_ADJ_BOT = 1 << 10;
const ERR_ADJ_BOTRIGHT = 1 << 11;
const ERR_OVERCOMMITTED = 1 << 12;
const CURSOR_BIT = 1 << 13;
const FLASH_BIT = 1 << 14;
const MISTAKE_BIT = 1 << 15;

// --- geometry (NARROW_BORDERS) --------------------------------------------
/** The board's pixel origin. Exported so `interpretMove` reads the same number
 * the painter does ([`docs/games/mechanics.md`](../../../docs/games/mechanics.md)). */
export const TLBORDER = 1;
const brBorder = (ts: number) => ts + 2;
const coord = (n: number, ts: number) => n * ts + TLBORDER;

export function computeSize(p: TentsParams, ts: number): Size {
  return {
    w: TLBORDER + brBorder(ts) + ts * p.w,
    h: TLBORDER + brBorder(ts) + ts * p.h,
  };
}

// --- draw state -----------------------------------------------------------

export interface TentsDrawState {
  started: boolean;
  tilesize: number;
  /** Last-drawn packed word per tile; -1 forces a draw. */
  drawn: Int32Array;
  /** Last-drawn error flag per edge number; -1 forces a draw. */
  numbersDrawn: Int32Array;
}

export function newDrawState(state: TentsState): TentsDrawState {
  return {
    started: false,
    tilesize: 0,
    drawn: new Int32Array(state.w * state.h).fill(-1),
    numbersDrawn: new Int32Array(state.w + state.h).fill(-1),
  };
}

// --- live error analysis (upstream find_errors) ---------------------------

export interface TentsErrors {
  /** Per-cell error bitmask (ERR_ADJ_* / ERR_OVERCOMMITTED bits). */
  cell: Int32Array;
  /** Per-edge-number error flag (0/1), columns then rows. */
  num: Uint8Array;
}

export function findErrors(
  w: number,
  h: number,
  grid: Int8Array,
  numbers: Int32Array,
): TentsErrors {
  const cell = new Int32Array(w * h);
  const num = new Uint8Array(w + h);

  // Tent-adjacency violations: a diamond on the shared edge or corner.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (
        y + 1 < h &&
        x + 1 < w &&
        ((grid[i] === TENT && grid[i + w + 1] === TENT) ||
          (grid[i + w] === TENT && grid[i + 1] === TENT))
      ) {
        cell[i] |= ERR_ADJ_BOTRIGHT;
        cell[i + w] |= ERR_ADJ_TOPRIGHT;
        cell[i + 1] |= ERR_ADJ_BOTLEFT;
        cell[i + w + 1] |= ERR_ADJ_TOPLEFT;
      }
      if (y + 1 < h && grid[i] === TENT && grid[i + w] === TENT) {
        cell[i] |= ERR_ADJ_BOT;
        cell[i + w] |= ERR_ADJ_TOP;
      }
      if (x + 1 < w && grid[i] === TENT && grid[i + 1] === TENT) {
        cell[i] |= ERR_ADJ_RIGHT;
        cell[i + 1] |= ERR_ADJ_LEFT;
      }
    }
  }

  // Numeric-clue violations: too many tents, or too few squares left for them.
  const tents = new Int32Array(w + h);
  const maybe = new Int32Array(w + h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = grid[y * w + x];
      if (v !== TENT && v !== BLANK) continue;
      const counts = v === TENT ? tents : maybe;
      counts[x]++;
      counts[w + y]++;
    }
  }
  for (let i = 0; i < w + h; i++) {
    num[i] = tents[i] > numbers[i] || tents[i] + maybe[i] < numbers[i] ? 1 : 0;
  }

  // Per cell, the trees minus the `partner` squares in its component, where a
  // component joins each tree to its orthogonally adjacent partners.
  const balance = (partner: (v: number) => boolean): ((i: number) => number) => {
    const linked = (a: number, b: number) =>
      (grid[a] === TREE && partner(grid[b])) || (partner(grid[a]) && grid[b] === TREE);
    const dsf = new Dsf(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (x + 1 < w && linked(i, i + 1)) dsf.merge(i, i + 1);
        if (y + 1 < h && linked(i, i + w)) dsf.merge(i, i + w);
      }
    }
    const sum = new Int32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      if (grid[i] === TREE) sum[dsf.canonify(i)]++;
      else if (partner(grid[i])) sum[dsf.canonify(i)]--;
    }
    return (i) => sum[dsf.canonify(i)];
  };
  // A group of tents with too few trees flags every tent in it. A group of
  // trees with too few tents flags its trees, counting a blank as a potential
  // tent, so a tree is flagged only when there is no room left for its tents.
  const tentBalance = balance((v) => v === TENT);
  const treeBalance = balance((v) => v === TENT || v === BLANK);
  for (let i = 0; i < w * h; i++) {
    if (grid[i] === TENT && tentBalance(i) < 0) cell[i] |= ERR_OVERCOMMITTED;
    if (grid[i] === TREE && treeBalance(i) > 0) cell[i] |= ERR_OVERCOMMITTED;
  }

  return { cell, num };
}

// --- drag transform (upstream drag_xform) ---------------------------------

/** Apply an in-progress drag's effect to cell `(x, y)`'s value `v`, for the
 * live preview, the error feedback and the move a release makes. `dragButton`
 * is the left or the right button. Upstream's stylus branches are absent: the
 * pointer model delivers no `MOD_STYLUS`. */
export function dragXform(ui: TentsUi, x: number, y: number, v: number): number {
  if (v === TREE) return v; // trees are inviolate
  const { sx, sy, ex, ey } = ui.drag;
  if (ui.dragButton === LEFT_BUTTON) {
    // Left-dragging has no effect: it acts as a click at the drag start.
    if (x !== sx || y !== sy) return v;
    return v === BLANK ? TENT : BLANK;
  }
  // The right button: a click toggles a non-tent, a drag paints blanks.
  if (x < Math.min(sx, ex) || x > Math.max(sx, ex)) return v;
  if (y < Math.min(sy, ey) || y > Math.max(sy, ey)) return v;
  if (sx === ex && sy === ey) return v === BLANK ? NONTENT : BLANK;
  return v === BLANK ? NONTENT : v;
}

// --- tile drawing ----------------------------------------------------------

function drawErrAdj(dr: GameDrawing, ts: number, x: number, y: number): void {
  const d = Math.floor((ts * 2) / 5);
  dr.drawPolygon(
    [
      { x: x - d, y },
      { x, y: y - d },
      { x: x + d, y },
      { x, y: y + d },
    ],
    COL_ERROR,
    COL_GRID,
  );
  // An exclamation mark, drawn by hand (draw_text looked off-center upstream).
  const xext = Math.floor(ts / 16);
  const yext = Math.floor((ts * 2) / 5) - (xext * 2 + 2);
  dr.drawRect(
    { x: x - xext, y: y - yext, w: xext * 2 + 1, h: yext * 2 + 1 - xext * 3 },
    COL_ERRTEXT,
  );
  dr.drawRect(
    { x: x - xext, y: y + yext - xext * 2 + 1, w: xext * 2 + 1, h: xext * 2 },
    COL_ERRTEXT,
  );
}

function drawTile(
  dr: GameDrawing,
  ts: number,
  x: number,
  y: number,
  packed: number,
  cur: boolean,
): void {
  const err = packed & ~15;
  const v = packed & 15;
  const tx = coord(x, ts);
  const ty = coord(y, ts);
  const cx = tx + Math.floor(ts / 2);
  const cy = ty + Math.floor(ts / 2);

  dr.clip({ x: tx, y: ty, w: ts, h: ts });

  dr.drawRect({ x: tx, y: ty, w: ts, h: ts }, COL_GRID);
  dr.drawRect(
    { x: tx + 1, y: ty + 1, w: ts - 1, h: ts - 1 },
    v === BLANK ? COL_BACKGROUND : COL_GRASS,
  );

  const over = (err & ERR_OVERCOMMITTED) !== 0;
  if (v === TREE) {
    dr.drawRect(
      {
        x: cx - Math.floor(ts / 15),
        y: ty + Math.floor((ts * 3) / 10),
        w: 2 * Math.floor(ts / 15) + 1,
        h: Math.floor((ts * 9) / 10) - Math.floor((ts * 3) / 10),
      },
      over ? COL_ERRTRUNK : COL_TREETRUNK,
    );
    const col = over ? COL_ERROR : COL_TREELEAF;
    const leaf = (dx: number, dy: number, r: number) =>
      dr.drawCircle({ x: cx + dx, y: ty + dy }, r, col, col);
    leaf(0, Math.floor((ts * 4) / 10), Math.floor(ts / 4));
    const r = Math.floor(ts / 8);
    leaf(Math.floor(ts / 5), Math.floor(ts / 4), r);
    leaf(-Math.floor(ts / 5), Math.floor(ts / 4), r);
    leaf(Math.floor(ts / 4), Math.floor((ts * 6) / 13), r);
    leaf(-Math.floor(ts / 4), Math.floor((ts * 6) / 13), r);
  } else if (v === TENT) {
    const t = Math.floor(ts / 3);
    const col = over ? COL_ERROR : COL_TENT;
    dr.drawPolygon(
      [
        { x: cx - t, y: cy + t },
        { x: cx + t, y: cy + t },
        { x: cx, y: cy - t },
      ],
      col,
      col,
    );
  }

  const half = Math.floor(ts / 2);
  if (err & ERR_ADJ_TOPLEFT) drawErrAdj(dr, ts, tx, ty);
  if (err & ERR_ADJ_TOP) drawErrAdj(dr, ts, tx + half, ty);
  if (err & ERR_ADJ_TOPRIGHT) drawErrAdj(dr, ts, tx + ts, ty);
  if (err & ERR_ADJ_LEFT) drawErrAdj(dr, ts, tx, ty + half);
  if (err & ERR_ADJ_RIGHT) drawErrAdj(dr, ts, tx + ts, ty + half);
  if (err & ERR_ADJ_BOTLEFT) drawErrAdj(dr, ts, tx, ty + ts);
  if (err & ERR_ADJ_BOT) drawErrAdj(dr, ts, tx + half, ty + ts);
  if (err & ERR_ADJ_BOTRIGHT) drawErrAdj(dr, ts, tx + ts, ty + ts);

  // The findMistakes overlay: an inset red outline (distinct from the live
  // error red on trunk/leaf/tent).
  if (packed & MISTAKE_BIT) {
    const thick = Math.max(1, Math.floor(ts / 16));
    const inset = Math.max(2, Math.floor(ts / 8));
    const span = ts - 2 * inset;
    drawThickRectOutline(dr, tx + inset, ty + inset, span, span, thick, COL_MISTAKE);
  }

  if (cur) {
    const coff = Math.floor(ts / 8);
    // A stroked outline via four thin rects (drawRectOutline analog).
    dr.drawRect({ x: tx + coff, y: ty + coff, w: ts - coff * 2 + 1, h: 1 }, COL_GRID);
    dr.drawRect(
      { x: tx + coff, y: ty + ts - coff, w: ts - coff * 2 + 1, h: 1 },
      COL_GRID,
    );
    dr.drawRect({ x: tx + coff, y: ty + coff, w: 1, h: ts - coff * 2 + 1 }, COL_GRID);
    dr.drawRect(
      { x: tx + ts - coff, y: ty + coff, w: 1, h: ts - coff * 2 + 1 },
      COL_GRID,
    );
  }

  dr.unclip();
  dr.drawUpdate({ x: tx + 1, y: ty + 1, w: ts - 1, h: ts - 1 });
}

// --- redraw -----------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: TentsDrawState,
  _prev: TentsState | null,
  state: TentsState,
  _dir: number,
  ui: TentsUi,
  _animTime: number,
  flashTime: number,
  _hint?: HintStep<TentsMove>,
  mistakes?: readonly TentsMistake[],
): void {
  const ts = ds.tilesize;
  const { w, h, grid, numbers } = state;

  if (!ds.started) {
    const size = computeSize({ w, h, diff: 0 }, ts);
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_BACKGROUND);
    // The grid lines.
    for (let y = 0; y <= h; y++) {
      dr.drawLine(
        { x: coord(0, ts), y: coord(y, ts) },
        { x: coord(w, ts), y: coord(y, ts) },
        COL_GRID,
        1,
      );
    }
    for (let x = 0; x <= w; x++) {
      dr.drawLine(
        { x: coord(x, ts), y: coord(0, ts) },
        { x: coord(x, ts), y: coord(h, ts) },
        COL_GRID,
        1,
      );
    }
    dr.drawUpdate({ x: 0, y: 0, w: size.w, h: size.h });
    ds.started = true;
  }

  const flashing = flashTime > 0 && Math.floor((flashTime * 3) / FLASH_TIME) !== 1;

  // Errors: transform only the drag's start cell (upstream — instant single-
  // click feedback without right-drag flicker).
  let errGrid = grid;
  if (ui.dragButton >= 0) {
    const { sx, sy } = ui.drag;
    errGrid = Int8Array.from(grid);
    errGrid[sy * w + sx] = dragXform(ui, sx, sy, errGrid[sy * w + sx]);
  }
  const errors = findErrors(w, h, errGrid, numbers);

  const mistakeSet = new Set(mistakes?.map((m) => m.y * w + m.x));

  const cx = ui.cursor.visible ? ui.cursor.x : -1;
  const cy = ui.cursor.visible ? ui.cursor.y : -1;

  // Draw the grid squares whose packed word changed.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = grid[y * w + x];
      if (ui.dragButton >= 0) v = dragXform(ui, x, y, v);
      if (flashing && (v === TREE || v === TENT)) v = NONTENT;
      let packed = v | errors.cell[y * w + x];
      const isCur = x === cx && y === cy;
      if (isCur) packed |= CURSOR_BIT;
      if (flashing) packed |= FLASH_BIT;
      if (mistakeSet.has(y * w + x)) packed |= MISTAKE_BIT;
      if (ds.drawn[y * w + x] !== packed) {
        drawTile(dr, ts, x, y, packed, isCur);
        ds.drawn[y * w + x] = packed;
      }
    }
  }

  // Edge numbers (redraw when their error state changed, or on first draw).
  const numberSize = Math.floor(ts / 2);
  for (let x = 0; x < w; x++) {
    if (ds.numbersDrawn[x] === errors.num[x]) continue;
    const box = { x: coord(x, ts), y: coord(h, ts) + 1, w: ts, h: brBorder(ts) - 1 };
    dr.drawRect(box, COL_BACKGROUND);
    dr.drawText(
      { x: coord(x, ts) + Math.floor(ts / 2), y: coord(h + 1, ts) },
      {
        align: "center",
        baseline: "alphabetic",
        fontType: "variable",
        size: numberSize,
      },
      errors.num[x] ? COL_ERROR : COL_GRID,
      String(numbers[x]),
    );
    dr.drawUpdate(box);
    ds.numbersDrawn[x] = errors.num[x];
  }
  for (let y = 0; y < h; y++) {
    if (ds.numbersDrawn[w + y] === errors.num[w + y]) continue;
    const box = { x: coord(w, ts) + 1, y: coord(y, ts), w: brBorder(ts) - 1, h: ts };
    dr.drawRect(box, COL_BACKGROUND);
    dr.drawText(
      { x: coord(w + 1, ts), y: coord(y, ts) + Math.floor(ts / 2) },
      {
        align: "right",
        baseline: "mathematical",
        fontType: "variable",
        size: numberSize,
      },
      errors.num[w + y] ? COL_ERROR : COL_GRID,
      String(numbers[w + y]),
    );
    dr.drawUpdate(box);
    ds.numbersDrawn[w + y] = errors.num[w + y];
  }
}
