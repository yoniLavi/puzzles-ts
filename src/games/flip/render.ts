/**
 * Flip's renderer: the two-faced tiles, the diagonal marks that show which
 * neighbors a click will flip, the cursor ring and the win flash.
 */

import { CURSOR, GRID_MID, HINT_ACTION, PAPER } from "../../engine/color/palette.ts";
import { flipWrongFace } from "../../engine/color/palette-games.ts";
import type { GameDrawing } from "../../engine/game.ts";
import type { Color, Point, Size } from "../../engine/types.ts";
import type { FlipParams, FlipState, FlipUi } from "./state.ts";

export interface FlipDrawState {
  started: boolean;
  tileSize: number;
  /** Per-cell render cache: the bits `drawTile` last drew (the grid's, plus 4
   * for the cursor); -1 = never drawn, {@link ANIMATING} mid-flip. */
  tiles: Int16Array;
}

/** The cache entry of a tile mid-flip, which repaints on every frame. */
const ANIMATING = 255;

// Color palette indices (upstream's enum).
const COL_BACKGROUND = 0;
const COL_WRONG = 1;
const COL_RIGHT = 2;
const COL_GRID = 3;
const COL_DIAG = 4;
const COL_HINT = 5;
const COL_CURSOR = 6;
const NCOLORS = 7;

export const PREFERRED_TILE_SIZE = 48;
export const ANIM_TIME = 0.25;
export const FLASH_FRAME = 0.07;

/** The board's pixel origin: half a tile on every side. `interpretMove` reads it
 * too, so input and drawing cannot disagree. */
export function border(tileSize: number): number {
  return tileSize >> 1;
}

export function newDrawState(s: FlipState): FlipDrawState {
  return {
    started: false,
    tileSize: PREFERRED_TILE_SIZE,
    tiles: new Int16Array(s.w * s.h).fill(-1),
  };
}

export function setTileSize(ds: FlipDrawState, tileSize: number): void {
  if (ds.tileSize !== tileSize) {
    ds.tileSize = tileSize;
    ds.started = false;
    ds.tiles.fill(-1);
  }
}

export function colors(defaultBackground: Color): Color[] {
  const bg = defaultBackground;
  const ret: Color[] = new Array(NCOLORS);
  ret[COL_BACKGROUND] = bg;
  ret[COL_WRONG] = flipWrongFace(bg);
  ret[COL_RIGHT] = PAPER;
  // The mid step, not the dark one: the diagonal marks sit on both the
  // paper face and the dark face, and only a mid gray shows on each.
  ret[COL_GRID] = GRID_MID;
  ret[COL_DIAG] = ret[COL_GRID];
  ret[COL_HINT] = HINT_ACTION;
  ret[COL_CURSOR] = CURSOR;
  return ret;
}

export function computeSize(p: FlipParams, tileSize: number): Size {
  const b = border(tileSize);
  return {
    w: tileSize * p.w + 2 * b,
    h: tileSize * p.h + 2 * b,
  };
}

export function redraw(
  dr: GameDrawing,
  ds: FlipDrawState,
  prev: FlipState | null,
  s: FlipState,
  _dir: number,
  ui: FlipUi,
  animTime: number,
  flashTime: number,
): void {
  const { w, h } = s;
  const wh = w * h;
  const tile = ds.tileSize;
  const b = border(tile);

  if (!ds.started) {
    // A fresh draw state (first paint, resize, palette change) clears the whole
    // window: the engine paints nothing of its own, so that it never overpaints
    // cached tiles. Upstream's midend.c drew this first rect itself.
    const winW = tile * w + 2 * b;
    const winH = tile * h + 2 * b;
    dr.drawRect({ x: 0, y: 0, w: winW, h: winH }, COL_BACKGROUND);
    for (let i = 0; i <= w; i++) {
      dr.drawLine(
        { x: i * tile + b, y: b },
        { x: i * tile + b, y: h * tile + b },
        COL_GRID,
        1,
      );
    }
    for (let i = 0; i <= h; i++) {
      dr.drawLine(
        { x: b, y: i * tile + b },
        { x: w * tile + b, y: i * tile + b },
        COL_GRID,
        1,
      );
    }
    dr.drawUpdate({ x: 0, y: 0, w: winW, h: winH });
    ds.started = true;
  }

  const flashFrame = flashTime ? Math.floor(flashTime / FLASH_FRAME) : -1;
  const progress = animTime / ANIM_TIME;
  // A light that changed since `prev` is mid-flip, keyed 255 so it redraws every
  // frame; with animTime 0 the final state is drawn and `prev` is irrelevant.
  const animating = animTime > 0 && prev != null;

  for (let i = 0; i < wh; i++) {
    const x = i % w;
    const y = (i / w) | 0;
    let v = s.grid[i];
    if (flashFrame >= 0) {
      const fx = (((w + 1) / 2) | 0) - Math.min(x + 1, w - x);
      const fy = (((h + 1) / 2) | 0) - Math.min(y + 1, h - y);
      const fd = Math.max(fx, fy);
      if (fd === flashFrame) v |= 1;
      else if (fd === flashFrame - 1) v &= ~1;
    }
    if (!s.hintsActive) v &= ~2;
    if (ui.cursor.visible && ui.cursor.x === x && ui.cursor.y === y) v |= 4;

    const drawn = animating && prev && (s.grid[i] ^ prev.grid[i]) & ~2 ? ANIMATING : v;
    if (ds.tiles[i] === ANIMATING || drawn === ANIMATING || ds.tiles[i] !== drawn) {
      drawTile(dr, ds, s, x, y, v, drawn === ANIMATING, progress);
      ds.tiles[i] = drawn;
    }
  }
}

