/**
 * Tents rendering — faithful port of `game_redraw` / `draw_tile` /
 * `find_errors` in tents.c. Non-blank tiles are grass-filled; trees draw a
 * trunk + leaf circles, tents a triangle; the edge numbers sit on the bottom
 * (columns) and right (rows) borders. Live error highlighting (adjacency
 * diamonds, over/under-committed numbers, over-committed tent/tree groups via
 * two `dsf` passes) is computed each frame over a drag-transformed grid (D3).
 *
 * Geometry note: the web C build defines `NARROW_BORDERS`
 * (cmake/platforms/webapp.cmake), so `TLBORDER = 1` and `BRBORDER = TS + 2`
 * (number room only on the bottom/right) — parity is with the browser build.
 *
 * The per-tile cache packs the square value plus every error / cursor / flash
 * / mistake overlay bit into one `Int32Array` word, so the diff key covers
 * every overlay (playbook §3.2). Edge numbers diff a parallel error-flag array.
 */
import type { Colour, Size } from "../../../puzzle/types.ts";
import { Dsf } from "../../engine/dsf.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import { LEFT_BUTTON, RIGHT_BUTTON } from "../../engine/pointer.ts";
import {
  BLANK,
  NONTENT,
  type TentsMistake,
  type TentsMove,
  type TentsParams,
  type TentsState,
  type TentsUi,
  TENT,
  TREE,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 32;
export const FLASH_TIME = 0.3;

// --- palette (mirrors the tents.c colour enum index-for-index) ------------
export const COL_BACKGROUND = 0;
export const COL_GRID = 1;
export const COL_GRASS = 2;
export const COL_TREETRUNK = 3;
export const COL_TREELEAF = 4;
export const COL_TENT = 5;
export const COL_ERROR = 6;
export const COL_ERRTEXT = 7;
export const COL_ERRTRUNK = 8;
// Fork mistake overlay, appended past the upstream enum so tents' dark-mode
// override (index 2, COL_GRASS) never touches it.
export const COL_MISTAKE = 9;

export function colours(defaultBackground: Colour): Colour[] {
  const out: Colour[] = [];
  out[COL_BACKGROUND] = defaultBackground;
  out[COL_GRID] = [0, 0, 0];
  out[COL_GRASS] = [0.7, 1.0, 0.5];
  out[COL_TREETRUNK] = [0.6, 0.4, 0.0];
  out[COL_TREELEAF] = [0.0, 0.7, 0.0];
  out[COL_TENT] = [0.8, 0.7, 0.0];
  out[COL_ERROR] = [1.0, 0.0, 0.0];
  out[COL_ERRTEXT] = [1.0, 1.0, 1.0];
  out[COL_ERRTRUNK] = [0.6, 0.0, 0.0];
  out[COL_MISTAKE] = [0.85, 0.0, 0.0];
  return out;
}

// --- packed tile bits (v in the low nibble, error/overlay flags above) -----
// Error bits mirror the upstream ERR_ADJ_* / ERR_OVERCOMMITTED enum (4..12),
// so `v & ~15` recovers them exactly as C's `err = v & ~15`.
const ERR_ADJ_TOPLEFT = 4;
const ERR_ADJ_TOP = 5;
const ERR_ADJ_TOPRIGHT = 6;
const ERR_ADJ_LEFT = 7;
const ERR_ADJ_RIGHT = 8;
const ERR_ADJ_BOTLEFT = 9;
const ERR_ADJ_BOT = 10;
const ERR_ADJ_BOTRIGHT = 11;
const ERR_OVERCOMMITTED = 12;
// Fork overlay / render-only bits, above the upstream error range.
const CURSOR_BIT = 1 << 13;
const FLASH_BIT = 1 << 14;
const MISTAKE_BIT = 1 << 15;

// --- geometry (NARROW_BORDERS) --------------------------------------------
const TLBORDER = 1;
const brBorder = (ts: number) => ts + 2;
const coord = (n: number, ts: number) => n * ts + TLBORDER;

export function computeSize(p: TentsParams, ts: number): Size {
  return { w: TLBORDER + brBorder(ts) + ts * p.w, h: TLBORDER + brBorder(ts) + ts * p.h };
}

// --- draw state -----------------------------------------------------------

export interface TentsDrawState {
  started: boolean;
  tilesize: number;
  w: number;
  h: number;
  /** Last-drawn packed word per tile; -1 forces a draw. */
  drawn: Int32Array;
  /** Last-drawn error flag per edge number; -1 forces a draw. */
  numbersDrawn: Int32Array;
}

export function newDrawState(state: TentsState): TentsDrawState {
  return {
    started: false,
    tilesize: 0,
    w: state.w,
    h: state.h,
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
  const isTent = (v: number) => v === TENT;

  // Tent-adjacency violations.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (
        y + 1 < h && x + 1 < w &&
        ((isTent(grid[y * w + x]) && isTent(grid[(y + 1) * w + (x + 1)])) ||
          (isTent(grid[(y + 1) * w + x]) && isTent(grid[y * w + (x + 1)])))
      ) {
        cell[y * w + x] |= 1 << ERR_ADJ_BOTRIGHT;
        cell[(y + 1) * w + x] |= 1 << ERR_ADJ_TOPRIGHT;
        cell[y * w + (x + 1)] |= 1 << ERR_ADJ_BOTLEFT;
        cell[(y + 1) * w + (x + 1)] |= 1 << ERR_ADJ_TOPLEFT;
      }
      if (y + 1 < h && isTent(grid[y * w + x]) && isTent(grid[(y + 1) * w + x])) {
        cell[y * w + x] |= 1 << ERR_ADJ_BOT;
        cell[(y + 1) * w + x] |= 1 << ERR_ADJ_TOP;
      }
      if (x + 1 < w && isTent(grid[y * w + x]) && isTent(grid[y * w + (x + 1)])) {
        cell[y * w + x] |= 1 << ERR_ADJ_RIGHT;
        cell[y * w + (x + 1)] |= 1 << ERR_ADJ_LEFT;
      }
    }
  }

  // Numeric-clue violations.
  for (let x = 0; x < w; x++) {
    let tents = 0;
    let maybe = 0;
    for (let y = 0; y < h; y++) {
      if (grid[y * w + x] === TENT) tents++;
      else if (grid[y * w + x] === BLANK) maybe++;
    }
    num[x] = tents > numbers[x] || tents + maybe < numbers[x] ? 1 : 0;
  }
  for (let y = 0; y < h; y++) {
    let tents = 0;
    let maybe = 0;
    for (let x = 0; x < w; x++) {
      if (grid[y * w + x] === TENT) tents++;
      else if (grid[y * w + x] === BLANK) maybe++;
    }
    num[w + y] = tents > numbers[w + y] || tents + maybe < numbers[w + y] ? 1 : 0;
  }

  // Groups of tents with too few trees (bipartite tent/tree components: a
  // component with more tents than trees flags every tent in it).
  {
    const dsf = new Dsf(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w - 1; x++) {
        const a = grid[y * w + x];
        const b = grid[y * w + x + 1];
        if ((a === TREE && b === TENT) || (a === TENT && b === TREE)) {
          dsf.merge(y * w + x, y * w + x + 1);
        }
      }
    }
    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w; x++) {
        const a = grid[y * w + x];
        const b = grid[(y + 1) * w + x];
        if ((a === TREE && b === TENT) || (a === TENT && b === TREE)) {
          dsf.merge(y * w + x, (y + 1) * w + x);
        }
      }
    }
    const tmp = new Int32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const r = dsf.canonify(i);
      if (grid[i] === TREE) tmp[r]++;
      else if (grid[i] === TENT) tmp[r]--;
    }
    for (let i = 0; i < w * h; i++) {
      if (grid[i] === TENT && tmp[dsf.canonify(i)] < 0) cell[i] |= 1 << ERR_OVERCOMMITTED;
    }
  }

  // Groups of trees with too few tents: same, but count BLANK as a potential
  // tent (so a tree is only flagged when there is no room left for its tents).
  {
    const potTent = (v: number) => v === TENT || v === BLANK;
    const dsf = new Dsf(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w - 1; x++) {
        const a = grid[y * w + x];
        const b = grid[y * w + x + 1];
        if ((a === TREE && potTent(b)) || (potTent(a) && b === TREE)) {
          dsf.merge(y * w + x, y * w + x + 1);
        }
      }
    }
    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w; x++) {
        const a = grid[y * w + x];
        const b = grid[(y + 1) * w + x];
        if ((a === TREE && potTent(b)) || (potTent(a) && b === TREE)) {
          dsf.merge(y * w + x, (y + 1) * w + x);
        }
      }
    }
    const tmp = new Int32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const r = dsf.canonify(i);
      if (grid[i] === TREE) tmp[r]++;
      else if (potTent(grid[i])) tmp[r]--;
    }
    for (let i = 0; i < w * h; i++) {
      if (grid[i] === TREE && tmp[dsf.canonify(i)] > 0) cell[i] |= 1 << ERR_OVERCOMMITTED;
    }
  }

  return { cell, num };
}

