/**
 * Twiddle rendering: beveled numbered tiles, the block rotation animation with
 * each tile's bevel edges recolored through the turn, the cursor region
 * outline, and the completion flash. Port of upstream `game_redraw` /
 * `draw_tile` / `rotate` / `highlight_colour`.
 */

import { CURSOR, INK } from "../../engine/color/palette.ts";
import {
  twiddleGentleHighlight,
  twiddleGentleLowlight,
} from "../../engine/color/palette-games.ts";
import { drawRecessedBorder } from "../../engine/draw.ts";
import type { GameDrawing } from "../../engine/game.ts";
import { coord as coordE, fromCoord as fromCoordE } from "../../engine/geometry.ts";
import type { Color, Point, Rect, Size } from "../../engine/types.ts";
import type { TwiddleState, TwiddleUi } from "./state.ts";

// --- constants --------------------------------------------------------

export const PREFERRED_TILE_SIZE = 48;
export const ANIM_PER_BLKSIZE_UNIT = 0.13;
export const FLASH_FRAME = 0.13;
const HIGHLIGHT_WIDTH_DIV = 20;

// --- color indices ---------------------------------------------------

export const COL_BACKGROUND = 0;
export const COL_TEXT = 1;
export const COL_HIGHLIGHT = 2;
export const COL_HIGHLIGHT_GENTLE = 3;
export const COL_LOWLIGHT = 4;
export const COL_LOWLIGHT_GENTLE = 5;
export const COL_HIGHCURSOR = 6;
export const COL_LOWCURSOR = 7;
export const NCOLORS = 8;

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

export function computeSize(p: Size, ts: number): Size {
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
  bgcolor: number;
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
    bgcolor: COL_BACKGROUND,
    cache: new Int32Array(state.w * state.h).fill(-1),
    tilesize: 0,
    curX: -state.n,
    curY: -state.n,
  };
}

// --- rotation ---------------------------------------------------------

/** The block turning mid-animation. */
interface Rotation {
  /** The block's pixel rect, which each of its tiles is clipped to. */
  block: Rect;
  /** The center of rotation. */
  ox: number;
  oy: number;
  cos: number;
  sin: number;
  leftColor: number;
  rightColor: number;
  topColor: number;
  bottomColor: number;
}

/** Rotate a point about the rotation center, rounding to nearest; the
 * identity when `rot` is null. */
function rotate(px: number, py: number, rot: Rotation | null): Point {
  if (!rot) return { x: px, y: py };
  const xf = px - rot.ox;
  const yf = py - rot.oy;
  const xf2 = rot.cos * xf + rot.sin * yf;
  const yf2 = -rot.sin * xf + rot.cos * yf;
  return { x: Math.round(xf2 + rot.ox), y: Math.round(yf2 + rot.oy) };
}

/** Upstream `highlight_colour`: the bevel color of an edge facing `angle`
 * radians, in 32 steps round the circle, so the four sides of a turning tile
 * recolor smoothly. Lit facing up and left, shaded facing down and right,
 * gentle in between. */
