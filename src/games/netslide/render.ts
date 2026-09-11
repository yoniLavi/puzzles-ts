/**
 * Netslide rendering — a port of `game_redraw` / `draw_tile` / `draw_barrier` /
 * `draw_arrow` in netslide.c.
 *
 * The border gutter is `3·ts/4 + 1`, upstream's `NARROW_BORDERS` width (what
 * its web build showed), not a full tile. It holds the slide arrows, which are
 * drawn on a full-tile footprint and so overhang it slightly, as upstream's do.
 */

import { BLUE, RED, TEAL } from "../../engine/color/colors.ts";
import {
  CURSOR,
  FLASH,
  GRID_MID,
  HINT_ACTION,
  INK,
} from "../../engine/color/palette.ts";
import { netslideLowlight } from "../../engine/color/palette-games.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import { drawMarkSides, MARK_ALL } from "../../engine/hint-mark.ts";
import type { Color, Point, Size } from "../../engine/types.ts";
import type { NetslideHint } from "./hint.ts";
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
  type NetslideMove,
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
export function border(tileSize: number): number {
  return Math.floor((3 * tileSize) / 4) + 1;
}

// --- palette (mirrors the netslide.c color enum index-for-index) ---------
export const COL_BACKGROUND = 0;
export const COL_FLASHING = 1;
export const COL_BORDER = 2;
export const COL_WIRE = 3;
export const COL_ENDPOINT = 4;
export const COL_POWERED = 5;
export const COL_BARRIER = 6;
export const COL_LOWLIGHT = 7;
export const COL_TEXT = 8;

/** The hint's colors, appended *past* upstream's enum so the palette above stays
 * index-for-index with it. Safe to append here because Netslide declares no
 * dark-mode `paletteOverrides` — nothing addresses a palette slot by number
 * (docs/games/rendering.md § "The palette: three layers, meaning first"). */
export const COL_HINT = 9;
/** Likewise appended: the keyboard cursor's gutter arrow, which upstream drew
 * in the powered-wire color. */
export const COL_CURSOR = 10;

export function colors(defaultBackground: Color): Color[] {
  const out: Color[] = [];
  // The board is the background as handed in: `resolvePalette` has already
  // shifted it off the extremes, so this is the same tone `mkhighlight` games
  // paint (upstream's `frontend_default_colour` versus `game_mkhighlight` is not
  // a distinction a port gets to keep).
  out[COL_BACKGROUND] = defaultBackground;
  out[COL_FLASHING] = FLASH;
  out[COL_BORDER] = GRID_MID;
  out[COL_WIRE] = INK;
  out[COL_ENDPOINT] = BLUE;
  out[COL_POWERED] = TEAL;
  out[COL_BARRIER] = RED;
  out[COL_LOWLIGHT] = netslideLowlight(defaultBackground);
  out[COL_TEXT] = INK;
  // The same blue Sixteen marks a hinted tile with — the two are the same kind of
  // game and should read the same way. Black wires and cyan powered wires both
  // stay legible on it.
  out[COL_HINT] = HINT_ACTION;
  out[COL_CURSOR] = CURSOR;
  return out;
}

/* ----------------------------------------------------------------------
 * Hint overlay bits.
 *
 * These ride in the per-tile cache word, which is the diff key, so a hint
 * requested on an otherwise unchanged board still repaints. Left out of the key,
 * the hint never appears until something else moves
 * (docs/games/rendering.md § "The tile cache and the diff key").
 */

/** The tile the hint is placing. */
const HINT_TILE = 0x40;
/** Where this slide lands it — a staging cell, so shown as a dashed outline. */
const HINT_LANDING = 0x80;
/** Where it finally belongs — a solid outline. */
const HINT_HOME = 0x100;

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
  /** Last-drawn value per tile (wires | ACTIVE | FLASHING | the HINT_* bits), or
   * −1 for "dirty, repaint unconditionally" (upstream's `0xFF` sentinel). */
  visible: Int32Array;
  /** Last-drawn cursor arrow, so a cursor move repaints exactly two arrows. */
  curX: number;
  curY: number;
  /** Last-drawn hint arrow, likewise. The arrows live in the gutter, outside the
   * tile grid, so no tile repaint reaches them — they need their own diff. */
  hintArrowX: number;
  hintArrowY: number;
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
    hintArrowX: -2,
    hintArrowY: -2,
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
  color: number,
): void {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  dr.drawRect({ x, y, w: Math.abs(x2 - x1) + 1, h: Math.abs(y2 - y1) + 1 }, color);
}

