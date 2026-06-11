/**
 * Twiddle rendering: bevelled numbered tiles, the subsquare rotation
 * animation (the one render piece with no analogue in the other ported
 * grid games), the per-edge bevel recolouring through a turn, the cursor
 * region highlight, and the completion flash. Faithful port of
 * `twiddle.c`'s `game_redraw` / `draw_tile` / `rotate` / `highlight_colour`.
 */

import type { Colour, Point, Size } from "../../../puzzle/types.ts";
import type { GameDrawing } from "../../engine/game.ts";
import { coord as coordE, fromCoord as fromCoordE } from "../../engine/geometry.ts";
import type { TwiddleParams, TwiddleState, TwiddleUi } from "./state.ts";

// --- constants --------------------------------------------------------

export const PREFERRED_TILE_SIZE = 48;
export const ANIM_PER_BLKSIZE_UNIT = 0.13;
export const FLASH_FRAME = 0.13;
const HIGHLIGHT_WIDTH_DIV = 20;

// --- colour indices ---------------------------------------------------

export const COL_BACKGROUND = 0;
export const COL_TEXT = 1;
export const COL_HIGHLIGHT = 2;
export const COL_HIGHLIGHT_GENTLE = 3;
export const COL_LOWLIGHT = 4;
export const COL_LOWLIGHT_GENTLE = 5;
export const COL_HIGHCURSOR = 6;
export const COL_LOWCURSOR = 7;
export const NCOLOURS = 8;

// --- cursor edge flags ------------------------------------------------

const CUR_TOP = 1;
const CUR_RIGHT = 2;
const CUR_BOTTOM = 4;
const CUR_LEFT = 8;

// --- geometry ---------------------------------------------------------

export function border(ts: number): number {
  return Math.floor(ts / 2);
}

export function coord(pos: number, ts: number): number {
  return coordE(pos, ts, border(ts));
}

export function fromCoord(pixel: number, ts: number): number {
  return fromCoordE(pixel, ts, border(ts));
}

function highlightWidth(ts: number): number {
  return Math.max(1, Math.floor(ts / HIGHLIGHT_WIDTH_DIV));
}

export function computeSize(p: TwiddleParams, ts: number): Size {
  const b = border(ts);
  return { w: ts * p.w + 2 * b, h: ts * p.h + 2 * b };
}

/** Animation duration for a rotation of an `n×n` block. */
export function animLength(n: number): number {
  return ANIM_PER_BLKSIZE_UNIT * Math.sqrt(n - 1);
}

// --- draw state -------------------------------------------------------

export interface TwiddleDrawState {
  started: boolean;
  w: number;
  h: number;
  bgcolour: number;
  /** Per-cell cache of the packed `number*4 + orient`; `-1` forces a
   * redraw (unknown, or inside the animating block). */
  cache: Int32Array;
  tilesize: number;
  /** Cached cursor top-left in rotation-origin space; `< 0` when hidden. */
  curX: number;
  curY: number;
}

export function newDrawState(state: TwiddleState): TwiddleDrawState {
  return {
    started: false,
    w: state.w,
    h: state.h,
    bgcolour: COL_BACKGROUND,
    cache: new Int32Array(state.w * state.h).fill(-1),
    tilesize: 0,
    curX: -state.n,
    curY: -state.n,
  };
}

// --- rotation ---------------------------------------------------------

interface Rotation {
  cx: number;
  cy: number;
  cw: number;
  ch: number;
  ox: number;
  oy: number;
  c: number;
  s: number;
  lc: number;
  rc: number;
  tc: number;
  bc: number;
}

/** Rotate a point about the rotation origin, rounding to nearest; the
 * identity when `rot` is null. */
function rotate(px: number, py: number, rot: Rotation | null): Point {
  if (!rot) return { x: px, y: py };
  const xf = px - rot.ox;
  const yf = py - rot.oy;
  const xf2 = rot.c * xf + rot.s * yf;
  const yf2 = -rot.s * xf + rot.c * yf;
  return { x: Math.round(xf2 + rot.ox), y: Math.round(yf2 + rot.oy) };
}

/** Upstream `highlight_colour`: map a (radian) edge angle to one of the
 * five bevel colours so the four sides of a turning tile recolour
 * smoothly through the rotation. */
