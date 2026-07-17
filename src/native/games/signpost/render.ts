/**
 * Signpost renderer — imperative per-tile draw with a packed-word cache,
 * a blitter-backed drag sprite, and the spin win-flash. Faithful port of
 * `game_redraw` / `tile_redraw` / `game_colours`. Byte-parity scope is
 * the generator/solver only, so this uses idiomatic rounding.
 */

import type { Colour, Point } from "../../../puzzle/types.ts";
import { drawRectOutline } from "../../engine/draw.ts";
import type { GameDrawing } from "../../engine/game.ts";
import { dragReleaseMove, executeMove } from "./moves.ts";
import {
  FLAG_ERROR,
  FLAG_IMMUTABLE,
  isPointing,
  type SignpostDrawState,
  type SignpostMistake,
  type SignpostState,
  type SignpostUi,
  whichDir,
} from "./state.ts";

// --- colour indices (index-for-index with the C enum) ----------------

const COL_BACKGROUND = 0;
const COL_HIGHLIGHT = 1;
const COL_LOWLIGHT = 2;
const COL_GRID = 3;
const COL_CURSOR = 4;
const COL_ERROR = 5;
const COL_DRAG_ORIGIN = 6;
const COL_ARROW = 7;
const COL_ARROW_BG_DIM = 8;
const COL_NUMBER = 9;
const COL_NUMBER_SET = 10;
const COL_NUMBER_SET_MID = 11;
const NBACKGROUNDS = 16;
const COL_B0 = 12;
const COL_M0 = COL_B0 + 1 * NBACKGROUNDS;
const COL_D0 = COL_B0 + 2 * NBACKGROUNDS;
const COL_X0 = COL_B0 + 3 * NBACKGROUNDS;

const BORDER = 1; // NARROW_BORDERS
const FLASH_SPIN = 0.7;
const TWO_PI = 2 * Math.PI;

// --- per-tile flags ---------------------------------------------------

const F_CUR = 0x001;
const F_DRAG_SRC = 0x002;
const F_ERROR = 0x004;
const F_IMMUTABLE = 0x008;
const F_ARROW_POINT = 0x010;
const F_ARROW_INPOINT = 0x020;
const F_DIM = 0x040;

// --- palette ----------------------------------------------------------

const BG_COLS = [
  0xffffff, 0xffa07a, 0x98fb98, 0x7fffd4, 0xc3a6ff, 0xffa500, 0x87cefa, 0xffff00,
];

/** Port of `game_colours`: 12 named colours + four 16-entry ramps. */
export function buildPalette(
  background: Colour,
  highlight: Colour,
  lowlight: Colour,
): Colour[] {
  const n = COL_X0 + NBACKGROUNDS;
  const ret: Colour[] = Array.from({ length: n }, () => [0, 0, 0]);

  ret[COL_BACKGROUND] = [...background];
  ret[COL_HIGHLIGHT] = [...highlight];
  ret[COL_LOWLIGHT] = [...lowlight];

  for (let i = 0; i < 3; i++) {
    ret[COL_NUMBER][i] = 0;
    ret[COL_ARROW][i] = 0;
    ret[COL_CURSOR][i] = background[i] / 2;
    ret[COL_GRID][i] = background[i] / 1.3;
  }
  ret[COL_NUMBER_SET] = [0, 0, 0.9];
  ret[COL_ERROR] = [1, 0, 0];
  ret[COL_DRAG_ORIGIN] = [0.2, 1, 0.2];

  for (let c = 0; c < 8; c++) {
    const v = BG_COLS[c];
    ret[COL_B0 + c] = [
      ((v & 0xff0000) >> 16) / 256,
      ((v & 0xff00) >> 8) / 256,
      (v & 0xff) / 256,
    ];
  }
  // Second-half backgrounds interpolate consecutive first-half entries
  // (and, for c=7, the already-written B0+8) — replicate the C order.
  for (let c = 0; c < 8; c++) {
    for (let i = 0; i < 3; i++) {
      ret[COL_B0 + 8 + c][i] = (ret[COL_B0 + c][i] + ret[COL_B0 + c + 1][i]) / 2;
    }
  }

  const average = (r: number, a: number, b: number, w: number): void => {
    for (let i = 0; i < 3; i++) ret[r][i] = ret[a][i] + w * (ret[b][i] - ret[a][i]);
  };
  average(COL_ARROW_BG_DIM, COL_BACKGROUND, COL_ARROW, 0.1);
  average(COL_NUMBER_SET_MID, COL_B0, COL_NUMBER_SET, 0.3);
  for (let c = 0; c < NBACKGROUNDS; c++) {
    average(COL_M0 + c, COL_B0 + c, COL_NUMBER, 0.3);
    average(COL_D0 + c, COL_B0 + c, COL_NUMBER, 0.1);
    average(COL_X0 + c, COL_BACKGROUND, COL_B0 + c, 0.5);
  }
  return ret;
}