/** A wire: a colored line cored inside a black outline, drawn as four offset
 * black lines with the colored one over the top (upstream
 * `draw_filled_line`). */
function filledLine(dr: GameDrawing, p1: Point, p2: Point, color: number): void {
  dr.drawLine({ x: p1.x - 1, y: p1.y }, { x: p2.x - 1, y: p2.y }, COL_WIRE, 1);
  dr.drawLine({ x: p1.x + 1, y: p1.y }, { x: p2.x + 1, y: p2.y }, COL_WIRE, 1);
  dr.drawLine({ x: p1.x, y: p1.y - 1 }, { x: p2.x, y: p2.y - 1 }, COL_WIRE, 1);
  dr.drawLine({ x: p1.x, y: p1.y + 1 }, { x: p2.x, y: p2.y + 1 }, COL_WIRE, 1);
  dr.drawLine(p1, p2, color, 1);
}

/**
 * One tile, including its borders — so a neighbor's wire that reaches into
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

  // Blank the tile: a border-colored rect with a background-colored one inset
  // by the tile border. The tile the hint is placing takes no fill — it is
  // **double-ringed** at the end of this function instead, so the wires that say
  // *which piece* this is keep their own color rather than sitting on blue.
  const background = tile & FLASHING ? COL_FLASHING : COL_BACKGROUND;
  dr.drawRect({ x: bx, y: by, w: ts + TILE_BORDER, h: ts + TILE_BORDER }, COL_BORDER);
  dr.drawRect(
    {
      x: bx + TILE_BORDER,
      y: by + TILE_BORDER,
      w: ts - TILE_BORDER,
      h: ts - TILE_BORDER,
    },
    background,
  );

  const cx = TILE_BORDER + (ts - TILE_BORDER) / 2 - 0.5;
  const cy = cx;
  const arm = (ts - TILE_BORDER - 1) / 2;
  const wireColor = tile & ACTIVE ? COL_POWERED : COL_WIRE;

  // Black outlines first, then the colored cores over them, so a wire's
  // outline never paints over a neighboring wire's core.
  const center = { x: bx + Math.trunc(cx), y: by + Math.trunc(cy) };
  const ends = DIRECTIONS.filter((dir) => tile & dir).map((dir) => ({
    x: bx + Math.trunc(cx + arm * dirX(dir)),
    y: by + Math.trunc(cy + arm * dirY(dir)),
  }));
  for (const end of ends) filledLine(dr, center, end, COL_WIRE);
  for (const end of ends) dr.drawLine(center, end, wireColor, 1);

  // The box in the middle: black at the centerpiece, and at a dead end either
  // cyan (powered) or blue (not). Nothing at all on a through-tile.
  let boxColor = -1;
  if (x === s.cx && y === s.cy) boxColor = COL_WIRE;
  else if (wireCount(tile) === 1) {
    boxColor = tile & ACTIVE ? COL_POWERED : COL_ENDPOINT;
  }
  if (boxColor >= 0) {
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
    dr.drawPolygon(points, boxColor, COL_WIRE);
  }

  // Where a neighbor's wire reaches into our border: draw the join across the
  // border when we are wired to it too, and otherwise just a dot marking that
  // the neighbor comes this far.
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
      // state is the right color to use — if we are connected to the other
      // tile then the two ACTIVE states agree.
      rectCoords(dr, px - vx, py - vy, px + lx + vx, py + ly + vy, COL_WIRE);
      rectCoords(dr, px, py, px + lx, py + ly, tile & ACTIVE ? COL_POWERED : COL_WIRE);
    } else {
      rectCoords(dr, px, py, px, py, COL_WIRE);
    }
  }

  // The hinted tile's mark: a **double** ring on the tile's frame, drawn last so
  // no wire crosses it. It must look unlike the single inset ring
  // `drawHintOutline` puts on the destination *cell* ("move this piece" against
  // "to here"). Drawn here, at the shifted origin, it rides with the tile
  // through the slide.
  if (tile & HINT_TILE) {
    const t = Math.max(2, Math.round(ts / 16));
    const box = { x: bx, y: by, w: ts + TILE_BORDER, h: ts + TILE_BORDER };
    drawMarkSides(dr, { box, outer: 0, inner: t }, MARK_ALL, COL_HINT);
    drawMarkSides(
      dr,
      {
        box: { x: box.x + 2 * t, y: box.y + 2 * t, w: box.w - 4 * t, h: box.h - 4 * t },
        outer: 0,
        inner: t,
      },
      MARK_ALL,
      COL_HINT,
    );
  }

  dr.drawUpdate({ x: bx, y: by, w: ts + TILE_BORDER, h: ts + TILE_BORDER });
}

/**
 * Where the hinted tile is headed. The cell it *belongs* in gets a solid outline;
 * a cell it is only passing through gets a dashed one, so a staging move never
 * reads as "this is the answer".
 *
 * A mark on a **cell**, so it is drawn after every tile at the cell's unshifted
 * position, not inside `drawTile`, where it would slide with the line under it.
 * Painting last also keeps a tile sliding across the cell from covering it.
 */
