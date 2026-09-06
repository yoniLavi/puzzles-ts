/**
 * Pegs' renderer: the beveled board, the pegs, the cursor ring, the held-peg
 * ring, and the blitter-backed drag.
 *
 * The board's pixel origin lives here and `interpretMove` imports its
 * `fromCoordWithTileSize` — one function, both callers
 * (`docs/games/mechanics.md`).
 */

import { mkhighlight } from "../../engine/color/color-mkhighlight.ts";
import { BLUE, PURPLE } from "../../engine/color/colors.ts";
import { HELD } from "../../engine/color/palette.ts";
import { drawRaisedBevel, raisedBevelWidth } from "../../engine/draw.ts";
import type { GameDrawing } from "../../engine/game.ts";
import { coord as coordE, fromCoord as fromCoordE } from "../../engine/geometry.ts";
import type { Color, Point, Size } from "../../engine/types.ts";
import type { PegsParams, PegsState, PegsUi } from "./index.ts";

// --- grid cell values ------------------------------------------------
// These live here rather than in `index.ts` because `render.ts` must import no
// *value* from it — a value import both ways is a runtime cycle, and Pegs has
// no `state.ts` to hold the vocabulary instead.

export const GRID_HOLE = 0;
export const GRID_PEG = 1;
export const GRID_OBST = 2;

export const PREFERRED_TILE_SIZE = 33;

/** Draw-state overlay: cursor ring on the cell. */
const GRID_CURSOR = 10;
/** Draw-state overlay: jumping-mode highlight on the cell. */
const GRID_JUMPING = 20;

// --- color indices --------------------------------------------------

const COL_BACKGROUND = 0;
const COL_HIGHLIGHT = 1;
const COL_LOWLIGHT = 2;
const COL_PEG = 3;
const COL_CURSOR = 4;
/** Appended past the C enum: the ring round a peg the keyboard has picked up
 * to jump with, which upstream drew in the cursor color. */
const COL_HELD = 5;

// --- flash timing ----------------------------------------------------

export const FLASH_FRAME = 0.13;

export interface PegsDrawState {
  tileSize: number;
  dragBackground: unknown; // blitter handle
  dragging: boolean;
  dragX: number;
  dragY: number;
  w: number;
  h: number;
  /** Per-tile cache of last-drawn cell value (including cursor/jumping overlays). */
  grid: Uint8Array;
  started: boolean;
  bgColor: number;
}
// --- coordinate helpers ----------------------------------------------

const highlightWidth = raisedBevelWidth;

function border(ts: number): number {
  return Math.floor(ts / 2);
}

function coord(x: number, ts: number): number {
  return coordE(x, ts, border(ts));
}

export function fromCoordWithTileSize(x: number, ts: number): number {
  return fromCoordE(x, ts, border(ts));
}

// --- colors ---------------------------------------------------------

export function colors(defaultBackground: Color): Color[] {
  const {
    background: bg,
    highlight: hi,
    lowlight: lo,
  } = mkhighlight(defaultBackground);

  // The cursor paints the whole cursor cell — the peg under it, or the hole
  // under it, which upstream showed as a raised bevel instead.
  return [
    bg, // COL_BACKGROUND
    hi, // COL_HIGHLIGHT
    lo, // COL_LOWLIGHT
    BLUE, // COL_PEG — the piece's own color, as upstream paints it
    PURPLE, // COL_CURSOR — not CURSOR: green is the held ring; purple as Spokes
    HELD, // COL_HELD — a peg picked up to jump with
  ];
}

// --- computeSize / setTileSize ---------------------------------------

export function computeSize(p: PegsParams, ts: number): Size {
  const b = border(ts);
  return {
    w: ts * p.w + 2 * b,
    h: ts * p.h + 2 * b,
  };
}

export function setTileSize(ds: PegsDrawState, ts: number): void {
  if (ds.tileSize !== ts) {
    ds.tileSize = ts;
    ds.started = false;
    ds.grid.fill(255);
  }
}

// --- draw state ------------------------------------------------------

export function newDrawState(s: PegsState): PegsDrawState {
  return {
    tileSize: 0,
    dragBackground: null,
    dragging: false,
    dragX: 0,
    dragY: 0,
    w: s.w,
    h: s.h,
    grid: new Uint8Array(s.w * s.h).fill(255),
    started: false,
    bgColor: -1,
  };
}

// --- draw_tile -------------------------------------------------------

function drawTile(
  dr: GameDrawing,
  ds: PegsDrawState,
  x: number,
  y: number,
  v: number,
  bgColor: number,
): void {
  const ts = ds.tileSize;
  let jumping = false;
  let cursor = false;

  if (bgColor >= 0) {
    dr.drawRect({ x, y, w: ts, h: ts }, bgColor);
  }

  if (v >= GRID_JUMPING) {
    jumping = true;
    v -= GRID_JUMPING;
  }
  if (v >= GRID_CURSOR) {
    cursor = true;
    v -= GRID_CURSOR;
  }

  // Whole pixels: upstream's TILESIZE/2 &c. are integer divisions, and the
  // drawing API is defined on integer coordinates. At an odd tile size a bare
  // `/` leaves a half-pixel that anti-aliases the pegs and, worse, shifts the
  // drag sprite's flush TILESIZE blitter off the tile it has to erase.
  const half = Math.floor(ts / 2);
  if (v === GRID_HOLE) {
    const bg = cursor ? COL_CURSOR : COL_LOWLIGHT;
    dr.drawCircle({ x: x + half, y: y + half }, Math.floor(ts / 4), bg, bg);
  } else if (v === GRID_PEG) {
    // Under the cursor the whole peg takes the cursor color; picked up to
    // jump, it keeps its own color inside a held ring.
    const outerBg = cursor ? COL_CURSOR : jumping ? COL_HELD : COL_PEG;
    const innerBg = cursor ? COL_CURSOR : COL_PEG;
    dr.drawCircle({ x: x + half, y: y + half }, Math.floor(ts / 3), outerBg, outerBg);
    dr.drawCircle({ x: x + half, y: y + half }, Math.floor(ts / 4), innerBg, innerBg);
  }

  dr.drawUpdate({ x, y, w: ts, h: ts });
}

