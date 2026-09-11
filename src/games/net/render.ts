/**
 * Net's renderer, a port of `game_redraw`/`draw_tile`/`draw_wires` from net.c.
 * The model is shared with Netslide but the pixels are not: Net draws thick
 * scalable wires as rotated polygons, where Netslide draws fixed offset lines.
 *
 * The per-tile cache word packs every visible feature of a tile (barriers,
 * corners, cursor, the four wires at two bits each, the endpoint, neighbor
 * wires reaching onto our edges, the rotating flag, the locked flag) so the
 * diff key is that single `Int32` (docs/games/rendering.md § "The tile cache and the diff key"). The frame is drawn over a
 * `(w+2)×(h+2)` grid — one ring wider than the board — so a barrier on the outer
 * edge has somewhere to draw its outline.
 */

import { BLUE, RED, TEAL } from "../../engine/color/colors.ts";
import { CURSOR, ERROR, GRID_MID, INK } from "../../engine/color/palette.ts";
import { netLocked } from "../../engine/color/palette-games.ts";
import type { GameDrawing } from "../../engine/game.ts";
import type { Color, Point, Size } from "../../engine/types.ts";
import {
  anticlockwise,
  clockwise,
  D,
  DIRECTIONS,
  dirX,
  dirY,
  L,
  offset,
  opposite,
  R,
  U,
} from "../../engine/wires.ts";
import { computeLoops, ERR_SHIFT } from "./loops.ts";
import { ACTIVE, computeActive, LOCKED, type NetState, type NetUi } from "./state.ts";

export const PREFERRED_TILE_SIZE = 32;
export const ROTATE_TIME = 0.13;
export const FLASH_FRAME = 0.07;

// Palette, index-for-index with net.c's color enum.
export const COL_BACKGROUND = 0;
export const COL_LOCKED = 1;
export const COL_BORDER = 2;
export const COL_WIRE = 3;
export const COL_ENDPOINT = 4;
export const COL_POWERED = 5;
export const COL_BARRIER = 6;
export const COL_ERR = 7;
/** Appended past the C enum (Net has no dark-mode `paletteOverrides`, so nothing
 * addresses a slot by number): the keyboard cursor's ring. Upstream drew it in
 * the locked tint, or the board on a locked tile — a tint of the board either
 * way, which is the one thing a cursor must not be. */
export const COL_CURSOR = 8;

export function colors(defaultBackground: Color): Color[] {
  const out: Color[] = [];
  out[COL_BACKGROUND] = defaultBackground;
  out[COL_WIRE] = INK;
  out[COL_POWERED] = TEAL;
  out[COL_BARRIER] = RED;
  out[COL_ERR] = ERROR;
  out[COL_ENDPOINT] = BLUE;
  out[COL_BORDER] = GRID_MID;
  out[COL_LOCKED] = netLocked(defaultBackground);
  out[COL_CURSOR] = CURSOR;
  return out;
}

// Packed cache-word layout (mirrors net.c's TILE_* flags).
const TILE_BARRIER_SHIFT = 0; // 4 bits: R U L D
const TILE_BARRIER_CORNER_SHIFT = 4; // 4 bits: RU UL LD DR
const TILE_KEYBOARD_CURSOR = 1 << 8;
const TILE_WIRE_SHIFT = 9; // 8 bits: 2 per dir — 0 none,1 unpowered,2 powered,3 error
const TILE_ENDPOINT_SHIFT = 17; // 2 bits: 0 none,1 unpowered,2 powered,3 source
const TILE_WIRE_ON_EDGE_SHIFT = 19; // 8 bits, same encoding as TILE_WIRE_SHIFT
const TILE_ROTATING = 1 << 27;
const TILE_LOCKED = 1 << 28;

export const lineThick = (ts: number): number => Math.floor((ts + 47) / 48);

export interface NetDrawState {
  started: boolean;
  tilesize: number;
  w: number;
  h: number;
  /** Last-drawn cache word per `(w+2)×(h+2)` cell (the outer ring holds barrier
   * outlines), −1 = "repaint unconditionally". */
  visible: Int32Array;
  /** Per-frame scratch for the target cache word. */
  toDraw: Int32Array;
}

