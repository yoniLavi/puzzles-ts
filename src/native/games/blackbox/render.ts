/**
 * Black Box — palette, geometry, and the imperative `redraw`.
 *
 * Faithful port of `blackbox.c`'s drawing routines: a per-cell cache
 * (`ds.grid` mirrors the displayed grid value, cursor/flash flags
 * included), the cover/lock/ball/reveal arena states with the red
 * wrong-guess cross, the firing-range tiles with their hit/reflect/number
 * text and wrong/omitted markers, the press-to-highlight laser flash, the
 * bevelled outline, and the reveal button. The engine paints no pixels of
 * its own, so the first-draw branch fills the background explicitly.
 */

import type { Colour, Point, Rect, Size } from "../../../puzzle/types.ts";
import { mkhighlight } from "../../engine/colour-mkhighlight.ts";
import { drawRectOutline } from "../../engine/draw.ts";
import type { GameDrawing } from "../../engine/game.ts";
import {
  BALL_CORRECT,
  BALL_GUESS,
  BALL_LOCK,
  type BlackboxParams,
  type BlackboxState,
  type BlackboxUi,
  canReveal,
  FLAG_CURSOR,
  LASER_EMPTY,
  LASER_FLAGMASK,
  LASER_FLASHED,
  LASER_HIT,
  LASER_OMITTED,
  LASER_REFLECT,
  LASER_WRONG,
  range2grid,
} from "./state.ts";

// --- colour indices (upstream enum, order load-bearing for dark-mode
//     palette swaps in augmentation.ts) -------------------------------

export const COL_BACKGROUND = 0;
export const COL_COVER = 1;
const COL_LOCK = 2;
const COL_TEXT = 3;
const COL_FLASHTEXT = 4;
const COL_HIGHLIGHT = 5;
const COL_LOWLIGHT = 6;
const COL_GRID = 7;
export const COL_BALL = 8;
export const COL_WRONG = 9;
export const COL_BUTTON = 10;
const COL_CURSOR = 11;
const NCOLOURS = 12;

export const PREFERRED_TILE_SIZE = 32;
const FLASH_FRAME = 0.2;
const CUR_ANIM = 0.2;

// --- draw state -------------------------------------------------------

export interface BlackboxDrawState {
  tilesize: number;
  crad: number;
  rrad: number;
  w: number;
  h: number;
  grid: Int32Array;
  started: boolean;
  reveal: boolean;
  isflash: boolean;
  flashLaserno: number;
}

export function newDrawState(s: BlackboxState): BlackboxDrawState {
  return {
    tilesize: 0,
    crad: 0,
    rrad: 0,
    w: s.w,
    h: s.h,
    grid: new Int32Array((s.w + 2) * (s.h + 2)),
    started: false,
    reveal: false,
    isflash: false,
    flashLaserno: LASER_EMPTY,
  };
}

export function setTileSize(ds: BlackboxDrawState, tilesize: number): void {
  ds.tilesize = tilesize;
  ds.crad = Math.floor((tilesize - 1) / 2);
  ds.rrad = Math.floor((3 * tilesize) / 8);
}

export function computeSize(p: BlackboxParams, tilesize: number): Size {
  const border = Math.floor(tilesize / 2);
  return {
    w: (p.w + 2) * tilesize + 2 * border,
    h: (p.h + 2) * tilesize + 2 * border,
  };
}

export function colours(defaultBackground: Colour): Colour[] {
  const { background: bg, highlight, lowlight } = mkhighlight(defaultBackground);
  const ret: Colour[] = new Array(NCOLOURS);
  ret[COL_BACKGROUND] = bg;
  ret[COL_HIGHLIGHT] = highlight;
  ret[COL_LOWLIGHT] = lowlight;
  ret[COL_BALL] = [0, 0, 0];
  ret[COL_WRONG] = [1, 0, 0];
  ret[COL_BUTTON] = [0, 1, 0];
  ret[COL_CURSOR] = [1, 0, 0];
  ret[COL_GRID] = [bg[0] * 0.9, bg[1] * 0.9, bg[2] * 0.9];
  ret[COL_LOCK] = [bg[0] * 0.7, bg[1] * 0.7, bg[2] * 0.7];
  ret[COL_COVER] = [bg[0] * 0.5, bg[1] * 0.5, bg[2] * 0.5];
  ret[COL_TEXT] = [0, 0, 0];
  ret[COL_FLASHTEXT] = [0, 1, 0];
  return ret;
}