// --- drag transform (upstream drag_xform, stylus branches dropped — D6) ----

/** Apply an in-progress drag's effect to cell `(x, y)`'s value `v` for the
 * live preview / error feedback. Mirrors upstream `drag_xform`. */
export function dragXform(ui: TentsUi, x: number, y: number, v: number): number {
  let xmin = Math.min(ui.dsx, ui.dex);
  let xmax = Math.max(ui.dsx, ui.dex);
  let ymin = Math.min(ui.dsy, ui.dey);
  let ymax = Math.max(ui.dsy, ui.dey);
  if (ui.dragButton === LEFT_BUTTON) {
    // Left-dragging has no effect: treat it as a click at the drag start.
    xmin = xmax = ui.dsx;
    ymin = ymax = ui.dsy;
  }
  if (x < xmin || x > xmax || y < ymin || y > ymax) return v;
  if (v === TREE) return v; // trees are inviolate
  if (xmin === xmax && ymin === ymax) {
    if (ui.dragButton === LEFT_BUTTON) v = v === BLANK ? TENT : BLANK;
    else v = v === BLANK ? NONTENT : BLANK;
  } else {
    // A drag: only a right-drag has an effect (blanks → non-tents).
    if (ui.dragButton === RIGHT_BUTTON) v = v === BLANK ? NONTENT : v;
  }
  return v;
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
  // An exclamation mark, drawn by hand (draw_text looked off-centre upstream).
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

  const over = (err & (1 << ERR_OVERCOMMITTED)) !== 0;
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
    const r1 = Math.floor(ts / 4);
    const r2 = Math.floor(ts / 8);
    dr.drawCircle({ x: cx, y: ty + Math.floor((ts * 4) / 10) }, r1, col, col);
    dr.drawCircle({ x: cx + Math.floor(ts / 5), y: ty + Math.floor(ts / 4) }, r2, col, col);
    dr.drawCircle({ x: cx - Math.floor(ts / 5), y: ty + Math.floor(ts / 4) }, r2, col, col);
    dr.drawCircle(
      { x: cx + Math.floor(ts / 4), y: ty + Math.floor((ts * 6) / 13) }, r2, col, col,
    );
    dr.drawCircle(
      { x: cx - Math.floor(ts / 4), y: ty + Math.floor((ts * 6) / 13) }, r2, col, col,
    );
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
  if (err & (1 << ERR_ADJ_TOPLEFT)) drawErrAdj(dr, ts, tx, ty);
  if (err & (1 << ERR_ADJ_TOP)) drawErrAdj(dr, ts, tx + half, ty);
  if (err & (1 << ERR_ADJ_TOPRIGHT)) drawErrAdj(dr, ts, tx + ts, ty);
  if (err & (1 << ERR_ADJ_LEFT)) drawErrAdj(dr, ts, tx, ty + half);
  if (err & (1 << ERR_ADJ_RIGHT)) drawErrAdj(dr, ts, tx + ts, ty + half);
  if (err & (1 << ERR_ADJ_BOTLEFT)) drawErrAdj(dr, ts, tx, ty + ts);
  if (err & (1 << ERR_ADJ_BOT)) drawErrAdj(dr, ts, tx + half, ty + ts);
  if (err & (1 << ERR_ADJ_BOTRIGHT)) drawErrAdj(dr, ts, tx + ts, ty + ts);

  // Fork findMistakes overlay: an inset red outline (distinct from the live
  // error red on trunk/leaf/tent).
  if (packed & MISTAKE_BIT) {
    const thick = Math.max(1, Math.floor(ts / 16));
    const inset = Math.max(2, Math.floor(ts / 8));
    const sx = tx + inset;
    const sy = ty + inset;
    const span = ts - 2 * inset;
    dr.drawRect({ x: sx, y: sy, w: span, h: thick }, COL_MISTAKE);
    dr.drawRect({ x: sx, y: sy + span - thick, w: span, h: thick }, COL_MISTAKE);
    dr.drawRect({ x: sx, y: sy, w: thick, h: span }, COL_MISTAKE);
    dr.drawRect({ x: sx + span - thick, y: sy, w: thick, h: span }, COL_MISTAKE);
  }

  if (cur) {
    const coff = Math.floor(ts / 8);
    // A stroked outline via four thin rects (drawRectOutline analogue).
    dr.drawRect({ x: tx + coff, y: ty + coff, w: ts - coff * 2 + 1, h: 1 }, COL_GRID);
    dr.drawRect(
      { x: tx + coff, y: ty + ts - coff, w: ts - coff * 2 + 1, h: 1 }, COL_GRID,
    );
    dr.drawRect({ x: tx + coff, y: ty + coff, w: 1, h: ts - coff * 2 + 1 }, COL_GRID);
    dr.drawRect(
      { x: tx + ts - coff, y: ty + coff, w: 1, h: ts - coff * 2 + 1 }, COL_GRID,
    );
  }

  dr.unclip();
  dr.drawUpdate({ x: tx + 1, y: ty + 1, w: ts - 1, h: ts - 1 });
}