export function newDrawState(s: NetState): NetDrawState {
  const cells = (s.w + 2) * (s.h + 2);
  return {
    started: false,
    tilesize: 0,
    w: s.w,
    h: s.h,
    visible: new Int32Array(cells).fill(-1),
    toDraw: new Int32Array(cells),
  };
}

export function setTileSize(ds: NetDrawState, tileSize: number): void {
  ds.tilesize = tileSize;
}

/** The board and its closing grid line, with no margin (upstream's
 * `NARROW_BORDERS`). */
export function computeSize(p: { w: number; h: number }, tileSize: number): Size {
  const lt = lineThick(tileSize);
  return { w: tileSize * p.w + lt, h: tileSize * p.h + lt };
}

/** Index of cell `(x, y)` in the `(w+2)×(h+2)` cache arrays. */
function cell(ds: NetDrawState, x: number, y: number): number {
  return (y + 1) * (ds.w + 2) + (x + 1);
}

/** `(ix, iy)` rotated by `matrix` about `(cx, cy)`, rounded to the pixel. */
function rotatedPoint(
  matrix: readonly number[],
  cx: number,
  cy: number,
  ix: number,
  iy: number,
): Point {
  return {
    x: Math.floor(matrix[0] * ix + matrix[2] * iy + cx + 0.5),
    y: Math.floor(matrix[1] * ix + matrix[3] * iy + cy + 0.5),
  };
}

/**
 * Draw the wires of one color pass as a single filled polygon. `bitmap`
 * selects which wire types (by the 2-bit code) this pass paints, so the black
 * base, the cyan powered wires and the red error wires are three overlaid
 * polygons.
 */
function drawWires(
  dr: GameDrawing,
  cx: number,
  cy: number,
  radius: number,
  tile: number,
  bitmap: number,
  color: number,
  halfwidth: number,
  matrix: readonly number[],
): void {
  const points: Point[] = [];
  const at = (ix: number, iy: number) => {
    points.push(rotatedPoint(matrix, cx, cy, ix, iy));
  };
  let anyWire = false;

  for (let d = 1, dsh = 0; d < 16; d *= 2, dsh++) {
    const wiretype = (tile >> (TILE_WIRE_SHIFT + 2 * dsh)) & 3;
    const cw = clockwise(d);
    const acw = anticlockwise(d);

    at(halfwidth * (dirX(d) + dirX(cw)), halfwidth * (dirY(d) + dirY(cw)));

    if (bitmap & (1 << wiretype)) {
      const ox = radius * dirX(d);
      const oy = radius * dirY(d);
      at(ox + halfwidth * dirX(cw), oy + halfwidth * dirY(cw));
      at(ox + halfwidth * dirX(acw), oy + halfwidth * dirY(acw));
      anyWire = true;
    }
  }

  if (anyWire) dr.drawPolygon(points, color, color);
}

