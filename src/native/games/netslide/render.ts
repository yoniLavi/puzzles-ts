/**
 * Netslide rendering — a port of `game_redraw` / `draw_tile` / `draw_barrier` /
 * `draw_arrow` in netslide.c.
 *
 * Geometry note: the web C build defines `NARROW_BORDERS`
 * (cmake/platforms/webapp.cmake), so the border gutter is `3·ts/4 + 1`, not a
 * full tile — parity is with what the browser actually showed, not with the
 * desktop default (playbook §3.2).
 *
 * The gutter holds the slide arrows. They are drawn on a full-tile footprint
 * and so overhang the narrow gutter slightly; that is exactly what the C web
 * build does.
 */

import type { Colour, Point, Size } from "../../../puzzle/types.ts";
import type { GameDrawing } from "../../engine/game.ts";
import {
  ACTIVE,
  anticlockwise,
  computeActive,
  D,
  DIRECTIONS,
  DR,
  dirX,
  dirY,
  FLASHING,
  L,
  LD,
  type NetslideState,
  type NetslideUi,
  opposite,
  R,
  RU,
  U,
  UL,
  wireCount,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 48;
export const ANIM_TIME = 0.13;
export const FLASH_FRAME = 0.07;

const TILE_BORDER = 1;

/** Upstream's `BORDER` under `NARROW_BORDERS`: room for an arrow and a gutter. */
function border(tileSize: number): number {
  return Math.floor((3 * tileSize) / 4) + 1;
}

// --- palette (mirrors the netslide.c colour enum index-for-index) ---------
export const COL_BACKGROUND = 0;
export const COL_FLASHING = 1;
export const COL_BORDER = 2;
export const COL_WIRE = 3;
export const COL_ENDPOINT = 4;
export const COL_POWERED = 5;
export const COL_BARRIER = 6;
export const COL_LOWLIGHT = 7;
export const COL_TEXT = 8;

export function colours(defaultBackground: Colour): Colour[] {
  const scale = (c: Colour, f: number): Colour => [c[0] * f, c[1] * f, c[2] * f];
  const out: Colour[] = [];
  // Netslide takes the frontend background as-is (upstream calls
  // `frontend_default_colour` directly, not `game_mkhighlight`).
  out[COL_BACKGROUND] = defaultBackground;
  out[COL_FLASHING] = scale(defaultBackground, 0.75);
  out[COL_BORDER] = scale(defaultBackground, 0.5);
  out[COL_WIRE] = [0, 0, 0];
  out[COL_ENDPOINT] = [0, 0, 1]; // an unpowered endpoint is blue
  out[COL_POWERED] = [0, 1, 1]; // a powered wire or endpoint is cyan
  out[COL_BARRIER] = [1, 0, 0];
  out[COL_LOWLIGHT] = scale(defaultBackground, 0.8);
  out[COL_TEXT] = [0, 0, 0];
  return out;
}

/** Takes anything carrying the grid dimensions, so `redraw` can size the
 * background from the state without conjuring a params object. */
export function computeSize(p: { w: number; h: number }, tileSize: number): Size {
  const b = border(tileSize);
  return {
    w: 2 * b + tileSize * p.w + TILE_BORDER,
    h: 2 * b + tileSize * p.h + TILE_BORDER,
  };
}

export interface NetslideDrawState {
  started: boolean;
  w: number;
  h: number;
  tilesize: number;
  /** Last-drawn value per tile (wires | ACTIVE | FLASHING), or −1 for "dirty,
   * repaint unconditionally" (upstream's `0xFF` sentinel). Every overlay the
   * renderer can apply lives in this word, so the diff key covers them all by
   * construction (playbook §3.2). */
  visible: Int32Array;
  /** Last-drawn cursor arrow, so a cursor move repaints exactly two arrows. */
  curX: number;
  curY: number;
}

export function newDrawState(s: NetslideState): NetslideDrawState {
  return {
    started: false,
    w: s.w,
    h: s.h,
    tilesize: 0,
    visible: new Int32Array(s.w * s.h).fill(-1),
    curX: -1,
    curY: -1,
  };
}

export function setTileSize(ds: NetslideDrawState, tileSize: number): void {
  ds.tilesize = tileSize;
}

/* ----------------------------------------------------------------------
 * Primitives.
 */

/** A rectangle given by two inclusive corners in any order (upstream
 * `draw_rect_coords`). */
function rectCoords(
  dr: GameDrawing,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  colour: number,
): void {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  dr.drawRect({ x, y, w: Math.abs(x2 - x1) + 1, h: Math.abs(y2 - y1) + 1 }, colour);
}

/** A wire: a coloured line cored inside a black outline, drawn as four offset
 * black lines with the coloured one over the top (upstream
 * `draw_filled_line`). */
function filledLine(dr: GameDrawing, p1: Point, p2: Point, colour: number): void {
  dr.drawLine({ x: p1.x - 1, y: p1.y }, { x: p2.x - 1, y: p2.y }, COL_WIRE, 1);
  dr.drawLine({ x: p1.x + 1, y: p1.y }, { x: p2.x + 1, y: p2.y }, COL_WIRE, 1);
  dr.drawLine({ x: p1.x, y: p1.y - 1 }, { x: p2.x, y: p2.y - 1 }, COL_WIRE, 1);
  dr.drawLine({ x: p1.x, y: p1.y + 1 }, { x: p2.x, y: p2.y + 1 }, COL_WIRE, 1);
  dr.drawLine(p1, p2, colour, 1);
}

/**
 * One tile, including its borders — so a neighbour's wire that reaches into
 * this tile's border is drawn here too.
 *
 * `x`/`y` may be one step outside the grid: while a line is mid-slide the tile
 * wrapping around the far edge is drawn a second time in its off-grid position,
 * so the row visibly wraps rather than popping.
 */
function drawTile(
  dr: GameDrawing,
  ds: NetslideDrawState,
  s: NetslideState,
  x: number,
  y: number,
  tile: number,
  xshift: number,
  yshift: number,
): void {
  const ts = ds.tilesize;
  const b = border(ts);
  // `(int)` in C truncates toward zero, and the shifts go negative.
  const bx = b + ts * x + Math.trunc(xshift * ts);
  const by = b + ts * y + Math.trunc(yshift * ts);

  // Blank the tile: a border-coloured rect with a background-coloured one
  // inset by the tile border.
  dr.drawRect({ x: bx, y: by, w: ts + TILE_BORDER, h: ts + TILE_BORDER }, COL_BORDER);
  dr.drawRect(
    {
      x: bx + TILE_BORDER,
      y: by + TILE_BORDER,
      w: ts - TILE_BORDER,
      h: ts - TILE_BORDER,
    },
    tile & FLASHING ? COL_FLASHING : COL_BACKGROUND,
  );

  const cx = TILE_BORDER + (ts - TILE_BORDER) / 2 - 0.5;
  const cy = cx;
  const arm = (ts - TILE_BORDER - 1) / 2;
  const wireColour = tile & ACTIVE ? COL_POWERED : COL_WIRE;

  // Black outlines first, then the coloured cores over them, so a wire's
  // outline never paints over a neighbouring wire's core.
  for (const dir of DIRECTIONS) {
    if (!(tile & dir)) continue;
    const from = { x: bx + Math.trunc(cx), y: by + Math.trunc(cy) };
    const to = {
      x: bx + Math.trunc(cx + arm * dirX(dir)),
      y: by + Math.trunc(cy + arm * dirY(dir)),
    };
    filledLine(dr, from, to, COL_WIRE);
  }
  for (const dir of DIRECTIONS) {
    if (!(tile & dir)) continue;
    dr.drawLine(
      { x: bx + Math.trunc(cx), y: by + Math.trunc(cy) },
      {
        x: bx + Math.trunc(cx + arm * dirX(dir)),
        y: by + Math.trunc(cy + arm * dirY(dir)),
      },
      wireColour,
      1,
    );
  }

  // The box in the middle: black at the centrepiece, and at a dead end either
  // cyan (powered) or blue (not). Nothing at all on a through-tile.
  let boxColour = -1;
  if (x === s.cx && y === s.cy) boxColour = COL_WIRE;
  else if (wireCount(tile) === 1) {
    boxColour = tile & ACTIVE ? COL_POWERED : COL_ENDPOINT;
  }
  if (boxColour >= 0) {
    const corners: [number, number][] = [
      [+1, +1],
      [+1, -1],
      [-1, -1],
      [-1, +1],
    ];
    const points: Point[] = corners.map(([sx, sy]) => ({
      x: bx + Math.trunc(cx + ts * 0.24 * sx),
      y: by + Math.trunc(cy + ts * 0.24 * sy),
    }));
    dr.drawPolygon(points, boxColour, COL_WIRE);
  }

  // Where a neighbour's wire reaches into our border: draw the join across the
  // border when we are wired to it too, and otherwise just a dot marking that
  // the neighbour comes this far.
  for (const dir of DIRECTIONS) {
    const dx = dirX(dir);
    const dy = dirY(dir);
    const ox = x + dx;
    const oy = y + dy;
    if (ox < 0 || ox >= s.w || oy < 0 || oy >= s.h) continue;
    if (!(s.tiles[oy * s.w + ox] & opposite(dir))) continue;

    const px = bx + (dx > 0 ? ts + TILE_BORDER - 1 : dx < 0 ? 0 : Math.trunc(cx));
    const py = by + (dy > 0 ? ts + TILE_BORDER - 1 : dy < 0 ? 0 : Math.trunc(cy));
    const lx = dx * (TILE_BORDER - 1);
    const ly = dy * (TILE_BORDER - 1);
    const vx = dy ? 1 : 0;
    const vy = dx ? 1 : 0;

    if (xshift === 0 && yshift === 0 && tile & dir) {
      // Fully connected: draw right across the tile border. Our own ACTIVE
      // state is the right colour to use — if we are connected to the other
      // tile then the two ACTIVE states agree.
      rectCoords(dr, px - vx, py - vy, px + lx + vx, py + ly + vy, COL_WIRE);
      rectCoords(dr, px, py, px + lx, py + ly, tile & ACTIVE ? COL_POWERED : COL_WIRE);
    } else {
      rectCoords(dr, px, py, px, py, COL_WIRE);
    }
  }

  dr.drawUpdate({ x: bx, y: by, w: ts + TILE_BORDER, h: ts + TILE_BORDER });
}

/** The quarter of a barrier junction that belongs to tile `(x, y)`. Drawn in
 * two phases so every junction's black outline is laid down before any red
 * barrier body, and the outlines therefore never cut into a body. */
function drawBarrierCorner(
  dr: GameDrawing,
  ds: NetslideDrawState,
  x: number,
  y: number,
  cornerFlag: number,
  phase: number,
): void {
  const ts = ds.tilesize;
  const b = border(ts);
  const bx = b + ts * x;
  const by = b + ts * y;

  const dir = cornerFlag >> 4;
  const dir2 = anticlockwise(dir);
  const dx = dirX(dir) + dirX(dir2);
  const dy = dirY(dir) + dirY(dir2);
  const x1 = dx > 0 ? ts + TILE_BORDER - 1 : 0;
  const y1 = dy > 0 ? ts + TILE_BORDER - 1 : 0;

  if (phase === 0) {
    rectCoords(
      dr,
      bx + x1,
      by + y1,
      bx + x1 - TILE_BORDER * dx,
      by + y1 - (TILE_BORDER - 1) * dy,
      COL_WIRE,
    );
    rectCoords(
      dr,
      bx + x1,
      by + y1,
      bx + x1 - (TILE_BORDER - 1) * dx,
      by + y1 - TILE_BORDER * dy,
      COL_WIRE,
    );
  } else {
    rectCoords(
      dr,
      bx + x1,
      by + y1,
      bx + x1 - (TILE_BORDER - 1) * dx,
      by + y1 - (TILE_BORDER - 1) * dy,
      COL_BARRIER,
    );
  }
}

/** One wall along side `dir` of tile `(x, y)`. */
function drawBarrier(
  dr: GameDrawing,
  ds: NetslideDrawState,
  x: number,
  y: number,
  dir: number,
  phase: number,
): void {
  const ts = ds.tilesize;
  const b = border(ts);
  const bx = b + ts * x;
  const by = b + ts * y;

  const dx = dirX(dir);
  const dy = dirY(dir);
  const x1 = dx > 0 ? ts : dx === 0 ? TILE_BORDER : 0;
  const y1 = dy > 0 ? ts : dy === 0 ? TILE_BORDER : 0;
  const w = dx ? TILE_BORDER : ts - TILE_BORDER;
  const h = dy ? TILE_BORDER : ts - TILE_BORDER;

  if (phase === 0) {
    dr.drawRect({ x: bx + x1 - dx, y: by + y1 - dy, w, h }, COL_WIRE);
  } else {
    dr.drawRect({ x: bx + x1, y: by + y1, w, h }, COL_BARRIER);
  }
}

function drawTileBarriers(
  dr: GameDrawing,
  ds: NetslideDrawState,
  s: NetslideState,
  x: number,
  y: number,
): void {
  const ts = ds.tilesize;
  const b = border(ts);
  const barrier = s.barriers[y * s.w + x];

  for (let phase = 0; phase < 2; phase++) {
    for (const dir of DIRECTIONS) {
      if (barrier & (dir << 4)) drawBarrierCorner(dr, ds, x, y, dir << 4, phase);
    }
    for (const dir of DIRECTIONS) {
      if (barrier & dir) drawBarrier(dr, ds, x, y, dir, phase);
    }
  }

  dr.drawUpdate({
    x: b + ts * x,
    y: b + ts * y,
    w: ts + TILE_BORDER,
    h: ts + TILE_BORDER,
  });
}

/**
 * A slide arrow in the gutter. `(xdx, xdy)` is the direction the arrow points,
 * which is the direction the line it controls will move; the arrow polygon is
 * expressed in that rotated frame.
 */
function drawArrow(
  dr: GameDrawing,
  ds: NetslideDrawState,
  gx: number,
  gy: number,
  xdx: number,
  xdy: number,
  cursor: boolean,
): void {
  const ts = ds.tilesize;
  const b = border(ts);
  const ox = gx * ts + b;
  const oy = gy * ts + b;
  const ydy = -xdx;
  const ydx = xdy;

  const point = (xx: number, yy: number): Point => ({
    x: ox + xx * xdx + yy * ydx,
    y: oy + xx * xdy + yy * ydy,
  });

  const coords: Point[] = [
    point(ts / 2, (3 * ts) / 4), // tip
    point((3 * ts) / 4, ts / 2), // right corner
    point((5 * ts) / 8, ts / 2), // right concave
    point((5 * ts) / 8, ts / 4), // bottom right
    point((3 * ts) / 8, ts / 4), // bottom left
    point((3 * ts) / 8, ts / 2), // left concave
    point(ts / 4, ts / 2), // left corner
  ];

  dr.drawPolygon(coords, cursor ? COL_POWERED : COL_LOWLIGHT, COL_TEXT);
}

/** The arrow the keyboard cursor is on, given its ring position. */
function drawArrowForCursor(
  dr: GameDrawing,
  ds: NetslideDrawState,
  curX: number,
  curY: number,
  cursor: boolean,
): void {
  if (curX === -1 && curY === -1) return; // no cursor here

  if (curX === -1)
    drawArrow(dr, ds, 0, curY + 1, 0, -1, cursor); // left column
  else if (curX === ds.w)
    drawArrow(dr, ds, ds.w, curY, 0, +1, cursor); // right
  else if (curY === -1)
    drawArrow(dr, ds, curX, 0, +1, 0, cursor); // top row
  else if (curY === ds.h)
    drawArrow(dr, ds, curX + 1, ds.h, -1, 0, cursor); // bottom
  else throw new Error(`(${curX}, ${curY}) is not a border-arrow position`);

  const ts = ds.tilesize;
  const b = border(ts);
  dr.drawUpdate({ x: curX * ts + b, y: curY * ts + b, w: ts, h: ts });
}

/* ----------------------------------------------------------------------
 * The frame.
 */

export function redraw(
  dr: GameDrawing,
  ds: NetslideDrawState | null,
  prev: NetslideState | null,
  current: NetslideState,
  _dir: number,
  ui: NetslideUi,
  animTime: number,
  flashTime: number,
): void {
  if (!ds) return;

  const ts = ds.tilesize;
  const b = border(ts);

  let state = current;
  let oldstate = prev;

  if (!ds.started) {
    ds.started = true;

    // The engine paints no pixels of its own, so the game fills its own
    // background (the gutter around the grid is never covered by a tile).
    const size = computeSize(state, ts);
    dr.drawRect({ x: 0, y: 0, ...size }, COL_BACKGROUND);
    dr.drawUpdate({ x: 0, y: 0, ...size });

    drawExteriorBarriers(dr, ds, state);
    drawSlideArrows(dr, ds, state);
  }

  // The cursor arrow: repaint the one it left and the one it arrived at.
  const curX = ui.curVisible ? ui.curX : -1;
  const curY = ui.curVisible ? ui.curY : -1;
  if (curX !== ds.curX || curY !== ds.curY) {
    drawArrowForCursor(dr, ds, curX, curY, true);
    drawArrowForCursor(dr, ds, ds.curX, ds.curY, false);
    ds.curX = curX;
    ds.curY = curY;
  }

  // An undo runs the slide animation backwards: swap the endpoints and reverse
  // the clock, so the rest of this function need not know which way time runs.
  let t = animTime;
  if (oldstate && oldstate.moveCount > state.moveCount) {
    [state, oldstate] = [oldstate, state];
    t = ANIM_TIME - t;
  }

  let xshift = 0;
  let yshift = 0;
  if (oldstate && t < ANIM_TIME) {
    // The moving line starts a full tile back along its direction of travel and
    // slides into place.
    const progress = (1 - t / ANIM_TIME) * state.lastMoveDir;
    xshift = state.lastMoveRow === -1 ? 0 : progress;
    yshift = state.lastMoveCol === -1 ? 0 : progress;
  }

  const frame = flashTime > 0 ? Math.floor(flashTime / FLASH_FRAME) : -1;

  // A line in motion is drawn unpowered, so the powered highlight doesn't
  // appear to leap across it.
  const active =
    xshift !== 0 || yshift !== 0
      ? computeActive(state, state.lastMoveRow, state.lastMoveCol)
      : computeActive(state, -1, -1);

  dr.clip({
    x: b,
    y: b,
    w: ts * state.w + TILE_BORDER,
    h: ts * state.h + TILE_BORDER,
  });

  for (let x = 0; x < ds.w; x++) {
    for (let y = 0; y < ds.h; y++) {
      const i = y * ds.w + x;
      let c = state.tiles[i] | active[i];

      // The completion flash ripples outward: a tile at Chebyshev distance
      // `dist` from the centre flashes on and off over frames dist … dist+3.
      if (frame >= 0) {
        const dist = Math.max(Math.abs(x - state.cx), Math.abs(y - state.cy));
        if (frame >= dist && frame < dist + 4) {
          const on = (frame - dist) & 1 ? FLASHING : 0;
          c = (c & ~FLASHING) | on;
        }
      }

      // A tile on the line that last moved is repainted every frame: while the
      // animation runs, where it is drawn does not follow from its value.
      const moving = x === state.lastMoveCol || y === state.lastMoveRow;
      if (ds.visible[i] === c && !moving) continue;

      const xs = y === state.lastMoveRow ? xshift : 0;
      const ys = x === state.lastMoveCol ? yshift : 0;

      drawTile(dr, ds, state, x, y, c, xs, ys);

      // The tile wrapping around the far edge, drawn a second time off-grid so
      // the line visibly wraps instead of popping.
      if (xs < 0 && x === 0) drawTile(dr, ds, state, state.w, y, c, xs, ys);
      else if (xs > 0 && x === state.w - 1) drawTile(dr, ds, state, -1, y, c, xs, ys);
      else if (ys < 0 && y === 0) drawTile(dr, ds, state, x, state.h, c, xs, ys);
      else if (ys > 0 && y === state.h - 1) drawTile(dr, ds, state, x, -1, c, xs, ys);

      // A moving tile is left marked dirty: mid-animation its drawn position
      // doesn't match its value, so it must be repainted next frame regardless.
      ds.visible[i] = moving ? -1 : c;
    }
  }

  for (let x = 0; x < ds.w; x++) {
    for (let y = 0; y < ds.h; y++) {
      drawTileBarriers(dr, ds, state, x, y);
    }
  }

  dr.unclip();
}

/** The walls around the outside of the grid, drawn once — they are outside the
 * tile grid, so no tile repaint ever touches them. */
function drawExteriorBarriers(
  dr: GameDrawing,
  ds: NetslideDrawState,
  s: NetslideState,
): void {
  const at = (x: number, y: number) => s.barriers[y * s.w + x];

  for (let phase = 0; phase < 2; phase++) {
    for (let x = 0; x < ds.w; x++) {
      if (at(x, 0) & UL) drawBarrierCorner(dr, ds, x, -1, LD, phase);
      if (at(x, 0) & RU) drawBarrierCorner(dr, ds, x, -1, DR, phase);
      if (at(x, 0) & U) drawBarrier(dr, ds, x, -1, D, phase);
      if (at(x, ds.h - 1) & DR) drawBarrierCorner(dr, ds, x, ds.h, RU, phase);
      if (at(x, ds.h - 1) & LD) drawBarrierCorner(dr, ds, x, ds.h, UL, phase);
      if (at(x, ds.h - 1) & D) drawBarrier(dr, ds, x, ds.h, U, phase);
    }
    for (let y = 0; y < ds.h; y++) {
      if (at(0, y) & UL) drawBarrierCorner(dr, ds, -1, y, RU, phase);
      if (at(0, y) & LD) drawBarrierCorner(dr, ds, -1, y, DR, phase);
      if (at(0, y) & L) drawBarrier(dr, ds, -1, y, R, phase);
      if (at(ds.w - 1, y) & RU) drawBarrierCorner(dr, ds, ds.w, y, UL, phase);
      if (at(ds.w - 1, y) & DR) drawBarrierCorner(dr, ds, ds.w, y, LD, phase);
      if (at(ds.w - 1, y) & R) drawBarrier(dr, ds, ds.w, y, L, phase);
    }
  }
}

/** An arrow in the gutter beside every slidable line — every row and column
 * except the centre ones. */
function drawSlideArrows(
  dr: GameDrawing,
  ds: NetslideDrawState,
  s: NetslideState,
): void {
  for (let x = 0; x < ds.w; x++) {
    if (x === s.cx) continue;
    drawArrow(dr, ds, x, 0, +1, 0, false); // above, pointing right
    drawArrow(dr, ds, x + 1, ds.h, -1, 0, false); // below, pointing left
  }
  for (let y = 0; y < ds.h; y++) {
    if (y === s.cy) continue;
    drawArrow(dr, ds, ds.w, y, 0, +1, false); // right, pointing down
    drawArrow(dr, ds, 0, y + 1, 0, -1, false); // left, pointing up
  }
}