// --- redraw -----------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: TentsDrawState | null,
  _prev: TentsState | null,
  state: TentsState,
  _dir: number,
  ui: TentsUi,
  _animTime: number,
  flashTime: number,
  _hint?: HintStep<TentsMove>,
  mistakes?: readonly TentsMistake[],
): void {
  if (!ds) return;
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
        COL_GRID, 1,
      );
    }
    for (let x = 0; x <= w; x++) {
      dr.drawLine(
        { x: coord(x, ts), y: coord(0, ts) },
        { x: coord(x, ts), y: coord(h, ts) },
        COL_GRID, 1,
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
    errGrid = Int8Array.from(grid);
    errGrid[ui.dsy * w + ui.dsx] = dragXform(ui, ui.dsx, ui.dsy, errGrid[ui.dsy * w + ui.dsx]);
  }
  const errors = findErrors(w, h, errGrid, numbers);

  const mistakeSet = new Set<number>();
  if (mistakes) for (const m of mistakes) mistakeSet.add(m.y * w + m.x);

  const cx = ui.cursorVisible ? ui.cx : -1;
  const cy = ui.cursorVisible ? ui.cy : -1;

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
    if (ds.numbersDrawn[x] !== errors.num[x]) {
      dr.drawRect(
        { x: coord(x, ts), y: coord(h, ts) + 1, w: ts, h: brBorder(ts) - 1 },
        COL_BACKGROUND,
      );
      dr.drawText(
        { x: coord(x, ts) + Math.floor(ts / 2), y: coord(h + 1, ts) },
        { align: "center", baseline: "alphabetic", fontType: "variable", size: numberSize },
        errors.num[x] ? COL_ERROR : COL_GRID,
        String(numbers[x]),
      );
      dr.drawUpdate({ x: coord(x, ts), y: coord(h, ts) + 1, w: ts, h: brBorder(ts) - 1 });
      ds.numbersDrawn[x] = errors.num[x];
    }
  }
  for (let y = 0; y < h; y++) {
    if (ds.numbersDrawn[w + y] !== errors.num[w + y]) {
      dr.drawRect(
        { x: coord(w, ts) + 1, y: coord(y, ts), w: brBorder(ts) - 1, h: ts },
        COL_BACKGROUND,
      );
      dr.drawText(
        { x: coord(w + 1, ts), y: coord(y, ts) + Math.floor(ts / 2) },
        { align: "right", baseline: "mathematical", fontType: "variable", size: numberSize },
        errors.num[w + y] ? COL_ERROR : COL_GRID,
        String(numbers[w + y]),
      );
      dr.drawUpdate({ x: coord(w, ts) + 1, y: coord(y, ts), w: brBorder(ts) - 1, h: ts });
      ds.numbersDrawn[w + y] = errors.num[w + y];
    }
  }
}