function drawTile(
  dr: GameDrawing,
  ds: NetDrawState,
  x: number,
  y: number,
  tile: number,
  angle: number,
): void {
  const ts = ds.tilesize;
  const lt = lineThick(ts);
  const borderBr = Math.floor(lt / 2);
  const borderTl = lt - borderBr;
  const barrierOutline = Math.floor((lt + 1) / 2);

  const tx = ts * x + borderBr;
  const ty = ts * y + borderBr;

  // Clip to the tile boundary, tightened when drawing just outside the grid.
  let clipx = tx;
  let clipX = tx + ts;
  let clipy = ty;
  let clipY = ty + ts;
  if (x === -1) clipx = clipX - borderBr - barrierOutline;
  else if (x === ds.w) clipX = clipx + borderTl + barrierOutline;
  if (y === -1) clipy = clipY - borderBr - barrierOutline;
  else if (y === ds.h) clipY = clipy + borderTl + barrierOutline;
  const clipw = clipX - clipx;
  const cliph = clipY - clipy;
  dr.clip({ x: clipx, y: clipy, w: clipw, h: cliph });

  const bg = tile & TILE_LOCKED ? COL_LOCKED : COL_BACKGROUND;
  dr.drawRect({ x: clipx, y: clipy, w: clipw, h: cliph }, bg);

  // Grid lines.
  {
    const gridl = x === -1 ? tx + ts - borderBr : tx;
    const gridr = x === ds.w ? tx + borderTl : tx + ts;
    const gridu = y === -1 ? ty + ts - borderBr : ty;
    const gridd = y === ds.h ? ty + borderTl : ty + ts;
    if (x >= 0)
      dr.drawRect({ x: tx, y: gridu, w: borderTl, h: gridd - gridu }, COL_BORDER);
    if (y >= 0)
      dr.drawRect({ x: gridl, y: ty, w: gridr - gridl, h: borderTl }, COL_BORDER);
    if (x < ds.w)
      dr.drawRect(
        { x: tx + ts - borderBr, y: gridu, w: borderBr, h: gridd - gridu },
        COL_BORDER,
      );
    if (y < ds.h)
      dr.drawRect(
        { x: gridl, y: ty + ts - borderBr, w: gridr - gridl, h: borderBr },
        COL_BORDER,
      );
  }

  // Keyboard cursor: an inset ring.
  if (tile & TILE_KEYBOARD_CURSOR) {
    const insetOuter = Math.floor(ts / 8);
    const insetInner = insetOuter + lt;
    dr.drawRect(
      {
        x: tx + insetOuter,
        y: ty + insetOuter,
        w: ts - 2 * insetOuter,
        h: ts - 2 * insetOuter,
      },
      COL_CURSOR,
    );
    dr.drawRect(
      {
        x: tx + insetInner,
        y: ty + insetInner,
        w: ts - 2 * insetInner,
        h: ts - 2 * insetInner,
      },
      bg,
    );
  }

  let radius = Math.floor((ts + 1) / 2);
  const cx = tx + radius;
  const cy = ty + radius;
  radius++;

  // Protrusions of neighboring cells' wires into our edges — only when our own
  // wire won't overdraw them (no wire here, or we're rotating).
  for (let d = 1, dsh = 0; d < 16; d *= 2, dsh++) {
    const edgetype = (tile >> (TILE_WIRE_ON_EDGE_SHIFT + 2 * dsh)) & 3;
    if (edgetype === 0) continue;
    if (!(tile & TILE_ROTATING) && ((tile >> (TILE_WIRE_SHIFT + 2 * dsh)) & 3) !== 0) {
      continue;
    }

    for (let pass = 0; pass < 2; pass++) {
      const col =
        pass === 0 || edgetype === 1
          ? COL_WIRE
          : edgetype === 2
            ? COL_POWERED
            : COL_ERR;
      const halfwidth = pass === 0 ? 2 * lt - 1 : lt - 1;

      let rx: number;
      let rw: number;
      if (dirX(d) < 0) {
        rx = tx;
        rw = borderTl;
      } else if (dirX(d) > 0) {
        rx = tx + ts - borderBr;
        rw = borderBr;
      } else {
        rx = cx - halfwidth;
        rw = 2 * halfwidth + 1;
      }

      let ry: number;
      let rh: number;
      if (dirY(d) < 0) {
        ry = ty;
        rh = borderTl;
      } else if (dirY(d) > 0) {
        ry = ty + ts - borderBr;
        rh = borderBr;
      } else {
        ry = cy - halfwidth;
        rh = 2 * halfwidth + 1;
      }

      dr.drawRect({ x: rx, y: ry, w: rw, h: rh }, col);
    }
  }

  // Rotation matrix for the centered cell contents.
  const matrix = [1, 0, 0, 1];
  if (tile & TILE_ROTATING) {
    matrix[0] = Math.cos((angle * Math.PI) / 180);
    matrix[2] = Math.sin((angle * Math.PI) / 180);
  }
  matrix[3] = matrix[0];
  matrix[1] = -matrix[2];

  // Wires: black base, then powered (cyan) and error (red) overlays.
  drawWires(dr, cx, cy, radius, tile, 0xe, COL_WIRE, 2 * lt - 1, matrix);
  drawWires(dr, cx, cy, radius, tile, 0x4, COL_POWERED, lt - 1, matrix);
  drawWires(dr, cx, cy, radius, tile, 0x8, COL_ERR, lt - 1, matrix);

  // Central box (endpoint / source): an outline pass, then the fill.
  const endtype = (tile >> TILE_ENDPOINT_SHIFT) & 3;
  if (endtype) {
    for (let pass = 0; pass < 2; pass++) {
      const boxr = ts * 0.24 + (pass === 0 ? lt - 1 : 0);
      const col =
        pass === 0 || endtype === 3
          ? COL_WIRE
          : endtype === 2
            ? COL_POWERED
            : COL_ENDPOINT;
      const corners = [
        [+1, +1],
        [+1, -1],
        [-1, -1],
        [-1, +1],
      ];
      const points = corners.map(([sx, sy]) =>
        rotatedPoint(matrix, cx, cy, boxr * sx, boxr * sy),
      );
      dr.drawPolygon(points, col, COL_WIRE);
    }
  }

  // Barriers along grid edges (outline pass then red pass).
  for (let pass = 0; pass < 2; pass++) {
    let btl = borderTl;
    let bbr = borderBr;
    let col = COL_BARRIER;
    if (pass === 0) {
      btl += barrierOutline;
      bbr += barrierOutline;
      col = COL_WIRE;
    }

    if (tile & (L << TILE_BARRIER_SHIFT))
      dr.drawRect({ x: tx, y: ty, w: btl, h: ts }, col);
    if (tile & (R << TILE_BARRIER_SHIFT))
      dr.drawRect({ x: tx + ts - bbr, y: ty, w: bbr, h: ts }, col);
    if (tile & (U << TILE_BARRIER_SHIFT))
      dr.drawRect({ x: tx, y: ty, w: ts, h: btl }, col);
    if (tile & (D << TILE_BARRIER_SHIFT))
      dr.drawRect({ x: tx, y: ty + ts - bbr, w: ts, h: bbr }, col);

    if (tile & (R << TILE_BARRIER_CORNER_SHIFT))
      dr.drawRect({ x: tx + ts - bbr, y: ty, w: bbr, h: btl }, col);
    if (tile & (U << TILE_BARRIER_CORNER_SHIFT))
      dr.drawRect({ x: tx, y: ty, w: btl, h: btl }, col);
    if (tile & (L << TILE_BARRIER_CORNER_SHIFT))
      dr.drawRect({ x: tx, y: ty + ts - bbr, w: btl, h: bbr }, col);
    if (tile & (D << TILE_BARRIER_CORNER_SHIFT))
      dr.drawRect({ x: tx + ts - bbr, y: ty + ts - bbr, w: bbr, h: bbr }, col);
  }

  dr.unclip();
  dr.drawUpdate({ x: clipx, y: clipy, w: clipw, h: cliph });
}

