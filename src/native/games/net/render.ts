/**
 * Net's renderer — a fresh port of `game_redraw`/`draw_tile`/`draw_wires` from
 * net.c (design D2: the *model* is shared with Netslide, but the pixels are not
 * — Net draws thick scalable wires as rotated polygons, a different algorithm
 * from Netslide's fixed offset lines).
 *
 * The per-tile cache word packs every visible feature of a tile (barriers,
 * corners, cursor, the four wires at two bits each, the endpoint, neighbour
 * wires reaching onto our edges, the rotating flag, the locked flag) so the
 * diff key is that single `Int32` (playbook §3.2). The frame is drawn over a
 * `(w+2)×(h+2)` grid — one ring wider than the board — so a barrier on the outer
 * edge has somewhere to draw its outline.
 */

import type { Colour, Point, Size } from "../../../puzzle/types.ts";
import type { GameDrawing } from "../../engine/game.ts";
import {
  anticlockwise,
  clockwise,
  D,
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
const ROTATE_TIME = 0.13;
const FLASH_FRAME = 0.07;
export { ROTATE_TIME as ANIM_TIME, FLASH_FRAME };

// Palette, index-for-index with net.c's colour enum.
export const COL_BACKGROUND = 0;
export const COL_LOCKED = 1;
export const COL_BORDER = 2;
export const COL_WIRE = 3;
export const COL_ENDPOINT = 4;
export const COL_POWERED = 5;
export const COL_BARRIER = 6;
export const COL_ERR = 7;

export function colours(defaultBackground: Colour): Colour[] {
  const scale = (f: number): Colour => [
    defaultBackground[0] * f,
    defaultBackground[1] * f,
    defaultBackground[2] * f,
  ];
  const out: Colour[] = [];
  out[COL_BACKGROUND] = defaultBackground;
  out[COL_WIRE] = [0, 0, 0];
  out[COL_POWERED] = [0, 1, 1]; // powered wires/endpoints are cyan
  out[COL_BARRIER] = [1, 0, 0];
  out[COL_ERR] = [1, 0, 0];
  out[COL_ENDPOINT] = [0, 0, 1]; // unpowered endpoints are blue
  out[COL_BORDER] = scale(0.5); // tile borders: darker grey than bg
  out[COL_LOCKED] = scale(0.75); // locked tiles: grey between the two
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

/** `WINDOW_OFFSET` under `NARROW_BORDERS`: Net has no gutter at all. */
export const WINDOW_OFFSET = 0;
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

export function computeSize(p: { w: number; h: number }, tileSize: number): Size {
  return {
    w: WINDOW_OFFSET * 2 + tileSize * p.w + lineThick(tileSize),
    h: WINDOW_OFFSET * 2 + tileSize * p.h + lineThick(tileSize),
  };
}

/** Cell index in the `(w+2)×(h+2)` cache/scratch arrays. */
function dsi(ds: NetDrawState, x: number, y: number): number {
  return (y + 1) * (ds.w + 2) + (x + 1);
}

function rotatedCoords(
  matrix: readonly number[],
  cx: number,
  cy: number,
  ix: number,
  iy: number,
): Point {
  return {
    x: matrix[0] * ix + matrix[2] * iy + cx,
    y: matrix[1] * ix + matrix[3] * iy + cy,
  };
}

/**
 * Draw the wires of one colour pass as a single filled polygon. `bitmap`
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
  colour: number,
  halfwidth: number,
  matrix: readonly number[],
): void {
  const fpoints: number[] = [];
  let anyWire = false;

  let dsh = 0;
  for (let d = 1; d < 16; d *= 2, dsh++) {
    const wiretype = (tile >> (TILE_WIRE_SHIFT + 2 * dsh)) & 3;

    fpoints.push(halfwidth * (dirX(d) + dirX(clockwise(d))));
    fpoints.push(halfwidth * (dirY(d) + dirY(clockwise(d))));

    if (bitmap & (1 << wiretype)) {
      fpoints.push(radius * dirX(d) + halfwidth * dirX(clockwise(d)));
      fpoints.push(radius * dirY(d) + halfwidth * dirY(clockwise(d)));
      fpoints.push(radius * dirX(d) + halfwidth * dirX(anticlockwise(d)));
      fpoints.push(radius * dirY(d) + halfwidth * dirY(anticlockwise(d)));
      anyWire = true;
    }
  }

  if (!anyWire) return;

  const points: Point[] = [];
  for (let i = 0; i < fpoints.length; i += 2) {
    const c = rotatedCoords(matrix, cx, cy, fpoints[i], fpoints[i + 1]);
    points.push({ x: Math.floor(0.5 + c.x), y: Math.floor(0.5 + c.y) });
  }

  dr.drawPolygon(points, colour, colour);
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

  const tx = WINDOW_OFFSET + ts * x + borderBr;
  const ty = WINDOW_OFFSET + ts * y + borderBr;

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
    if (x >= 0) dr.drawRect({ x: tx, y: gridu, w: borderTl, h: gridd - gridu }, COL_BORDER);
    if (y >= 0) dr.drawRect({ x: gridl, y: ty, w: gridr - gridl, h: borderTl }, COL_BORDER);
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
    const cursorcol = tile & TILE_LOCKED ? COL_BACKGROUND : COL_LOCKED;
    const insetOuter = Math.floor(ts / 8);
    const insetInner = insetOuter + lt;
    dr.drawRect(
      { x: tx + insetOuter, y: ty + insetOuter, w: ts - 2 * insetOuter, h: ts - 2 * insetOuter },
      cursorcol,
    );
    dr.drawRect(
      { x: tx + insetInner, y: ty + insetInner, w: ts - 2 * insetInner, h: ts - 2 * insetInner },
      bg,
    );
  }

  let radius = Math.floor((ts + 1) / 2);
  const cx = tx + radius;
  const cy = ty + radius;
  radius++;

  // Protrusions of neighbouring cells' wires into our edges — only when our own
  // wire won't overdraw them (no wire here, or we're rotating).
  {
    let dsh = 0;
    for (let d = 1; d < 16; d *= 2, dsh++) {
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
  }

  // Rotation matrix for the centred cell contents.
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

  // Central box (endpoint / source).
  for (let pass = 0; pass < 2; pass++) {
    const endtype = (tile >> TILE_ENDPOINT_SHIFT) & 3;
    if (endtype) {
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
      const points = corners.map(([sx, sy]) => {
        const c = rotatedCoords(matrix, cx, cy, boxr * sx, boxr * sy);
        return { x: Math.floor(c.x + 0.5), y: Math.floor(c.y + 0.5) };
      });
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

    if (tile & (L << TILE_BARRIER_SHIFT)) dr.drawRect({ x: tx, y: ty, w: btl, h: ts }, col);
    if (tile & (R << TILE_BARRIER_SHIFT))
      dr.drawRect({ x: tx + ts - bbr, y: ty, w: bbr, h: ts }, col);
    if (tile & (U << TILE_BARRIER_SHIFT)) dr.drawRect({ x: tx, y: ty, w: ts, h: btl }, col);
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
  ds: NetDrawState | null,
  prev: NetState | null,
  current: NetState,
  dir: number,
  ui: NetUi,
  animTime: number,
  flashTime: number,
): void {
  if (!ds) return;

  let state = current;
  const oldstate = prev;

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
  const lastRotateDir =
    dir === -1 ? oldstate?.lastRotateDir ?? 0 : state.lastRotateDir;
  if (oldstate && animTime < ROTATE_TIME && lastRotateDir) {
    tx = dir === -1 ? oldstate.lastRotateX : state.lastRotateX;
    ty = dir === -1 ? oldstate.lastRotateY : state.lastRotateY;
    angle = lastRotateDir * dir * 90 * (animTime / ROTATE_TIME);
    state = oldstate;
  }

  const frame = flashTime > 0 ? Math.floor(flashTime / FLASH_FRAME) : 0;

  const active = computeActive(state, ui.cx, ui.cy);
  const loops = computeLoops(state.w, state.h, state.tiles, state.barriers, ui.unlockedLoops);
  const { w, h, barriers } = state;

  const td = ds.toDraw;
  td.fill(0);

  for (let dy = 0; dy < h; dy++) {
    const gy = (dy + ui.orgY) % h;
    for (let dx = 0; dx < w; dx++) {
      const gx = (dx + ui.orgX) % w;
      let t = state.tiles[gy * w + gx] | loops[gy * w + gx] | active[gy * w + gx];

      let dsh = 0;
      for (let d = 1; d < 16; d *= 2, dsh++) {
        if (barriers[gy * w + gx] & d) {
          td[dsi(ds, dx, dy)] |= d << TILE_BARRIER_SHIFT;
          td[dsi(ds, dx + dirX(d), dy + dirY(d))] |= opposite(d) << TILE_BARRIER_SHIFT;
          td[dsi(ds, dx + dirX(anticlockwise(d)), dy + dirY(anticlockwise(d)))] |=
            clockwise(d) << TILE_BARRIER_CORNER_SHIFT;
          td[
            dsi(
              ds,
              dx + dirX(anticlockwise(d)) + dirX(d),
              dy + dirY(anticlockwise(d)) + dirY(d),
            )
          ] |= opposite(d) << TILE_BARRIER_CORNER_SHIFT;
          td[dsi(ds, dx + dirX(clockwise(d)), dy + dirY(clockwise(d)))] |=
            d << TILE_BARRIER_CORNER_SHIFT;
          td[
            dsi(
              ds,
              dx + dirX(clockwise(d)) + dirX(d),
              dy + dirY(clockwise(d)) + dirY(d),
            )
          ] |= anticlockwise(d) << TILE_BARRIER_CORNER_SHIFT;
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
          td[dsi(ds, dx, dy)] |= edgeval << (TILE_WIRE_SHIFT + dsh * 2);
          if (!(gx === tx && gy === ty)) {
            td[dsi(ds, dx + dirX(d), dy + dirY(d))] |=
              edgeval << (TILE_WIRE_ON_EDGE_SHIFT + (dsh ^ 2) * 2);
          }
        }
      }

      if (ui.curVisible && gx === ui.curX && gy === ui.curY) {
        td[dsi(ds, dx, dy)] |= TILE_KEYBOARD_CURSOR;
      }

      if (gx === tx && gy === ty) td[dsi(ds, dx, dy)] |= TILE_ROTATING;

      if (gx === ui.cx && gy === ui.cy) {
        td[dsi(ds, dx, dy)] |= 3 << TILE_ENDPOINT_SHIFT;
      } else if (
        (t & 0xf) === R ||
        (t & 0xf) === U ||
        (t & 0xf) === L ||
        (t & 0xf) === D
      ) {
        td[dsi(ds, dx, dy)] |= (t & ACTIVE ? 2 : 1) << TILE_ENDPOINT_SHIFT;
      }

      if (t & LOCKED) td[dsi(ds, dx, dy)] |= TILE_LOCKED;

      // Completion flash: a Chebyshev ripple from the source that toggles the
      // locked-grey background frame by frame.
      {
        const rcx = (ui.cx + w - ui.orgX) % w;
        const rcy = (ui.cy + h - ui.orgY) % h;
        const xdist = dx < rcx ? rcx - dx : dx - rcx;
        const ydist = dy < rcy ? rcy - dy : dy - rcy;
        const dist = Math.max(xdist, ydist);
        if (frame >= dist && frame < dist + 4 && (frame - dist) & 1) {
          td[dsi(ds, dx, dy)] ^= TILE_LOCKED;
        }
      }
    }
  }

  // Draw any tile that differs from last time — plus any that is (or was)
  // rotating, since its angle changes every frame.
  for (let dy = -1; dy < h + 1; dy++) {
    for (let dx = -1; dx < w + 1; dx++) {
      const prevWord = ds.visible[dsi(ds, dx, dy)];
      const curr = td[dsi(ds, dx, dy)];
      if (prevWord !== curr || (prevWord | curr) & TILE_ROTATING) {
        drawTile(dr, ds, dx, dy, curr, angle);
        ds.visible[dsi(ds, dx, dy)] = curr;
      }
    }
  }
}