function highlightColour(angle: number): number {
  // Indices into [low, low_gentle×3, high_gentle×3, high×9, high_gentle×3,
  // low_gentle×3, low×8] — the 32-entry table from twiddle.c.
  const table = [
    COL_LOWLIGHT,
    COL_LOWLIGHT_GENTLE,
    COL_LOWLIGHT_GENTLE,
    COL_LOWLIGHT_GENTLE,
    COL_HIGHLIGHT_GENTLE,
    COL_HIGHLIGHT_GENTLE,
    COL_HIGHLIGHT_GENTLE,
    COL_HIGHLIGHT,
    COL_HIGHLIGHT,
    COL_HIGHLIGHT,
    COL_HIGHLIGHT,
    COL_HIGHLIGHT,
    COL_HIGHLIGHT,
    COL_HIGHLIGHT,
    COL_HIGHLIGHT,
    COL_HIGHLIGHT,
    COL_HIGHLIGHT,
    COL_HIGHLIGHT_GENTLE,
    COL_HIGHLIGHT_GENTLE,
    COL_HIGHLIGHT_GENTLE,
    COL_LOWLIGHT_GENTLE,
    COL_LOWLIGHT_GENTLE,
    COL_LOWLIGHT_GENTLE,
    COL_LOWLIGHT,
    COL_LOWLIGHT,
    COL_LOWLIGHT,
    COL_LOWLIGHT,
    COL_LOWLIGHT,
    COL_LOWLIGHT,
    COL_LOWLIGHT,
    COL_LOWLIGHT,
    COL_LOWLIGHT,
  ];
  const idx = Math.floor((angle + 2 * Math.PI) / (Math.PI / 16)) & 31;
  return table[idx];
}

// --- tile drawing -----------------------------------------------------

function drawTile(
  dr: GameDrawing,
  ts: number,
  hw: number,
  orientable: boolean,
  px: number,
  py: number,
  num: number,
  orient: number,
  flashColour: number,
  rotIn: Rotation | null,
  cedges: number,
): void {
  // If we've been passed a rotation region but this tile is outside it,
  // draw it normally (can happen when cleaning up a completion flash
  // while a new move is also being made).
  let rot = rotIn;
  if (
    rot &&
    (px < rot.cx || py < rot.cy || px >= rot.cx + rot.cw || py >= rot.cy + rot.ch)
  ) {
    rot = null;
  }

  if (rot) dr.clip({ x: rot.cx, y: rot.cy, w: rot.cw, h: rot.ch });

  // The four bevel edges, each a triangle from a pair of corners to the
  // centre. During a rotation they all differ in colour.
  const cc = rotate(px + ts / 2, py + ts / 2, rot);
  const c00 = rotate(px, py, rot);
  const c10 = rotate(px + ts - 1, py, rot);
  const c11 = rotate(px + ts - 1, py + ts - 1, rot);
  const c01 = rotate(px, py + ts - 1, rot);

  // Right side.
  dr.drawPolygon(
    [c11, c10, cc],
    rot ? rot.rc : COL_LOWLIGHT,
    rot ? rot.rc : cedges & CUR_RIGHT ? COL_LOWCURSOR : COL_LOWLIGHT,
  );
  // Bottom side.
  dr.drawPolygon(
    [c11, c01, cc],
    rot ? rot.bc : COL_LOWLIGHT,
    rot ? rot.bc : cedges & CUR_BOTTOM ? COL_LOWCURSOR : COL_LOWLIGHT,
  );
  // Left side.
  dr.drawPolygon(
    [c00, c01, cc],
    rot ? rot.lc : COL_HIGHLIGHT,
    rot ? rot.lc : cedges & CUR_LEFT ? COL_HIGHCURSOR : COL_HIGHLIGHT,
  );
  // Top side.
  dr.drawPolygon(
    [c00, c10, cc],
    rot ? rot.tc : COL_HIGHLIGHT,
    rot ? rot.tc : cedges & CUR_TOP ? COL_HIGHCURSOR : COL_HIGHLIGHT,
  );

  // The blank centre area.
  if (rot) {
    dr.drawPolygon(
      [
        rotate(px + hw, py + hw, rot),
        rotate(px + hw, py + ts - 1 - hw, rot),
        rotate(px + ts - 1 - hw, py + ts - 1 - hw, rot),
        rotate(px + ts - 1 - hw, py + hw, rot),
      ],
      flashColour,
      flashColour,
    );
  } else {
    dr.drawRect(
      { x: px + hw, y: py + hw, w: ts - 2 * hw, h: ts - 2 * hw },
      flashColour,
    );
  }

  // Orientation triangle.
  if (orientable) {
    let xdx: number;
    let xdy: number;
    let ydx: number;
    let ydy: number;
    switch (orient & 3) {
      case 1:
        xdx = 0;
        xdy = -1;
        ydx = 1;
        ydy = 0;
        break;
      case 2:
        xdx = -1;
        xdy = 0;
        ydx = 0;
        ydy = -1;
        break;
      case 3:
        xdx = 0;
        xdy = 1;
        ydx = -1;
        ydy = 0;
        break;
      default: // 0
        xdx = 1;
        xdy = 0;
        ydx = 0;
        ydy = 1;
        break;
    }
    const cx = px + ts / 2;
    const cy = py + ts / 2;
    const displ = ts / 2 - hw - 2;
    const displ2 = ts / 3 - hw;
    dr.drawPolygon(
      [
        rotate(cx - displ * xdx + displ2 * ydx, cy - displ * xdy + displ2 * ydy, rot),
        rotate(cx + displ * xdx + displ2 * ydx, cy + displ * xdy + displ2 * ydy, rot),
        rotate(cx - displ * ydx, cy - displ * ydy, rot),
      ],
      COL_LOWLIGHT_GENTLE,
      COL_LOWLIGHT_GENTLE,
    );
  }

  const textCentre = rotate(px + ts / 2, py + ts / 2, rot);
  dr.drawText(
    textCentre,
    { align: "center", baseline: "mathematical", fontType: "variable", size: ts / 3 },
    COL_TEXT,
    String(num),
  );

  if (rot) dr.unclip();
  dr.drawUpdate({ x: px, y: py, w: ts, h: ts });
}