// --- redraw ----------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: PegsDrawState,
  _prev: PegsState | null,
  s: PegsState,
  _dir: number,
  ui: PegsUi,
  _animTime: number,
  flashTime: number,
): void {
  const { w, h } = s;
  const ts = ds.tileSize;
  const hw = highlightWidth(ts);
  const b = border(ts);

  let bgColor: number;
  if (flashTime > 0) {
    const frame = Math.floor(flashTime / FLASH_FRAME);
    bgColor = frame % 2 ? COL_LOWLIGHT : COL_HIGHLIGHT;
  } else {
    bgColor = COL_BACKGROUND;
  }

  // Erase the sprite currently being dragged, if any.
  if (ds.dragging) {
    if (ds.dragBackground) {
      dr.blitterLoad(ds.dragBackground, { x: ds.dragX, y: ds.dragY });
      dr.drawUpdate({ x: ds.dragX, y: ds.dragY, w: ts, h: ts });
    }
    ds.dragging = false;
  }

  if (!ds.started) {
    // First-draw setup: relief borders around all playable cells.
    // Four passes, matching C's game_redraw.

    // Pass 1: diagonal corner triangles.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (s.grid[y * w + x] !== GRID_OBST) {
          const cx = coord(x, ts);
          const cy = coord(y, ts);
          // The relief extends `hw` *outside* the cell, unlike the other five,
          // because Pegs bevels the gaps between playable cells rather than
          // the cells themselves.
          drawRaisedBevel(
            dr,
            {
              left: cx - hw,
              top: cy - hw,
              right: cx + ts + hw - 1,
              bottom: cy + ts + hw - 1,
            },
            COL_HIGHLIGHT,
            COL_LOWLIGHT,
          );
        }
      }
    }

    // Pass 2: overlapping rectangles to fill the edges.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (s.grid[y * w + x] !== GRID_OBST) {
          const cx = coord(x, ts);
          const cy = coord(y, ts);
          dr.drawRect(
            { x: cx - hw, y: cy - hw, w: ts + hw, h: ts + hw },
            COL_HIGHLIGHT,
          );
          dr.drawRect({ x: cx, y: cy, w: ts + hw, h: ts + hw }, COL_LOWLIGHT);
        }
      }
    }

    // Pass 3: trapeziums on each edge.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (s.grid[y * w + x] !== GRID_OBST) {
          const cx = coord(x, ts);
          const cy = coord(y, ts);
          for (let ddx = 0; ddx < 2; ddx++) {
            const ddy = 1 - ddx;
            for (let si = 0; si < 2; si++) {
              const sn = 2 * si - 1;
              const c = si ? COL_LOWLIGHT : COL_HIGHLIGHT;
              const coords: Point[] = [
                { x: cx + si * ddx * (ts - 1), y: cy + si * ddy * (ts - 1) },
                {
                  x: cx + (si * ddx + ddy) * (ts - 1),
                  y: cy + (si * ddy + ddx) * (ts - 1),
                },
                {
                  x: cx + (si * ddx + ddy) * (ts - 1) - hw * (ddy - sn * ddx),
                  y: cy + (si * ddy + ddx) * (ts - 1) - hw * (ddx - sn * ddy),
                },
                {
                  x: cx + si * ddx * (ts - 1) + hw * (ddy + sn * ddx),
                  y: cy + si * ddy * (ts - 1) + hw * (ddx + sn * ddy),
                },
              ];
              dr.drawPolygon(coords, c, c);
            }
          }
        }
      }
    }

    // Pass 4: fill playable cells with background color.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (s.grid[y * w + x] !== GRID_OBST) {
          dr.drawRect(
            { x: coord(x, ts), y: coord(y, ts), w: ts, h: ts },
            COL_BACKGROUND,
          );
        }
      }
    }

    ds.started = true;
    dr.drawUpdate({
      x: 0,
      y: 0,
      w: ts * w + 2 * b,
      h: ts * h + 2 * b,
    });
  }

  // Incremental redraw: only changed cells.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = s.grid[y * w + x];
      // Blank the drag source so the peg looks picked up.
      if (ui.dragging && ui.sx === x && ui.sy === y && v === GRID_PEG) {
        v = GRID_HOLE;
      }
      if (ui.cursor.visible && ui.cursor.x === x && ui.cursor.y === y) {
        v += ui.curJumping ? GRID_JUMPING : GRID_CURSOR;
      }
      if (v !== GRID_OBST && (bgColor !== ds.bgColor || v !== ds.grid[y * w + x])) {
        drawTile(dr, ds, coord(x, ts), coord(y, ts), v, bgColor);
        ds.grid[y * w + x] = v;
      }
    }
  }

  // Draw the dragging sprite.
  if (ui.dragging) {
    // Allocate the blitter lazily (we don't have GameDrawing in setTileSize).
    if (!ds.dragBackground) {
      ds.dragBackground = dr.blitterNew({ w: ts, h: ts });
    }
    ds.dragging = true;
    ds.dragX = ui.dx - Math.floor(ts / 2);
    ds.dragY = ui.dy - Math.floor(ts / 2);
    dr.blitterSave(ds.dragBackground, { x: ds.dragX, y: ds.dragY });
    drawTile(dr, ds, ds.dragX, ds.dragY, GRID_PEG, -1);
  }

  ds.bgColor = bgColor;
}