// --- primitive helpers ------------------------------------------------

const iround = (v: number): number => Math.round(v);

function drawArrow(
  dr: GameDrawing,
  cx: number,
  cy: number,
  sz: number,
  ang: number,
  cfill: number,
  cout: number,
): void {
  const s = Math.sin(ang);
  const c = Math.cos(ang);
  const xdx3 = iround(sz * (c / 3 + 1)) - sz;
  const xdy3 = iround(sz * (s / 3 + 1)) - sz;
  const xdx = iround(sz * (c + 1)) - sz;
  const xdy = iround(sz * (s + 1)) - sz;
  const ydx = -xdy;
  const ydy = xdx;

  const coords: Point[] = [
    { x: cx - ydx, y: cy - ydy },
    { x: cx + xdx, y: cy + xdy },
    { x: cx + xdx3, y: cy + xdy3 },
    { x: cx + xdx3 + ydx, y: cy + xdy3 + ydy },
    { x: cx - xdx3 + ydx, y: cy - xdy3 + ydy },
    { x: cx - xdx3, y: cy - xdy3 },
    { x: cx - xdx, y: cy - xdy },
  ];
  dr.drawPolygon(coords, cfill, cout);
}

function drawArrowDir(
  dr: GameDrawing,
  cx: number,
  cy: number,
  sz: number,
  dir: number,
  cfill: number,
  cout: number,
  angleOffset: number,
): void {
  drawArrow(dr, cx, cy, sz, (TWO_PI * dir) / 8 + angleOffset, cfill, cout);
}

function drawStar(
  dr: GameDrawing,
  cx: number,
  cy: number,
  rad: number,
  npoints: number,
  cfill: number,
  cout: number,
  angleOffset: number,
): void {
  const coords: Point[] = [];
  for (let n = 0; n < npoints * 2; n++) {
    const a = (TWO_PI * n) / (npoints * 2) + angleOffset;
    const r = n % 2 ? rad / 2 : rad;
    coords.push({ x: cx + iround(r * Math.sin(a)), y: cy + iround(-r * Math.cos(a)) });
  }
  dr.drawPolygon(coords, cfill, cout);
}

function drawRectCorners(
  dr: GameDrawing,
  cx: number,
  cy: number,
  r: number,
  col: number,
): void {
  const line = (x1: number, y1: number, x2: number, y2: number): void =>
    dr.drawLine({ x: x1, y: y1 }, { x: x2, y: y2 }, col, 1);
  const h = Math.floor(r / 2);
  line(cx - r, cy - r, cx - r, cy - h);
  line(cx - r, cy - r, cx - h, cy - r);
  line(cx - r, cy + r, cx - r, cy + h);
  line(cx - r, cy + r, cx - h, cy + r);
  line(cx + r, cy - r, cx + r, cy - h);
  line(cx + r, cy - r, cx + h, cy - r);
  line(cx + r, cy + r, cx + r, cy + h);
  line(cx + r, cy + r, cx + h, cy + r);
}