function drawHintTargets(
  dr: GameDrawing,
  ds: NetslideDrawState,
  marks: NetslideHint,
): void {
  const ts = ds.tilesize;
  const b = border(ts);
  const at = (cell: number, dashed: boolean) => {
    const x = cell % ds.w;
    const y = Math.floor(cell / ds.w);
    const bx = b + ts * x;
    const by = b + ts * y;
    drawHintOutline(dr, bx, by, ts, dashed);
    dr.drawUpdate({ x: bx, y: by, w: ts + TILE_BORDER, h: ts + TILE_BORDER });
  };

  at(marks.destination, !marks.belongs);
  if (marks.landing !== marks.destination) at(marks.landing, true);
}

/** An outline just inside a tile's edge, solid or dashed. Inset past the tile
 * border so a barrier drawn along that edge later does not paint over it. */
function drawHintOutline(
  dr: GameDrawing,
  bx: number,
  by: number,
  ts: number,
  dashed: boolean,
): void {
  const inset = TILE_BORDER + 1;
  const thickness = Math.max(2, Math.round(ts / 16));
  const x = bx + inset;
  const y = by + inset;
  const side = ts - 2 * inset;
  // A solid outline is a single dash the length of the side.
  const dash = dashed ? Math.max(3, Math.round(ts / 8)) : side;
  for (let d = 0; d < side; d += 2 * dash) {
    const run = Math.min(dash, side - d);
    dr.drawRect({ x: x + d, y, w: run, h: thickness }, COL_HINT);
    dr.drawRect({ x: x + d, y: y + side - thickness, w: run, h: thickness }, COL_HINT);
    dr.drawRect({ x, y: y + d, w: thickness, h: run }, COL_HINT);
    dr.drawRect({ x: x + side - thickness, y: y + d, w: thickness, h: run }, COL_HINT);
  }
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
  fill: number,
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

  dr.drawPolygon(coords, fill, COL_TEXT);
}

/** One border arrow, addressed by its ring position. */
function drawArrowAt(
  dr: GameDrawing,
  ds: NetslideDrawState,
  cx: number,
  cy: number,
  fill: number,
): void {
  if (cx === -1 && cy === -1) return; // no arrow here

  if (cx === -1)
    drawArrow(dr, ds, 0, cy + 1, 0, -1, fill); // left column
  else if (cx === ds.w)
    drawArrow(dr, ds, ds.w, cy, 0, +1, fill); // right
  else if (cy === -1)
    drawArrow(dr, ds, cx, 0, +1, 0, fill); // top row
  else if (cy === ds.h)
    drawArrow(dr, ds, cx + 1, ds.h, -1, 0, fill); // bottom
  else throw new Error(`(${cx}, ${cy}) is not a border-arrow position`);

  const ts = ds.tilesize;
  const b = border(ts);
  dr.drawUpdate({ x: cx * ts + b, y: cy * ts + b, w: ts, h: ts });
}

/** How an arrow should look: the cursor wins over the hint (it is where the
 * player's own attention is), and everything else is a plain arrow. */
function arrowFill(
  cx: number,
  cy: number,
  curX: number,
  curY: number,
  hintX: number,
  hintY: number,
): number {
  if (cx === curX && cy === curY) return COL_CURSOR;
  if (cx === hintX && cy === hintY) return COL_HINT;
  return COL_LOWLIGHT;
}