function highlightColor(angle: number): number {
  const step = Math.floor((angle + 2 * Math.PI) / (Math.PI / 16)) & 31;
  if (step >= 7 && step <= 16) return COL_HIGHLIGHT;
  if (step >= 4 && step <= 19) return COL_HIGHLIGHT_GENTLE;
  if (step >= 1 && step <= 22) return COL_LOWLIGHT_GENTLE;
  return COL_LOWLIGHT;
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
  flashColor: number,
  rot: Rotation | null,
  cedges: number,
): void {
  if (rot) dr.clip(rot.block);

  // The four bevel edges, each a triangle from a pair of corners to the
  // center. During a rotation they all differ in color.
  const center = rotate(px + ts / 2, py + ts / 2, rot);
  const c00 = rotate(px, py, rot);
  const c10 = rotate(px + ts - 1, py, rot);
  const c11 = rotate(px + ts - 1, py + ts - 1, rot);
  const c01 = rotate(px, py + ts - 1, rot);

  // Right side.
  dr.drawPolygon(
    [c11, c10, center],
    rot ? rot.rightColor : COL_LOWLIGHT,
    rot ? rot.rightColor : cedges & CUR_RIGHT ? COL_LOWCURSOR : COL_LOWLIGHT,
  );
  // Bottom side.
  dr.drawPolygon(
    [c11, c01, center],
    rot ? rot.bottomColor : COL_LOWLIGHT,
    rot ? rot.bottomColor : cedges & CUR_BOTTOM ? COL_LOWCURSOR : COL_LOWLIGHT,
  );
  // Left side.
  dr.drawPolygon(
    [c00, c01, center],
    rot ? rot.leftColor : COL_HIGHLIGHT,
    rot ? rot.leftColor : cedges & CUR_LEFT ? COL_HIGHCURSOR : COL_HIGHLIGHT,
  );
  // Top side.
  dr.drawPolygon(
    [c00, c10, center],
    rot ? rot.topColor : COL_HIGHLIGHT,
    rot ? rot.topColor : cedges & CUR_TOP ? COL_HIGHCURSOR : COL_HIGHLIGHT,
  );

  // The blank center area.
  if (rot) {
    dr.drawPolygon(
      [
        rotate(px + hw, py + hw, rot),
        rotate(px + hw, py + ts - 1 - hw, rot),
        rotate(px + ts - 1 - hw, py + ts - 1 - hw, rot),
        rotate(px + ts - 1 - hw, py + hw, rot),
      ],
      flashColor,
      flashColor,
    );
  } else {
    dr.drawRect({ x: px + hw, y: py + hw, w: ts - 2 * hw, h: ts - 2 * hw }, flashColor);
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

  dr.drawText(
    center,
    { align: "center", baseline: "mathematical", fontType: "variable", size: ts / 3 },
    COL_TEXT,
    String(num),
  );

  if (rot) dr.unclip();
  dr.drawUpdate({ x: px, y: py, w: ts, h: ts });
}

// --- redraw -----------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: TwiddleDrawState,
  prev: TwiddleState | null,
  state: TwiddleState,
  dir: number,
  ui: TwiddleUi,
  animTime: number,
  flashTime: number,
): void {
  const ts = ds.tilesize;
  const { w, h, n } = state;
  const hw = highlightWidth(ts);

  const cx = ui.cursor.visible ? ui.cursor.x : -n;
  const cy = ui.cursor.visible ? ui.cursor.y : -n;
  const cmoved = cx !== ds.curX || cy !== ds.curY;

  let bgcolor = COL_BACKGROUND;
  if (flashTime > 0) {
    const frame = Math.floor(flashTime / FLASH_FRAME);
    bgcolor = frame % 2 ? COL_LOWLIGHT : COL_HIGHLIGHT;
  }

  if (!ds.started) {
    // The engine paints no pixels of its own: fill our own background,
    // then draw the recessed frame around the playfield.
    const size = computeSize(state, ts);
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_BACKGROUND);
    drawRecessedBorder(
      dr,
      {
        left: coord(0, ts) - hw,
        top: coord(0, ts) - hw,
        right: coord(w, ts) + hw - 1,
        bottom: coord(h, ts) + hw - 1,
      },
      ts,
      COL_HIGHLIGHT,
      COL_LOWLIGHT,
    );
    ds.started = true;
  }

  // Set up the rotation parameters if we're animating, and clear the
  // rotated region to the background color first.
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
      const cw = ts * n;
      const block = { x: coord(lastx, ts), y: coord(lasty, ts), w: cw, h: cw };
      const angle = -(Math.PI / 2) * lastr * (1 - animTime / animMax);
      rot = {
        block,
        ox: block.x + cw / 2,
        oy: block.y + cw / 2,
        cos: Math.cos(angle),
        sin: Math.sin(angle),
        leftColor: highlightColor(Math.PI + angle),
        rightColor: highlightColor(angle),
        topColor: highlightColor(Math.PI / 2 + angle),
        bottomColor: highlightColor(-Math.PI / 2 + angle),
      };
      dr.drawRect(block, bgcolor);
    }
  }

  for (let i = 0; i < w * h; i++) {
    const tx = i % w;
    const ty = Math.floor(i / w);

    // -1 ("always redraw") for cells inside the animating block.
    const inBlock =
      rot !== null && tx >= lastx && tx < lastx + n && ty >= lasty && ty < lasty + n;
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

    if (ds.bgcolor !== bgcolor || ds.cache[i] !== t || t === -1 || cc) {
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
        bgcolor,
        // A tile outside the turning block draws unrotated, even mid-turn
        // (a completion flash can repaint it while a new move animates).
        inBlock ? rot : null,
        cedges,
      );
      ds.cache[i] = t;
    }
  }

  ds.bgcolor = bgcolor;
  ds.curX = cx;
  ds.curY = cy;
}

// --- palette ----------------------------------------------------------

function clampColor(c: Color): Color {
  return [
    Math.max(0, Math.min(1, c[0])),
    Math.max(0, Math.min(1, c[1])),
    Math.max(0, Math.min(1, c[2])),
  ];
}

/** Build the Twiddle palette from a base background + highlight/lowlight
 * (the gentle bevels and the cursor). */
export function buildColors(bg: Color, hi: Color, lo: Color): Color[] {
  const out: Color[] = new Array(NCOLORS);
  out[COL_BACKGROUND] = bg;
  out[COL_TEXT] = INK;
  out[COL_HIGHLIGHT] = hi;
  out[COL_HIGHLIGHT_GENTLE] = clampColor(twiddleGentleHighlight(bg));
  out[COL_LOWLIGHT] = lo;
  out[COL_LOWLIGHT_GENTLE] = clampColor(twiddleGentleLowlight(bg));
  // The cursor is the *outline* of the bevel triangles along the block's
  // edges, over their ordinary fill — a line, so one authored color serves
  // both the lit and the shaded sides. Two slots survive because the dark-mode
  // swap table keys them by index.
  out[COL_HIGHCURSOR] = CURSOR;
  out[COL_LOWCURSOR] = CURSOR;
  return out;
}