function num2col(n: number, num: number): number {
  const set = Math.floor(num / (n + 1));
  if (num <= 0 || set === 0) return COL_B0;
  return COL_B0 + 1 + ((set - 1) % 15);
}

// --- tile drawing -----------------------------------------------------

function dim(bg: number): number {
  return bg === COL_BACKGROUND ? COL_ARROW_BG_DIM : bg + COL_D0 - COL_B0;
}
function mid(fg: number, bg: number): number {
  return fg === COL_NUMBER_SET ? COL_NUMBER_SET_MID : bg + COL_M0 - COL_B0;
}
function dimbg(bg: number): number {
  return bg === COL_BACKGROUND ? COL_BACKGROUND : bg + COL_X0 - COL_B0;
}

/** Build the display string for a cell's number (upstream `tile_redraw`
 * text block). */
function numString(n: number, num: number): string {
  const set = num <= 0 ? 0 : Math.floor(num / (n + 1));
  if (set === 0 || num <= 0) return String(num);
  const rem = num % (n + 1);
  const suffix = rem !== 0 ? `+${rem}` : "";
  let letters = "";
  let s = set;
  do {
    s--;
    letters = String.fromCharCode((s % 26) + 97) + letters;
    s = Math.floor(s / 26);
  } while (s);
  return letters + suffix;
}

function tileRedraw(
  dr: GameDrawing,
  ds: SignpostDrawState,
  tx: number,
  ty: number,
  dir: number,
  num: number,
  f: number,
  angleOffset: number,
): void {
  const ts = ds.tileSize;
  const n = ds.n;
  const cb = Math.floor(ts / 16);
  const empty = num === 0 && !(f & F_ARROW_POINT) && !(f & F_ARROW_INPOINT);

  const setcol = empty ? COL_BACKGROUND : num2col(n, num);

  let arrowcol: number;
  if (f & F_DRAG_SRC) arrowcol = COL_DRAG_ORIGIN;
  else if (f & F_DIM) arrowcol = dim(setcol);
  else if (f & F_ARROW_POINT) arrowcol = mid(COL_ARROW, setcol);
  else arrowcol = COL_ARROW;

  let textcol: number;
  if (f & F_ERROR && !(f & F_IMMUTABLE)) {
    textcol = COL_ERROR;
  } else {
    textcol = f & F_IMMUTABLE ? COL_NUMBER_SET : COL_NUMBER;
    // upstream `dim()` ignores the fg and keys only off the background.
    if (f & F_DIM) {
      textcol = dim(setcol);
    } else if ((f & F_ARROW_POINT || num === n) && (f & F_ARROW_INPOINT || num === 1)) {
      textcol = mid(textcol, setcol);
    }
  }

  const sarrowcol = f & F_DIM ? dim(setcol) : COL_ARROW;

  // Clear tile background.
  dr.drawRect({ x: tx, y: ty, w: ts, h: ts }, f & F_DIM ? dimbg(setcol) : setcol);

  // Large outward-pointing arrow (or star for the final immutable cell).
  const asz = Math.floor((7 * ts) / 32);
  const acx = tx + Math.floor(ts / 2) + asz;
  const acy = ty + Math.floor(ts / 2) + asz;
  if (num === n && f & F_IMMUTABLE) {
    drawStar(dr, acx, acy, asz, 5, arrowcol, arrowcol, angleOffset);
  } else {
    drawArrowDir(dr, acx, acy, asz, dir, arrowcol, arrowcol, angleOffset);
  }
  if (f & F_CUR) drawRectCorners(dr, acx, acy, asz + 1, COL_CURSOR);

  // Predecessor dot: cell needs a predecessor and doesn't have one.
  const dcx = tx + Math.floor(ts / 2) - asz;
  const dcy = ty + Math.floor(ts / 2) + asz;
  if (!(f & F_ARROW_INPOINT) && num !== 1) {
    dr.drawCircle({ x: dcx, y: dcy }, Math.floor(asz / 4), sarrowcol, sarrowcol);
  }

  // Number / set text.
  if (!empty) {
    const p = numString(n, num);
    const textsz = Math.min(2 * asz, Math.floor((ts - 2 * cb) / p.length));
    dr.drawText(
      { x: tx + cb, y: ty + Math.floor(ts / 4) },
      { align: "left", baseline: "mathematical", fontType: "variable", size: textsz },
      textcol,
      p,
    );
  }

  dr.drawUpdate({ x: tx, y: ty, w: ts, h: ts });
}