// --- small draw helpers -----------------------------------------------

const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
const pt = (x: number, y: number): Point => ({ x, y });

function todraw(ds: BlackboxDrawState, x: number): number {
  return ds.tilesize * x + Math.floor(ds.tilesize / 2);
}

function gridIdx(w: number, x: number, y: number): number {
  return y * (w + 2) + x;
}

function drawSquareCursor(
  dr: GameDrawing,
  ds: BlackboxDrawState,
  dx: number,
  dy: number,
): void {
  const ts = ds.tilesize;
  const coff = Math.floor(ts / 8);
  drawRectOutline(dr, dx + coff, dy + coff, ts - coff * 2, ts - coff * 2, COL_CURSOR);
}

// --- arena tile -------------------------------------------------------

function drawArenaTile(
  dr: GameDrawing,
  gs: BlackboxState,
  ds: BlackboxDrawState,
  ui: BlackboxUi,
  ax: number,
  ay: number,
  force: boolean,
  isflash: boolean,
): void {
  const ts = ds.tilesize;
  const gx = ax + 1;
  const gy = ay + 1;
  let gsTile = gs.grid[gridIdx(gs.w, gx, gy)];
  const dsTile = ds.grid[gridIdx(ds.w, gx, gy)];
  const dx = todraw(ds, gx);
  const dy = todraw(ds, gy);

  if (ui.curVisible && ui.curX === gx && ui.curY === gy) gsTile |= FLAG_CURSOR;

  if (gsTile !== dsTile || gs.reveal !== ds.reveal || force) {
    const bg = gs.reveal ? COL_BACKGROUND : gsTile & BALL_LOCK ? COL_LOCK : COL_COVER;

    dr.drawRect(rect(dx, dy, ts, ts), bg);
    drawRectOutline(dr, dx, dy, ts, ts, COL_GRID);

    let bcol: number;
    if (gs.reveal) {
      if (gsTile & BALL_GUESS) bcol = isflash ? bg : COL_BALL;
      else if (gsTile & BALL_CORRECT) bcol = isflash ? bg : COL_WRONG;
      else bcol = bg;
    } else {
      bcol = gsTile & BALL_GUESS ? COL_BALL : bg;
    }
    const ocol = gsTile & FLAG_CURSOR && bcol !== bg ? COL_CURSOR : bcol;

    dr.drawCircle(
      pt(dx + Math.floor(ts / 2), dy + Math.floor(ts / 2)),
      ds.crad - 1,
      ocol,
      ocol,
    );
    dr.drawCircle(
      pt(dx + Math.floor(ts / 2), dy + Math.floor(ts / 2)),
      ds.crad - 3,
      bcol,
      bcol,
    );

    if (gsTile & FLAG_CURSOR && bcol === bg) drawSquareCursor(dr, ds, dx, dy);

    if (gs.reveal && gsTile & BALL_GUESS && !(gsTile & BALL_CORRECT)) {
      // Incorrect guess: a red cross over the ball.
      const x1 = dx + 3;
      const y1 = dy + 3;
      const x2 = dx + ts - 3;
      const y2 = dy + ts - 3;
      dr.drawPolygon(
        [
          pt(x1 - 1, y1 + 1),
          pt(x1 + 1, y1 - 1),
          pt(x2 + 1, y2 - 1),
          pt(x2 - 1, y2 + 1),
        ],
        COL_WRONG,
        COL_WRONG,
      );
      dr.drawPolygon(
        [
          pt(x2 + 1, y1 + 1),
          pt(x2 - 1, y1 - 1),
          pt(x1 - 1, y2 - 1),
          pt(x1 + 1, y2 + 1),
        ],
        COL_WRONG,
        COL_WRONG,
      );
    }
    dr.drawUpdate(rect(dx, dy, ts, ts));
  }
  ds.grid[gridIdx(ds.w, gx, gy)] = gsTile;
}

