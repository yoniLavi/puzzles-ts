/**
 * Galaxies rendering — imperative `redraw` per the post-Flip doctrine
 * (engine emits no pixels of its own; the game's `!ds.started` branch
 * owns the background fill; per-tile diff cache for incremental
 * repaints). The scene-graph reconciler experiment was withdrawn
 * 2026-05-21; ports stay on imperative `Game.redraw` with the
 * cache-fragility doctrine fixes from `fix-flip-canvas-reshape`.
 */
import type { GameDrawing } from "../../engine/index.ts";
import {
  checkComplete,
  F_DOT,
  F_DOT_BLACK,
  F_EDGE_SET,
  F_TILE_ASSOC,
  type GalaxiesState,
  idx,
  SpaceType,
  spaceTypeAt,
  tileOpposite,
} from "./state.ts";

// --- colour palette indices ----------------------------------------

export const COL_BACKGROUND = 0;
export const COL_WHITEBG = 1;
export const COL_BLACKBG = 2;
export const COL_WHITEDOT = 3;
export const COL_BLACKDOT = 4;
export const COL_GRID = 5;
export const COL_EDGE = 6;
export const COL_ARROW = 7;
export const COL_CURSOR = 8;
export const NCOLOURS = 9;

// --- DrawState ------------------------------------------------------

export interface GalaxiesDrawState {
  w: number;
  h: number;
  tileSize: number;
  started: boolean;
  /** Per-tile cache key from the last paint; -1 = never drawn,
   * triggers a full redraw of that tile next time. */
  cache: BigInt64Array;
  /** Per-tile arrow dx/dy cache. */
  dx: Int16Array;
  dy: Int16Array;
}

const PREFERRED_TILE_SIZE = 32;

export function newDrawState(s: GalaxiesState): GalaxiesDrawState {
  const n = s.w * s.h;
  const cache = new BigInt64Array(n);
  for (let i = 0; i < n; i++) cache[i] = -1n;
  return {
    w: s.w,
    h: s.h,
    tileSize: PREFERRED_TILE_SIZE,
    started: false,
    cache,
    dx: new Int16Array(n),
    dy: new Int16Array(n),
  };
}

export function setTileSize(ds: GalaxiesDrawState, tileSize: number): void {
  if (ds.tileSize === tileSize) return;
  ds.tileSize = tileSize;
  ds.started = false;
  for (let i = 0; i < ds.cache.length; i++) ds.cache[i] = -1n;
}

// --- flags encoded into the per-tile cache key ---------------------

const DRAW_EDGE_L = 1 << 0;
const DRAW_EDGE_R = 1 << 1;
const DRAW_EDGE_U = 1 << 2;
const DRAW_EDGE_D = 1 << 3;
const DRAW_CORNER_UL = 1 << 4;
const DRAW_CORNER_UR = 1 << 5;
const DRAW_CORNER_DL = 1 << 6;
const DRAW_CORNER_DR = 1 << 7;
const DRAW_WHITE = 1 << 8;
const DRAW_BLACK = 1 << 9;
const DRAW_ARROW = 1 << 10;
const DRAW_CURSOR = 1 << 11;
const DOT_SHIFT_C = 12n;
const DOT_SHIFT_M = 2n;
const DOT_WHITE = 1n;
const DOT_BLACK = 2n;

// --- rendering helpers ---------------------------------------------

function drawArrow(
  dr: GameDrawing,
  cx: number,
  cy: number,
  ddx: number,
  ddy: number,
  tileSize: number,
  col: number,
): void {
  const sq = ddx * ddx + ddy * ddy;
  if (sq === 0) return;
  const vlen = Math.sqrt(sq);
  const xdx = ddx / vlen;
  const xdy = ddy / vlen;
  const ydx = -xdy;
  const ydy = xdx;
  const e1x = cx + Math.round((xdx * tileSize) / 3);
  const e1y = cy + Math.round((xdy * tileSize) / 3);
  const e2x = cx - Math.round((xdx * tileSize) / 3);
  const e2y = cy - Math.round((xdy * tileSize) / 3);
  const adx = Math.round(((ydx - xdx) * tileSize) / 8);
  const ady = Math.round(((ydy - xdy) * tileSize) / 8);
  const adx2 = Math.round(((-ydx - xdx) * tileSize) / 8);
  const ady2 = Math.round(((-ydy - xdy) * tileSize) / 8);
  dr.drawLine({ x: e1x, y: e1y }, { x: e2x, y: e2y }, col, 1);
  dr.drawLine({ x: e1x, y: e1y }, { x: e1x + adx, y: e1y + ady }, col, 1);
  dr.drawLine({ x: e1x, y: e1y }, { x: e1x + adx2, y: e1y + ady2 }, col, 1);
}