// --- drag indicator ---------------------------------------------------

function drawDragIndicator(
  dr: GameDrawing,
  ds: SignpostDrawState,
  s: SignpostState,
  ui: SignpostUi,
  validDrag: boolean,
): void {
  const ts = ds.tileSize;
  const w = ds.w;
  const asz = Math.floor((7 * ts) / 32);
  const fx = Math.floor((ui.dx - BORDER) / ts);
  const fy = Math.floor((ui.dy - BORDER) / ts);
  let ang: number;

  const inGrid = fx >= 0 && fx < s.w && fy >= 0 && fy < s.h;
  if (validDrag && inGrid) {
    const dir = ui.dragIsFrom ? s.dirs[ui.sy * w + ui.sx] : s.dirs[fy * w + fx];
    ang = (TWO_PI * dir) / 8;
  } else {
    const ox = ui.sx * ts + BORDER + Math.floor(ts / 2);
    const oy = ui.sy * ts + BORDER + Math.floor(ts / 2);
    const xdiff = Math.abs(ox - ui.dx);
    const ydiff = Math.abs(oy - ui.dy);
    if (xdiff === 0) {
      ang = oy > ui.dy ? 0 : Math.PI;
    } else if (ydiff === 0) {
      ang = ox > ui.dx ? (3 * Math.PI) / 2 : Math.PI / 2;
    } else {
      let tana: number;
      let offset: number;
      if (ui.dx > ox && ui.dy < oy) {
        tana = xdiff / ydiff;
        offset = 0;
      } else if (ui.dx > ox && ui.dy > oy) {
        tana = ydiff / xdiff;
        offset = Math.PI / 2;
      } else if (ui.dx < ox && ui.dy > oy) {
        tana = xdiff / ydiff;
        offset = Math.PI;
      } else {
        tana = ydiff / xdiff;
        offset = (3 * Math.PI) / 2;
      }
      ang = Math.atan(tana) + offset;
    }
    if (!ui.dragIsFrom) ang += Math.PI; // point to the origin, not away
  }
  drawArrow(dr, ui.dx, ui.dy, asz, ang, COL_ARROW, COL_ARROW);
}

// --- main redraw ------------------------------------------------------