function drawRecessedBorder(dr: GameDrawing, w: number, h: number, ts: number): void {
  const hw = highlightWidth(ts);
  const right = coord(w, ts) + hw - 1;
  const bottom = coord(h, ts) + hw - 1;
  const left = coord(0, ts) - hw;
  const top = coord(0, ts) - hw;

  // Highlight bevel.
  dr.drawPolygon(
    [
      { x: right, y: bottom },
      { x: right, y: top },
      { x: right - ts, y: top + ts },
      { x: left + ts, y: bottom - ts },
      { x: left, y: bottom },
    ],
    COL_HIGHLIGHT,
    COL_HIGHLIGHT,
  );
  // Lowlight bevel (same polygon with the first point moved to top-left).
  dr.drawPolygon(
    [
      { x: left, y: top },
      { x: right, y: top },
      { x: right - ts, y: top + ts },
      { x: left + ts, y: bottom - ts },
      { x: left, y: bottom },
    ],
    COL_LOWLIGHT,
    COL_LOWLIGHT,
  );
}

// --- redraw -----------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: TwiddleDrawState | null,
  prev: TwiddleState | null,
  state: TwiddleState,
  dir: number,
  ui: TwiddleUi,
  animTime: number,
  flashTime: number,
): void {
  if (!ds) return;
  const ts = ds.tilesize;
  const { w, h, n } = state;
  const hw = highlightWidth(ts);

  const cx = ui.curVisible ? ui.curX : -n;
  const cy = ui.curVisible ? ui.curY : -n;
  const cmoved = cx !== ds.curX || cy !== ds.curY;

  let bgcolour = COL_BACKGROUND;
  if (flashTime > 0) {
    const frame = Math.floor(flashTime / FLASH_FRAME);
    bgcolour = frame % 2 ? COL_LOWLIGHT : COL_HIGHLIGHT;
  }

  if (!ds.started) {
    // The engine paints no pixels of its own: fill our own background,
    // then draw the recessed frame around the playfield.
    const size = computeSize({ w, h } as TwiddleParams, ts);
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_BACKGROUND);
    drawRecessedBorder(dr, w, h, ts);
    ds.started = true;
  }

  // Set up the rotation parameters if we're animating, and clear the
  // rotated region to the background colour first.
  let rot: Rotation | null = null;
  let lastx = -1;
  let lasty = -1;
  if (prev) {
    let lastr: number;
    if (dir > 0) {
      lastx = state.lastX;
      lasty = state.lastY;
      lastr = state.lastR;
    } else {
      lastx = prev.lastX;
      lasty = prev.lastY;
      lastr = -prev.lastR;
    }
    if (lastx >= 0 && lasty >= 0) {
      const animMax = animLength(n);
      const rcx = coord(lastx, ts);
      const rcy = coord(lasty, ts);
      const cw = ts * n;
      const angle = -(Math.PI / 2) * lastr * (1 - animTime / animMax);
      rot = {
        cx: rcx,
        cy: rcy,
        cw,
        ch: cw,
        ox: rcx + cw / 2,
        oy: rcy + cw / 2,
        c: Math.cos(angle),
        s: Math.sin(angle),
        lc: highlightColour(Math.PI + angle),
        rc: highlightColour(angle),
        tc: highlightColour(Math.PI / 2 + angle),
        bc: highlightColour(-Math.PI / 2 + angle),
      };
      dr.drawRect({ x: rcx, y: rcy, w: cw, h: cw }, bgcolour);
    }
  }

  for (let i = 0; i < w * h; i++) {
    const tx = i % w;
    const ty = Math.floor(i / w);

    // -1 ("always redraw") for cells inside the animating block.
    const inBlock =
      rot !== null &&
      lastx >= 0 &&
      lasty >= 0 &&
      tx >= lastx &&
      tx < lastx + n &&
      ty >= lasty &&
      ty < lasty + n;
    const t = inBlock ? -1 : state.numbers[i] * 4 + state.orient[i];

    let cc = false;
    if (cmoved) {
      if (tx === cx || tx === cx + n - 1 || ty === cy || ty === cy + n - 1) cc = true;
      if (
        tx === ds.curX ||
        tx === ds.curX + n - 1 ||
        ty === ds.curY ||
        ty === ds.curY + n - 1
      )
        cc = true;
    }

    if (
      ds.bgcolour !== bgcolour ||
      ds.cache[i] !== t ||
      ds.cache[i] === -1 ||
      t === -1 ||
      cc
    ) {
      const x = coord(tx, ts);
      const y = coord(ty, ts);
      let cedges = 0;
      if (tx === cx && ty >= cy && ty <= cy + n - 1) cedges |= CUR_LEFT;
      if (ty === cy && tx >= cx && tx <= cx + n - 1) cedges |= CUR_TOP;
      if (tx === cx + n - 1 && ty >= cy && ty <= cy + n - 1) cedges |= CUR_RIGHT;
      if (ty === cy + n - 1 && tx >= cx && tx <= cx + n - 1) cedges |= CUR_BOTTOM;

      drawTile(
        dr,
        ts,
        hw,
        state.orientable,
        x,
        y,
        state.numbers[i],
        state.orient[i],
        bgcolour,
        rot,
        cedges,
      );
      ds.cache[i] = t;
    }
  }

  ds.bgcolour = bgcolour;
  ds.curX = cx;
  ds.curY = cy;
}