function drawSquare(
  dr: GameDrawing,
  x: number,
  y: number,
  tileSize: number,
  border: number,
  flags: number,
  dots: bigint,
  ddx: number,
  ddy: number,
): void {
  const lx = x * tileSize + border;
  const ly = y * tileSize + border;
  const edgeThickness = Math.max(tileSize >> 4, 2);
  const cursorSize = (tileSize / 4) | 0;
  const dotSize = (tileSize / 4) | 0;

  dr.clip({ x: lx, y: ly, w: tileSize, h: tileSize });

  // Background
  const bg =
    flags & DRAW_WHITE
      ? COL_WHITEBG
      : flags & DRAW_BLACK
        ? COL_BLACKBG
        : COL_BACKGROUND;
  dr.drawRect({ x: lx, y: ly, w: tileSize, h: tileSize }, bg);

  // Grid lines (top-left only — neighbours will draw their own)
  const gridCol = flags & DRAW_BLACK ? COL_BLACKDOT : COL_GRID;
  dr.drawRect({ x: lx, y: ly, w: 1, h: tileSize }, gridCol);
  dr.drawRect({ x: lx, y: ly, w: tileSize, h: 1 }, gridCol);

  // Arrow or cursor
  if (flags & DRAW_ARROW) {
    drawArrow(
      dr,
      lx + (tileSize >> 1),
      ly + (tileSize >> 1),
      ddx,
      ddy,
      tileSize,
      flags & DRAW_CURSOR ? COL_CURSOR : COL_ARROW,
    );
  } else if (flags & DRAW_CURSOR) {
    // draw_rect_outline equivalent (4 lines).
    const cx = lx + (tileSize >> 1) - cursorSize;
    const cy = ly + (tileSize >> 1) - cursorSize;
    const sz = 2 * cursorSize + 1;
    dr.drawLine({ x: cx, y: cy }, { x: cx + sz - 1, y: cy }, COL_CURSOR, 1);
    dr.drawLine(
      { x: cx, y: cy + sz - 1 },
      { x: cx + sz - 1, y: cy + sz - 1 },
      COL_CURSOR,
      1,
    );
    dr.drawLine({ x: cx, y: cy }, { x: cx, y: cy + sz - 1 }, COL_CURSOR, 1);
    dr.drawLine(
      { x: cx + sz - 1, y: cy },
      { x: cx + sz - 1, y: cy + sz - 1 },
      COL_CURSOR,
      1,
    );
  }

  // Edges
  if (flags & DRAW_EDGE_L) {
    dr.drawRect({ x: lx, y: ly, w: edgeThickness, h: tileSize }, COL_EDGE);
  }
  if (flags & DRAW_EDGE_R) {
    dr.drawRect(
      {
        x: lx + tileSize - edgeThickness + 1,
        y: ly,
        w: edgeThickness - 1,
        h: tileSize,
      },
      COL_EDGE,
    );
  }
  if (flags & DRAW_EDGE_U) {
    dr.drawRect({ x: lx, y: ly, w: tileSize, h: edgeThickness }, COL_EDGE);
  }
  if (flags & DRAW_EDGE_D) {
    dr.drawRect(
      {
        x: lx,
        y: ly + tileSize - edgeThickness + 1,
        w: tileSize,
        h: edgeThickness - 1,
      },
      COL_EDGE,
    );
  }
  if (flags & DRAW_CORNER_UL) {
    dr.drawRect({ x: lx, y: ly, w: edgeThickness, h: edgeThickness }, COL_EDGE);
  }
  if (flags & DRAW_CORNER_UR) {
    dr.drawRect(
      {
        x: lx + tileSize - edgeThickness + 1,
        y: ly,
        w: edgeThickness - 1,
        h: edgeThickness,
      },
      COL_EDGE,
    );
  }
  if (flags & DRAW_CORNER_DL) {
    dr.drawRect(
      {
        x: lx,
        y: ly + tileSize - edgeThickness + 1,
        w: edgeThickness,
        h: edgeThickness - 1,
      },
      COL_EDGE,
    );
  }
  if (flags & DRAW_CORNER_DR) {
    dr.drawRect(
      {
        x: lx + tileSize - edgeThickness + 1,
        y: ly + tileSize - edgeThickness + 1,
        w: edgeThickness - 1,
        h: edgeThickness - 1,
      },
      COL_EDGE,
    );
  }

  // Dots — 9 possible positions per tile (grid-aligned).
  for (let dy0 = 0; dy0 < 3; dy0++) {
    for (let dx0 = 0; dx0 < 3; dx0++) {
      const shift = DOT_SHIFT_C + DOT_SHIFT_M * BigInt(dy0 * 3 + dx0);
      const val = Number((dots >> shift) & ((1n << DOT_SHIFT_M) - 1n));
      if (val) {
        dr.drawCircle(
          { x: lx + ((dx0 * tileSize) >> 1), y: ly + ((dy0 * tileSize) >> 1) },
          dotSize,
          val === 1 ? COL_WHITEDOT : COL_BLACKDOT,
          COL_BLACKDOT,
        );
      }
    }
  }

  dr.unclip();
  dr.drawUpdate({ x: lx, y: ly, w: tileSize, h: tileSize });
}