// --- laser (firing-range) tile ----------------------------------------

function drawLaserTile(
  dr: GameDrawing,
  gs: BlackboxState,
  ds: BlackboxDrawState,
  ui: BlackboxUi,
  lno: number,
  force: boolean,
): void {
  const ts = ds.tilesize;
  const rc = range2grid(gs.w, gs.h, lno);
  if (!rc) return;
  const { x: gx, y: gy } = rc;
  let gsTile = gs.grid[gridIdx(gs.w, gx, gy)];
  const dsTile = ds.grid[gridIdx(ds.w, gx, gy)];
  const dx = todraw(ds, gx);
  const dy = todraw(ds, gy);

  const wrong = gs.exits[lno] & LASER_WRONG;
  const omitted = gs.exits[lno] & LASER_OMITTED;
  const exitno = gs.exits[lno] & ~LASER_FLAGMASK;

  const reflect = gsTile & LASER_REFLECT;
  const hit = gsTile & LASER_HIT;
  const laserval = gsTile & ~LASER_FLAGMASK;

  if (lno === ds.flashLaserno) {
    gsTile |= LASER_FLASHED;
  } else if (!(gs.exits[lno] & (LASER_HIT | LASER_REFLECT))) {
    if (exitno === ds.flashLaserno) gsTile |= LASER_FLASHED;
  }
  const flash = (gsTile & LASER_FLASHED) !== 0;

  gsTile |= wrong | omitted;
  if (ui.curVisible && ui.curX === gx && ui.curY === gy) gsTile |= FLAG_CURSOR;

  if (gsTile !== dsTile || force) {
    dr.drawRect(rect(dx, dy, ts, ts), COL_BACKGROUND);
    drawRectOutline(dr, dx, dy, ts, ts, COL_GRID);

    if (gsTile & ~(LASER_WRONG | LASER_OMITTED | FLAG_CURSOR)) {
      const tcol = flash ? COL_FLASHTEXT : omitted ? COL_WRONG : COL_TEXT;
      const str = reflect || hit ? (reflect ? "R" : "H") : String(laserval);

      if (wrong) {
        dr.drawCircle(
          pt(dx + Math.floor(ts / 2), dy + Math.floor(ts / 2)),
          ds.rrad,
          COL_WRONG,
          COL_WRONG,
        );
        dr.drawCircle(
          pt(dx + Math.floor(ts / 2), dy + Math.floor(ts / 2)),
          ds.rrad - Math.floor(ts / 16),
          COL_BACKGROUND,
          COL_WRONG,
        );
      }

      dr.drawText(
        pt(dx + Math.floor(ts / 2), dy + Math.floor(ts / 2)),
        {
          align: "center",
          baseline: "mathematical",
          fontType: "variable",
          size: Math.floor(ts / 2),
        },
        tcol,
        str,
      );
    }
    if (gsTile & FLAG_CURSOR) drawSquareCursor(dr, ds, dx, dy);

    dr.drawUpdate(rect(dx, dy, ts, ts));
  }
  ds.grid[gridIdx(ds.w, gx, gy)] = gsTile;
}