export function redrawSignpost(
  dr: GameDrawing,
  ds: SignpostDrawState | null,
  _prev: SignpostState | null,
  state: SignpostState,
  _dir: number,
  ui: SignpostUi,
  _animTime: number,
  flashTime: number,
  mistakes?: readonly SignpostMistake[],
): void {
  if (!ds) return;
  const ts = ds.tileSize;
  const w = state.w;

  let force = false;
  let angleOffset = 0;
  if (flashTime > 0) angleOffset = TWO_PI * (flashTime / FLASH_SPIN);
  if (angleOffset !== ds.angleOffset) {
    ds.angleOffset = angleOffset;
    force = true;
  }

  // Erase the drag sprite drawn last frame.
  if (ds.dragging) {
    if (ds.dragBackground) {
      dr.blitterLoad(ds.dragBackground, { x: ds.dragX, y: ds.dragY });
      dr.drawUpdate({ x: ds.dragX, y: ds.dragY, w: ts, h: ts });
    }
    ds.dragging = false;
  }

  // If an in-progress drag would make a valid move, reflect it (the C
  // "postdrop" preview): render the state that release would produce.
  let renderState = state;
  let postdropValid = false;
  if (ui.dragging) {
    const x = Math.floor((ui.dx - BORDER) / ts);
    const y = Math.floor((ui.dy - BORDER) / ts);
    const move = dragReleaseMove(state, ui, x, y);
    if (move) {
      renderState = executeMove(state, move);
      postdropValid = true;
    }
  }

  if (!ds.started) {
    const aw = ts * state.w;
    const ah = ts * state.h;
    // Engine paints nothing: fill the background ourselves, then the grid
    // frame (upstream `game_redraw` first-draw block).
    dr.drawRect({ x: 0, y: 0, w: aw + 2 * BORDER, h: ah + 2 * BORDER }, COL_BACKGROUND);
    drawRectOutline(dr, BORDER - 1, BORDER - 1, aw + 2, ah + 2, COL_GRID);
    dr.drawUpdate({ x: 0, y: 0, w: aw + 2 * BORDER, h: ah + 2 * BORDER });
  }

  const mistakeSet = mistakes?.length ? new Set(mistakes.map((m) => m.index)) : null;

  for (let x = 0; x < state.w; x++) {
    for (let y = 0; y < state.h; y++) {
      const i = y * w + x;
      let f = 0;
      let dirp = -1;

      if (ui.cshow && x === ui.cx && y === ui.cy) f |= F_CUR;

      if (ui.dragging) {
        if (x === ui.sx && y === ui.sy) {
          f |= F_DRAG_SRC;
        } else if (ui.dragIsFrom) {
          if (!isPointing(renderState, ui.sx, ui.sy, x, y)) f |= F_DIM;
        } else if (!isPointing(renderState, x, y, ui.sx, ui.sy)) {
          f |= F_DIM;
        }
      }

      if (
        renderState.impossible ||
        renderState.nums[i] < 0 ||
        renderState.flags[i] & FLAG_ERROR ||
        mistakeSet?.has(i)
      ) {
        f |= F_ERROR;
      }
      if (renderState.flags[i] & FLAG_IMMUTABLE) f |= F_IMMUTABLE;
      if (renderState.next[i] !== -1) f |= F_ARROW_POINT;
      if (renderState.prev[i] !== -1) {
        f |= F_ARROW_INPOINT;
        dirp = whichDir(
          x,
          y,
          renderState.prev[i] % w,
          Math.floor(renderState.prev[i] / w),
        );
      }

      if (
        renderState.nums[i] !== ds.nums[i] ||
        f !== ds.cache[i] ||
        dirp !== ds.dirp[i] ||
        force ||
        !ds.started
      ) {
        const sign = ui.gearMode ? 1 - 2 * ((x ^ y) & 1) : 1;
        tileRedraw(
          dr,
          ds,
          BORDER + x * ts,
          BORDER + y * ts,
          state.dirs[i],
          renderState.nums[i],
          f,
          sign * angleOffset,
        );
        ds.nums[i] = renderState.nums[i];
        ds.cache[i] = f;
        ds.dirp[i] = dirp;
      }
    }
  }

  // Draw the dragging sprite.
  if (ui.dragging) {
    if (!ds.dragBackground) ds.dragBackground = dr.blitterNew({ w: ts, h: ts });
    ds.dragging = true;
    ds.dragX = ui.dx - Math.floor(ts / 2);
    ds.dragY = ui.dy - Math.floor(ts / 2);
    dr.blitterSave(ds.dragBackground, { x: ds.dragX, y: ds.dragY });
    drawDragIndicator(dr, ds, state, ui, postdropValid);
  }

  if (!ds.started) ds.started = true;
}