// --- main redraw ----------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: GalaxiesDrawState | null,
  _prev: GalaxiesState | null,
  s: GalaxiesState,
  _dir: number,
  ui: {
    dragging: boolean;
    dx: number;
    dy: number;
    dotx: number;
    doty: number;
    srcx: number;
    srcy: number;
    curX: number;
    curY: number;
    curVisible: boolean;
  },
  _animTime: number,
  flashTime: number,
): void {
  if (ds === null) return;
  const w = ds.w;
  const h = ds.h;
  const tile = ds.tileSize;
  const border = tile;
  const drawWidth = w * tile + 2 * border;
  const drawHeight = h * tile + 2 * border;
  const edgeThickness = Math.max(tile >> 4, 2);

  let flashing = false;
  if (flashTime > 0) {
    const frame = (flashTime / 0.15) | 0;
    flashing = frame % 2 === 0;
  }

  // First-draw: own the window background and the outer border.
  if (!ds.started) {
    dr.drawRect({ x: 0, y: 0, w: drawWidth, h: drawHeight }, COL_BACKGROUND);
    // Outer border edge frame, matching upstream's first-draw rect.
    dr.drawRect(
      {
        x: border - edgeThickness + 1,
        y: border - edgeThickness + 1,
        w: w * tile + edgeThickness * 2 - 1,
        h: h * tile + edgeThickness * 2 - 1,
      },
      COL_EDGE,
    );
    dr.drawUpdate({ x: 0, y: 0, w: drawWidth, h: drawHeight });
    ds.started = true;
  }

  const cols = checkComplete(s, true).colours;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let flags = 0;
      let ddx = 0;
      let ddy = 0;
      let dots = 0n;

      // Edge flags.
      if (s.flags[idx(s, 2 * x, 2 * y + 1)] & F_EDGE_SET) flags |= DRAW_EDGE_L;
      if (s.flags[idx(s, 2 * x + 2, 2 * y + 1)] & F_EDGE_SET) flags |= DRAW_EDGE_R;
      if (s.flags[idx(s, 2 * x + 1, 2 * y)] & F_EDGE_SET) flags |= DRAW_EDGE_U;
      if (s.flags[idx(s, 2 * x + 1, 2 * y + 2)] & F_EDGE_SET) flags |= DRAW_EDGE_D;

      // Corner flags (from neighbouring edges).
      if (
        (x > 0 && s.flags[idx(s, 2 * x - 1, 2 * y)] & F_EDGE_SET) ||
        (y > 0 && s.flags[idx(s, 2 * x, 2 * y - 1)] & F_EDGE_SET)
      ) {
        flags |= DRAW_CORNER_UL;
      }
      if (
        (x + 1 < w && s.flags[idx(s, 2 * x + 3, 2 * y)] & F_EDGE_SET) ||
        (y > 0 && s.flags[idx(s, 2 * x + 2, 2 * y - 1)] & F_EDGE_SET)
      ) {
        flags |= DRAW_CORNER_UR;
      }
      if (
        (x > 0 && s.flags[idx(s, 2 * x - 1, 2 * y + 2)] & F_EDGE_SET) ||
        (y + 1 < h && s.flags[idx(s, 2 * x, 2 * y + 3)] & F_EDGE_SET)
      ) {
        flags |= DRAW_CORNER_DL;
      }
      if (
        (x + 1 < w && s.flags[idx(s, 2 * x + 3, 2 * y + 2)] & F_EDGE_SET) ||
        (y + 1 < h && s.flags[idx(s, 2 * x + 2, 2 * y + 3)] & F_EDGE_SET)
      ) {
        flags |= DRAW_CORNER_DR;
      }

      // Region colour.
      const ti = idx(s, 2 * x + 1, 2 * y + 1);
      const sFlags = s.flags[ti];
      if (cols?.[y * w + x] && !flashing) {
        flags |= cols[y * w + x] === 2 ? DRAW_BLACK : DRAW_WHITE;
      }

      // Arrow (association indicator).
      let opp: { x: number; y: number } | null = null;
      if (sFlags & F_TILE_ASSOC) opp = tileOpposite(s, 2 * x + 1, 2 * y + 1);
      if (sFlags & F_TILE_ASSOC && cols && !cols[y * w + x]) {
        let suppressArrow = false;
        if (ui.dragging && ui.srcx === 2 * x + 1 && ui.srcy === 2 * y + 1) {
          suppressArrow = true;
        } else if (ui.dragging && opp && ui.srcx === opp.x && ui.srcy === opp.y) {
          suppressArrow = true;
        }
        if (!suppressArrow && (s.doty[ti] !== 2 * y + 1 || s.dotx[ti] !== 2 * x + 1)) {
          flags |= DRAW_ARROW;
          ddy = s.doty[ti] - (2 * y + 1);
          ddx = s.dotx[ti] - (2 * x + 1);
        }
      }

      // Dots in the 3x3 of subcell positions.
      for (let dy0 = 0; dy0 < 3; dy0++) {
        for (let dx0 = 0; dx0 < 3; dx0++) {
          const f = s.flags[idx(s, 2 * x + dx0, 2 * y + dy0)];
          if (f & F_DOT) {
            const v = f & F_DOT_BLACK ? DOT_BLACK : DOT_WHITE;
            dots |= v << (DOT_SHIFT_C + DOT_SHIFT_M * BigInt(dy0 * 3 + dx0));
          }
        }
      }

      // Cursor on tile.
      if (
        ui.curVisible &&
        ui.curX === 2 * x + 1 &&
        ui.curY === 2 * y + 1 &&
        !(sFlags & F_DOT)
      ) {
        flags |= DRAW_CURSOR;
      }

      // Cache key: 16 bits of flags + 64-bit dots field + dx/dy.
      // Pack into a bigint for the cache.
      const key =
        (BigInt(flags) | (dots & ~0xfffn)) ^
        (BigInt(ddx & 0xff) << 56n) ^
        (BigInt(ddy & 0xff) << 48n);
      const cacheI = y * w + x;
      if (ds.cache[cacheI] !== key) {
        drawSquare(dr, x, y, tile, border, flags, dots, ddx, ddy);
        ds.cache[cacheI] = key;
        ds.dx[cacheI] = ddx;
        ds.dy[cacheI] = ddy;
      }
    }
  }

  // Cursor on non-tile cell (vertex/edge) drawn on top.
  if (ui.curVisible) {
    const t = spaceTypeAt(ui.curX, ui.curY);
    if (t !== SpaceType.Tile) {
      const curSize = (tile / 4) | 0;
      const cx = ((ui.curX * tile) >> 1) + border;
      const cy = ((ui.curY * tile) >> 1) + border;
      const dx0 = ui.curX % 2 ? curSize : (curSize / 3) | 0;
      const dy0 = ui.curY % 2 ? curSize : (curSize / 3) | 0;
      dr.drawRect(
        { x: cx - dx0, y: cy - dy0, w: dx0 * 2 + 1, h: dy0 * 2 + 1 },
        COL_CURSOR,
      );
      dr.drawUpdate({
        x: cx - curSize,
        y: cy - curSize,
        w: curSize * 2 + 1,
        h: curSize * 2 + 1,
      });
    }
  }

  // Drag arrow on top of the regular tiles.
  if (ui.dragging) {
    const ax = ui.dx;
    const ay = ui.dy;
    const oppx = 2 * (((ui.dotx * tile) >> 1) + border) - ax;
    const oppy = 2 * (((ui.doty * tile) >> 1) + border) - ay;
    drawArrow(
      dr,
      ax,
      ay,
      ((ui.dotx * tile) >> 1) + border - ax,
      ((ui.doty * tile) >> 1) + border - ay,
      tile,
      COL_ARROW,
    );
    drawArrow(
      dr,
      oppx,
      oppy,
      ((ui.dotx * tile) >> 1) + border - oppx,
      ((ui.doty * tile) >> 1) + border - oppy,
      tile,
      COL_ARROW,
    );
    // The drag overlay isn't part of the per-tile cache; invalidate
    // the cells under it so the next non-drag redraw repaints them.
    const ts = tile;
    const aTileX = Math.floor((ax - border) / ts) | 0;
    const aTileY = Math.floor((ay - border) / ts) | 0;
    if (aTileX >= 0 && aTileX < w && aTileY >= 0 && aTileY < h) {
      ds.cache[aTileY * w + aTileX] = -1n;
    }
    dr.drawUpdate({ x: 0, y: 0, w: drawWidth, h: drawHeight });
  }
}