// --- full redraw ------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: BlackboxDrawState | null,
  _prev: BlackboxState | null,
  state: BlackboxState,
  _dir: number,
  ui: BlackboxUi,
  animTime: number,
  flashTime: number,
): void {
  if (!ds) return;
  const ts = ds.tilesize;
  let isflash = false;
  let force = false;

  if (flashTime > 0) {
    const frame = Math.floor(flashTime / FLASH_FRAME);
    isflash = frame % 2 === 0;
  }

  if (!ds.started) {
    const fullW = ts * (state.w + 2) + 2 * Math.floor(ts / 2);
    const fullH = ts * (state.h + 2) + 2 * Math.floor(ts / 2);
    // The engine emits no pixels of its own: fill the background.
    dr.drawRect(rect(0, 0, fullW, fullH), COL_BACKGROUND);

    const x0 = todraw(ds, 0) - 1;
    const y0 = todraw(ds, 0) - 1;
    const x1 = todraw(ds, state.w + 2);
    const y1 = todraw(ds, state.h + 2);

    // Bevelled outline, clockwise from the point behind (1,1).
    dr.drawLine(pt(x0 + ts, y0 + ts), pt(x0 + ts, y0), COL_HIGHLIGHT, 1);
    dr.drawLine(pt(x0 + ts, y0), pt(x1 - ts, y0), COL_HIGHLIGHT, 1);
    dr.drawLine(pt(x1 - ts, y0), pt(x1 - ts, y0 + ts), COL_LOWLIGHT, 1);
    dr.drawLine(pt(x1 - ts, y0 + ts), pt(x1, y0 + ts), COL_HIGHLIGHT, 1);
    dr.drawLine(pt(x1, y0 + ts), pt(x1, y1 - ts), COL_LOWLIGHT, 1);
    dr.drawLine(pt(x1, y1 - ts), pt(x1 - ts, y1 - ts), COL_LOWLIGHT, 1);
    dr.drawLine(pt(x1 - ts, y1 - ts), pt(x1 - ts, y1), COL_LOWLIGHT, 1);
    dr.drawLine(pt(x1 - ts, y1), pt(x0 + ts, y1), COL_LOWLIGHT, 1);
    dr.drawLine(pt(x0 + ts, y1), pt(x0 + ts, y1 - ts), COL_HIGHLIGHT, 1);
    dr.drawLine(pt(x0 + ts, y1 - ts), pt(x0, y1 - ts), COL_LOWLIGHT, 1);
    dr.drawLine(pt(x0, y1 - ts), pt(x0, y0 + ts), COL_HIGHLIGHT, 1);
    dr.drawLine(pt(x0, y0 + ts), pt(x0 + ts, y0 + ts), COL_HIGHLIGHT, 1);

    dr.drawUpdate(rect(0, 0, fullW, fullH));
    force = true;
    ds.started = true;
  }

  if (isflash !== ds.isflash) force = true;

  for (let x = 0; x < state.w; x++)
    for (let y = 0; y < state.h; y++)
      drawArenaTile(dr, state, ds, ui, x, y, force, isflash);

  // Which laser to highlight this frame.
  ds.flashLaserno = LASER_EMPTY;
  if (ui.flashLaser === 1) ds.flashLaserno = ui.flashLaserno;
  else if (ui.flashLaser === 2 && animTime > 0) ds.flashLaserno = ui.flashLaserno;

  for (let i = 0; i < 2 * (state.w + state.h); i++)
    drawLaserTile(dr, state, ds, ui, i, force);

  // The reveal ("finish") button at (0,0).
  const b0 = todraw(ds, 0);
  if (canReveal(state)) {
    const outline =
      ui.curVisible && ui.curX === 0 && ui.curY === 0 ? COL_CURSOR : COL_BALL;
    dr.clip(rect(b0 - 1, b0 - 1, ts + 1, ts + 1));
    dr.drawCircle(
      pt(b0 + ds.crad - 1, b0 + ds.crad - 1),
      ds.crad - 1,
      outline,
      outline,
    );
    dr.drawCircle(
      pt(b0 + ds.crad - 1, b0 + ds.crad - 1),
      ds.crad - 3,
      COL_BUTTON,
      COL_BUTTON,
    );
    dr.unclip();
  } else {
    dr.drawRect(rect(b0 - 1, b0 - 1, ts, ts), COL_BACKGROUND);
  }
  dr.drawUpdate(rect(b0, b0, ts, ts));

  ds.reveal = state.reveal;
  ds.isflash = isflash;
}

// --- timing -----------------------------------------------------------

export function animLength(
  _a: BlackboxState,
  _b: BlackboxState,
  _dir: number,
  ui: BlackboxUi,
): number {
  return ui.flashLaser === 2 ? CUR_ANIM : 0;
}

export function flashLength(
  oldState: BlackboxState,
  newState: BlackboxState,
  _dir: number,
  _ui: BlackboxUi,
): number {
  if (!oldState.reveal && newState.reveal) return 4 * FLASH_FRAME;
  return 0;
}