export function redraw(
  dr: GameDrawing,
  ds: NetDrawState,
  prev: NetState | null,
  current: NetState,
  dir: number,
  ui: NetUi,
  animTime: number,
  flashTime: number,
): void {
  let state = current;

  if (!ds.started) {
    ds.started = true;
    const size = computeSize(state, ds.tilesize);
    dr.drawRect({ x: 0, y: 0, ...size }, COL_BACKGROUND);
    dr.drawUpdate({ x: 0, y: 0, ...size });
  }

  // Rotation animation: draw the *old* state and spin the rotating tile.
  let tx = -1;
  let ty = -1;
  let angle = 0;
  const lastRotateDir = dir === -1 ? (prev?.lastRotateDir ?? 0) : state.lastRotateDir;
  if (prev && animTime < ROTATE_TIME && lastRotateDir) {
    tx = dir === -1 ? prev.lastRotateX : state.lastRotateX;
    ty = dir === -1 ? prev.lastRotateY : state.lastRotateY;
    angle = lastRotateDir * dir * 90 * (animTime / ROTATE_TIME);
    state = prev;
  }

  const frame = flashTime > 0 ? Math.floor(flashTime / FLASH_FRAME) : 0;

  const { w, h, barriers } = state;
  const active = computeActive(state, ui.cx, ui.cy);
  const loops = computeLoops(w, h, state.tiles, barriers, ui.unlockedLoops);

  const td = ds.toDraw;
  td.fill(0);

  for (let dy = 0; dy < h; dy++) {
    const gy = (dy + ui.orgY) % h;
    for (let dx = 0; dx < w; dx++) {
      const gx = (dx + ui.orgX) % w;
      const here = cell(ds, dx, dy);
      let t = state.tiles[gy * w + gx] | loops[gy * w + gx] | active[gy * w + gx];

      for (let d = 1, dsh = 0; d < 16; d *= 2, dsh++) {
        if (barriers[gy * w + gx] & d) {
          // The barrier itself on the cells either side of it, and a corner
          // join on the four cells that touch its ends.
          const cw = clockwise(d);
          const acw = anticlockwise(d);
          td[here] |= d << TILE_BARRIER_SHIFT;
          td[cell(ds, dx + dirX(d), dy + dirY(d))] |= opposite(d) << TILE_BARRIER_SHIFT;
          td[cell(ds, dx + dirX(acw), dy + dirY(acw))] |=
            cw << TILE_BARRIER_CORNER_SHIFT;
          td[cell(ds, dx + dirX(acw) + dirX(d), dy + dirY(acw) + dirY(d))] |=
            opposite(d) << TILE_BARRIER_CORNER_SHIFT;
          td[cell(ds, dx + dirX(cw), dy + dirY(cw))] |= d << TILE_BARRIER_CORNER_SHIFT;
          td[cell(ds, dx + dirX(cw) + dirX(d), dy + dirY(cw) + dirY(d))] |=
            acw << TILE_BARRIER_CORNER_SHIFT;
        }

        if (t & d) {
          // Highlight as an error any edge of a locked tile adjacent to a
          // lack-of-edge in another locked tile, or to a barrier.
          if (t & LOCKED) {
            if (barriers[gy * w + gx] & d) {
              t |= d << ERR_SHIFT;
            } else {
              const o = offset(gx, gy, d, w, h);
              const t2 = state.tiles[o.y * w + o.x];
              if (t2 & LOCKED && !(t2 & opposite(d))) t |= d << ERR_SHIFT;
            }
          }

          const edgeval = t & (d << ERR_SHIFT) ? 3 : t & ACTIVE ? 2 : 1;
          td[here] |= edgeval << (TILE_WIRE_SHIFT + dsh * 2);
          if (!(gx === tx && gy === ty)) {
            td[cell(ds, dx + dirX(d), dy + dirY(d))] |=
              edgeval << (TILE_WIRE_ON_EDGE_SHIFT + (dsh ^ 2) * 2);
          }
        }
      }

      if (ui.cursor.visible && gx === ui.cursor.x && gy === ui.cursor.y) {
        td[here] |= TILE_KEYBOARD_CURSOR;
      }

      if (gx === tx && gy === ty) td[here] |= TILE_ROTATING;

      if (gx === ui.cx && gy === ui.cy) {
        td[here] |= 3 << TILE_ENDPOINT_SHIFT;
      } else if (DIRECTIONS.includes(t & 0xf)) {
        // A tile with a single wire is an endpoint.
        td[here] |= (t & ACTIVE ? 2 : 1) << TILE_ENDPOINT_SHIFT;
      }

      if (t & LOCKED) td[here] |= TILE_LOCKED;

      // Completion flash: a Chebyshev ripple from the source that toggles the
      // locked-gray background frame by frame.
      {
        const rcx = (ui.cx + w - ui.orgX) % w;
        const rcy = (ui.cy + h - ui.orgY) % h;
        const xdist = dx < rcx ? rcx - dx : dx - rcx;
        const ydist = dy < rcy ? rcy - dy : dy - rcy;
        const dist = Math.max(xdist, ydist);
        if (frame >= dist && frame < dist + 4 && (frame - dist) & 1) {
          td[here] ^= TILE_LOCKED;
        }
      }
    }
  }

  // Draw any tile that differs from last time — plus any that is (or was)
  // rotating, since its angle changes every frame.
  for (let dy = -1; dy < h + 1; dy++) {
    for (let dx = -1; dx < w + 1; dx++) {
      const i = cell(ds, dx, dy);
      const prevWord = ds.visible[i];
      const curr = td[i];
      if (prevWord !== curr || (prevWord | curr) & TILE_ROTATING) {
        drawTile(dr, ds, dx, dy, curr, angle);
        ds.visible[i] = curr;
      }
    }
  }
}