function drawTile(
  dr: GameDrawing,
  ds: FlipDrawState,
  s: FlipState,
  x: number,
  y: number,
  v: number,
  anim: boolean,
  progress: number,
): void {
  const { w, h } = s;
  const wh = w * h;
  const ts = ds.tileSize;
  const bx = x * ts + border(ts);
  const by = y * ts + border(ts);
  const dcol = v & 4 ? COL_CURSOR : COL_DIAG;

  dr.clip({ x: bx + 1, y: by + 1, w: ts - 1, h: ts - 1 });
  dr.drawRect(
    { x: bx + 1, y: by + 1, w: ts - 1, h: ts - 1 },
    anim ? COL_BACKGROUND : v & 1 ? COL_WRONG : COL_RIGHT,
  );

  if (anim) {
    const at = Math.floor(ts * progress);
    const coords: Point[] = [
      { x: bx + ts, y: by },
      { x: bx + at, y: by + at },
      { x: bx, y: by + ts },
      { x: bx + ts - at, y: by + ts - at },
    ];
    let color = v & 1 ? COL_WRONG : COL_RIGHT;
    if (progress < 0.5) color = COL_WRONG + COL_RIGHT - color;
    dr.drawPolygon(coords, color, COL_GRID);
  }

  for (let i = 0; i < h; i++) {
    for (let j = 0; j < w; j++) {
      if (!s.matrix[(y * w + x) * wh + i * w + j]) continue;
      const ox = j - x;
      const oy = i - y;
      const td = Math.max(1, (ts / 16) | 0);
      const cx = bx + ((ts / 2) | 0) + (2 * ox - 1) * td;
      const cy = by + ((ts / 2) | 0) + (2 * oy - 1) * td;
      if (ox === 0 && oy === 0) {
        dr.drawRect({ x: cx, y: cy, w: 2 * td + 1, h: 2 * td + 1 }, dcol);
      } else {
        dr.drawLine({ x: cx, y: cy }, { x: cx + 2 * td, y: cy }, dcol, 1);
        dr.drawLine(
          { x: cx, y: cy + 2 * td },
          { x: cx + 2 * td, y: cy + 2 * td },
          dcol,
          1,
        );
        dr.drawLine({ x: cx, y: cy }, { x: cx, y: cy + 2 * td }, dcol, 1);
        dr.drawLine(
          { x: cx + 2 * td, y: cy },
          { x: cx + 2 * td, y: cy + 2 * td },
          dcol,
          1,
        );
      }
    }
  }

  if (v & 2) {
    let x1 = bx + ((ts / 20) | 0);
    let x2 = bx + ts - ((ts / 20) | 0);
    let y1 = by + ((ts / 20) | 0);
    let y2 = by + ts - ((ts / 20) | 0);
    for (let k = 0; k < 3; k++) {
      dr.drawLine({ x: x1, y: y1 }, { x: x2, y: y1 }, COL_HINT, 1);
      dr.drawLine({ x: x1, y: y2 }, { x: x2, y: y2 }, COL_HINT, 1);
      dr.drawLine({ x: x1, y: y1 }, { x: x1, y: y2 }, COL_HINT, 1);
      dr.drawLine({ x: x2, y: y1 }, { x: x2, y: y2 }, COL_HINT, 1);
      x1++;
      y1++;
      x2--;
      y2--;
    }
  }

  dr.unclip();
  dr.drawUpdate({ x: bx + 1, y: by + 1, w: ts - 1, h: ts - 1 });
}