// --- palette ----------------------------------------------------------

function clampColour(c: Colour): Colour {
  return [
    Math.max(0, Math.min(1, c[0])),
    Math.max(0, Math.min(1, c[1])),
    Math.max(0, Math.min(1, c[2])),
  ];
}

/** Build the Twiddle palette from a base background + highlight/lowlight
 * (the gentle bevels and the red-tinged cursor colours). */
export function buildColours(bg: Colour, hi: Colour, lo: Colour): Colour[] {
  const highCursor: Colour = [bg[0] * 1.0, bg[1] * 0.5, bg[2] * 0.5];
  const out: Colour[] = new Array(NCOLOURS);
  out[COL_BACKGROUND] = bg;
  out[COL_TEXT] = [0, 0, 0];
  out[COL_HIGHLIGHT] = hi;
  out[COL_HIGHLIGHT_GENTLE] = clampColour([bg[0] * 1.1, bg[1] * 1.1, bg[2] * 1.1]);
  out[COL_LOWLIGHT] = lo;
  out[COL_LOWLIGHT_GENTLE] = clampColour([bg[0] * 0.9, bg[1] * 0.9, bg[2] * 0.9]);
  out[COL_HIGHCURSOR] = clampColour(highCursor);
  out[COL_LOWCURSOR] = clampColour([
    highCursor[0] * 0.6,
    highCursor[1] * 0.6,
    highCursor[2] * 0.6,
  ]);
  return out;
}