/* ----------------------------------------------------------------------
 * The frame.
 */

export function redraw(
  dr: GameDrawing,
  ds: NetslideDrawState,
  prev: NetslideState | null,
  current: NetslideState,
  _dir: number,
  ui: NetslideUi,
  animTime: number,
  flashTime: number,
  hint?: HintStep<NetslideMove, NetslideHint>,
): void {
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

  const marks = hint?.highlights;
  const hintArrowX = marks?.arrowX ?? -2;
  const hintArrowY = marks?.arrowY ?? -2;

  // The cursor and hint arrows: repaint the ones that were lit and the ones that
  // now are. The arrows sit in the gutter, which no tile repaint reaches, so
  // this is their whole cache.
  const curX = ui.cursor.visible ? ui.cursor.x : -1;
  const curY = ui.cursor.visible ? ui.cursor.y : -1;
  if (
    curX !== ds.curX ||
    curY !== ds.curY ||
    hintArrowX !== ds.hintArrowX ||
    hintArrowY !== ds.hintArrowY
  ) {
    const stale: [number, number][] = [
      [ds.curX, ds.curY],
      [ds.hintArrowX, ds.hintArrowY],
      [curX, curY],
      [hintArrowX, hintArrowY],
    ];
    for (const [ax, ay] of stale) {
      if (ax === -2 || ay === -2) continue;
      drawArrowAt(
        dr,
        ds,
        ax,
        ay,
        arrowFill(ax, ay, curX, curY, hintArrowX, hintArrowY),
      );
    }
    ds.curX = curX;
    ds.curY = curY;
    ds.hintArrowX = hintArrowX;
    ds.hintArrowY = hintArrowY;
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

  // Which cell of *this* board holds the tile the hint is placing. The midend
  // advances the plan when an animation *ends*, so while the hinted slide plays
  // the displayed step still indexes the board just left: the tile is at
  // `marks.landing`, and marking it there makes the highlight travel with it
  // (`marks.tile` would mark whatever slid into the vacated cell). Any other
  // displayed step was computed against this board, so `marks.tile` is right.
  const animating = oldstate !== null && t < ANIM_TIME;
  const playingThisStep =
    animating && hint !== undefined && isMoveBeingAnimated(hint.move, state);
  const hintTile = marks ? (playingThisStep ? marks.landing : marks.tile) : -1;

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

      // The hint overlay goes into the cache word (see the HINT_* bits).
      if (marks) {
        if (i === hintTile) c |= HINT_TILE;
        // `drawHintTargets` draws the outlines; their bits are keyed here so the
        // tile under a stale outline repaints once the hint moves on.
        if (i === marks.destination) c |= marks.belongs ? HINT_HOME : HINT_LANDING;
        else if (i === marks.landing) c |= HINT_LANDING;
      }

      // The completion flash ripples outward: a tile at Chebyshev distance
      // `dist` from the center flashes on and off over frames dist … dist+3.
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

  // Last, so no sliding tile paints across them.
  if (marks) drawHintTargets(dr, ds, marks);

  dr.unclip();
}

/** Is `move` the slide currently being animated? The state records the last slide
 * it was given, and a Netslide move is exactly (line, direction), so this is a
 * comparison rather than a guess. */
function isMoveBeingAnimated(move: NetslideMove, s: NetslideState): boolean {
  if (move.type !== "slide" || move.dir !== s.lastMoveDir) return false;
  return move.axis === "row"
    ? move.index === s.lastMoveRow
    : move.index === s.lastMoveCol;
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
 * except the center ones. */
function drawSlideArrows(
  dr: GameDrawing,
  ds: NetslideDrawState,
  s: NetslideState,
): void {
  for (let x = 0; x < ds.w; x++) {
    if (x === s.cx) continue;
    drawArrow(dr, ds, x, 0, +1, 0, COL_LOWLIGHT); // above, pointing up
    drawArrow(dr, ds, x + 1, ds.h, -1, 0, COL_LOWLIGHT); // below, pointing down
  }
  for (let y = 0; y < ds.h; y++) {
    if (y === s.cy) continue;
    drawArrow(dr, ds, ds.w, y, 0, +1, COL_LOWLIGHT); // right, pointing right
    drawArrow(dr, ds, 0, y + 1, 0, -1, COL_LOWLIGHT); // left, pointing left
  }
}
