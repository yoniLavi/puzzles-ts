/**
 * Bricks rendering — port of `game_redraw` (and `game_compute_size`,
 * `game_set_offsets`, the error-mark helpers) in
 * `puzzles/unreleased/bricks.c`.
 *
 * The hexagon is drawn by shearing the padded parallelogram: each row is
 * offset rightward by half a tile per row, so every geometric difference from
 * a plain grid comes out of that one offset plus the `F_BOUND` mask. Bricks
 * uses upstream's `NARROW_BORDERS` layout: no border, and `computeSize` adds
 * one pixel for the right/bottom edges.
 *
 * Rule-violation marks (three-in-a-row bars, gravity diamonds, over-count red
 * clues) display the validity pass `findMistakes` exposes. As upstream, they
 * show live only while a drag is in flight; a committed board carries none
 * until Check & Save passes the `mistakes` overlay.
 */

import { mkhighlight } from "../../engine/color/color-mkhighlight.ts";
import { BLACK } from "../../engine/color/colors.ts";
import {
  CURSOR,
  ERROR,
  HINT_ACTION,
  HINT_EVIDENCE,
  INK,
} from "../../engine/color/palette.ts";
import { drawRectCorners, drawThickRectOutline, glyphFont } from "../../engine/draw.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import { drawMarkSides, MARK_ALL } from "../../engine/hint-mark.ts";
import type { Color, Size } from "../../engine/types.ts";
import type { BricksHint } from "./index.ts";
import { bricksValidate } from "./solver.ts";
import {
  type BricksMistake,
  type BricksMove,
  type BricksParams,
  type BricksState,
  type BricksUi,
  COL_MASK,
  F_BOUND,
  F_EMPTY,
  F_SHADE,
  FE_CURSOR,
  FE_ERROR,
  FE_LINE_LEFT,
  FE_LINE_RIGHT,
  FE_TOPLEFT,
  FE_TOPRIGHT,
  NUM_MASK,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 48;
const FLASH_FRAME = 0.12;
export const FLASH_TIME = FLASH_FRAME * 5;

// --- palette (upstream COL_* enum, index-for-index) -------------------------

export const COL_MIDLIGHT = 0;
export const COL_LOWLIGHT = 1;
export const COL_HIGHLIGHT = 2;
export const COL_BORDER = 3;
export const COL_SHADE = 4;
export const COL_ERROR = 5;
export const COL_CURSOR = 6;
// Fork additions (beyond upstream's COL_* enum): the explained hint.
export const COL_HINT = 7; // the forced cell — ringed on its own border
export const COL_HINT_CELL = 8; // the deduction's evidence — an inset ring

export function colors(defaultBackground: Color): Color[] {
  const { background, highlight, lowlight } = mkhighlight(defaultBackground);
  const out: Color[] = [];
  out[COL_MIDLIGHT] = background;
  out[COL_LOWLIGHT] = lowlight;
  out[COL_HIGHLIGHT] = highlight;
  out[COL_BORDER] = INK;
  out[COL_SHADE] = BLACK;
  out[COL_ERROR] = ERROR;
  out[COL_CURSOR] = CURSOR;
  out[COL_HINT] = HINT_ACTION;
  out[COL_HINT_CELL] = HINT_EVIDENCE;
  return out;
}

// --- geometry (NARROW_BORDERS: BORDER = 0) ----------------------------------

/** Even tile size (upstream `tilesize &= ~1`) so the `ts/2` shear is exact. */
const evenTs = (ts: number): number => ts & ~1;

export function computeSize(p: BricksParams, ts0: number): Size {
  const ts = evenTs(ts0);
  return { w: p.w * ts + (ts >> 1) + 1, h: p.h * ts + 1 };
}

/** The per-frame origin (upstream `game_set_offsets`): shift left past the
 * ⌈h/2⌉ − 1 padding columns (`gridSize`) so the sheared rows center in the
 * canvas. Shared with `interpretMove` so pointer mapping and drawing agree. */
export function offsets(h: number, ts: number): { ox: number; oy: number } {
  return { ox: (1 - Math.ceil(h / 2)) * ts, oy: 0 };
}

// --- draw state -------------------------------------------------------------

export interface BricksDrawState {
  started: boolean;
  tilesize: number;
  /** Last drawn packed cell value per padded index (`-1` = never drawn). */
  cache: Int32Array;
}

export function newDrawState(state: BricksState): BricksDrawState {
  return {
    started: false,
    tilesize: 0,
    cache: new Int32Array(state.w * state.h).fill(-1),
  };
}

export function setTileSize(ds: BricksDrawState, ts: number): void {
  ds.tilesize = evenTs(ts);
}

// --- error-mark helpers (upstream bricks_draw_err_*) ------------------------

function drawErrRectangle(
  dr: GameDrawing,
  x: number,
  y: number,
  w: number,
  h: number,
  ts: number,
): void {
  const thick = (ts / 10) | 0;
  const margin = (ts / 20) | 0;
  drawThickRectOutline(
    dr,
    x + margin,
    y + margin,
    w - 2 * margin,
    h - 2 * margin,
    thick,
    COL_ERROR,
  );
}

/** A diamond with an exclamation mark (upstream `bricks_draw_err_gravity`,
 * itself copied from tents.c). */
function drawErrGravity(dr: GameDrawing, ts: number, x: number, y: number): void {
  const e = ((ts * 2) / 5) | 0;
  dr.drawPolygon(
    [
      { x: x - e, y },
      { x, y: y - e },
      { x: x + e, y },
      { x, y: y + e },
    ],
    COL_ERROR,
    COL_BORDER,
  );
  const xext = (ts / 16) | 0;
  const yext = e - (xext * 2 + 2);
  dr.drawRect(
    { x: x - xext, y: y - yext, w: xext * 2 + 1, h: yext * 2 + 1 - xext * 3 },
    COL_HIGHLIGHT,
  );
  dr.drawRect(
    { x: x - xext, y: y + yext - xext * 2 + 1, w: xext * 2 + 1, h: xext * 2 },
    COL_HIGHLIGHT,
  );
}

// Hint-overlay bits packed into the render cache word, above the cell's own
// bits (num/bound/color + FE_* error/cursor flags all fit under 0x1000).
const HINT_TARGET = 1 << 12; // the forced cell — painted COL_HINT
const HINT_EVID = 1 << 13; // a deduction-evidence cell — inset COL_HINT_CELL ring

// --- one tile ---------------------------------------------------------------

function drawTile(
  dr: GameDrawing,
  ts: number,
  tx: number,
  ty: number,
  n: number,
): void {
  // The forced cell keeps its own color and is **ringed** below: in a game
  // whose move is "shade this cell or rule it out", a solid fill would say with
  // the board what the narration is still proposing. (`redraw` never passes a
  // bound cell.)
  const color = n & COL_MASK;
  const fill =
    color === F_SHADE ? COL_SHADE : color === F_EMPTY ? COL_MIDLIGHT : COL_HIGHLIGHT;
  dr.drawRect({ x: tx + 1, y: ty + 1, w: ts - 1, h: ts - 1 }, fill);

  // Square border.
  dr.drawPolygon(
    [
      { x: tx, y: ty },
      { x: tx + ts, y: ty },
      { x: tx + ts, y: ty + ts },
      { x: tx, y: ty + ts },
    ],
    -1,
    COL_BORDER,
  );

  // Three-in-a-row bar (extends toward the shaded neighbor(s)).
  if (n & (FE_LINE_LEFT | FE_LINE_RIGHT)) {
    let left = tx + 1;
    let right = tx + ts - 1;
    if (n & FE_LINE_LEFT) right += ts >> 1;
    if (n & FE_LINE_RIGHT) left -= ts >> 1;
    drawErrRectangle(dr, left, ty + 1, right - left, ts - 1, ts);
  }

  const cx = tx + (ts >> 1);
  const cy = ty + (ts >> 1);

  // Clue number, or (on a colored/error cell) the gravity diamond.
  if (!color) {
    const num = n & NUM_MASK;
    dr.drawText(
      { x: cx, y: cy },
      glyphFont(ts >> 1),
      n & FE_ERROR ? COL_ERROR : COL_BORDER,
      num === 7 ? "?" : String(num),
    );
  } else if (n & FE_ERROR) {
    drawErrGravity(dr, ts, cx, ty + ts);
  }

  if (n & FE_TOPLEFT) drawErrGravity(dr, ts, tx, ty);
  if (n & FE_TOPRIGHT) drawErrGravity(dr, ts, tx + ts, ty);

  if (n & FE_CURSOR) drawRectCorners(dr, cx, cy, (ts / 3) | 0, COL_CURSOR);

  // Evidence ring: an inset COL_HINT_CELL outline that leaves the cell's own
  // content (shade / clue) visible beneath it.
  if (n & HINT_EVID) {
    const m = (ts / 12) | 0;
    const t = Math.max(2, m);
    drawThickRectOutline(dr, tx + m, ty + m, ts - 2 * m, ts - 2 * m, t, COL_HINT_CELL);
  }

  // The acted-on cell's ring, on the square's own border — where the evidence
  // ring is *inset*, so a cell that is both keeps both marks legible.
  if (n & HINT_TARGET) {
    drawMarkSides(
      dr,
      {
        box: { x: tx, y: ty, w: ts + 1, h: ts + 1 },
        outer: 0,
        inner: Math.max(2, (ts / 12) | 0),
      },
      MARK_ALL,
      COL_HINT,
    );
  }

  dr.drawUpdate({ x: tx, y: ty, w: ts + 1, h: ts + 1 });
}

// --- redraw -----------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: BricksDrawState,
  _prev: BricksState | null,
  state: BricksState,
  _dir: number,
  ui: BricksUi,
  _animTime: number,
  flashTime: number,
  hint?: HintStep<BricksMove, BricksHint>,
  mistakes?: readonly BricksMistake[],
): void {
  const ts = ds.tilesize;
  const { w, h, grid } = state;
  const s = w * h;
  const { ox, oy } = offsets(h, ts);

  const hl = hint?.highlights;
  const hintTarget = hl?.target ?? -1;
  const hintEvid = hl ? new Set(hl.evidence) : null;

  if (!ds.started) {
    const { w: fullW, h: fullH } = computeSize({ w: state.pw, h, diff: 0 }, ts);
    dr.drawRect({ x: 0, y: 0, w: fullW, h: fullH }, COL_MIDLIGHT);
    dr.drawUpdate({ x: 0, y: 0, w: fullW, h: fullH });
    ds.started = true;
  }

  const flash = flashTime > 0 && ((flashTime / FLASH_FRAME) | 0) & 1;

  // Apply the in-flight drag preview to a working grid.
  const hasDrag = ui.drag.length > 0 && ui.dragType !== 0;
  const shown = hasDrag ? grid.slice() : grid;
  if (hasDrag) {
    for (const i of ui.drag) {
      if (shown[i] & COL_MASK) shown[i] = ui.dragType;
    }
  }

  // Error flags to display: from the drag preview (live), or the Check & Save
  // overlay — never on a plain committed frame (upstream), and never mid-flash.
  let errorFlags: Uint16Array | null = null;
  if (!flash) {
    if (hasDrag) {
      errorFlags = new Uint16Array(s);
      bricksValidate(shown, w, h, false, errorFlags);
    } else if (mistakes && mistakes.length > 0) {
      errorFlags = new Uint16Array(s);
      for (const m of mistakes) errorFlags[m.index] |= m.flags;
    }
  }

  for (let i = 0; i < s; i++) {
    if (shown[i] & F_BOUND) continue;

    const x = i % w;
    const y = (i / w) | 0;
    let n = shown[i];
    if (flash && (n & COL_MASK) === F_SHADE) n = F_EMPTY;
    if (errorFlags) n |= errorFlags[i];
    if (ui.cursor.visible && ui.cursor.x === x && ui.cursor.y === y) n |= FE_CURSOR;
    if (i === hintTarget) n |= HINT_TARGET;
    else if (hintEvid?.has(i)) n |= HINT_EVID;

    if (ds.cache[i] === n) continue;
    ds.cache[i] = n;

    const tx = x * ts + ox + y * (ts >> 1);
    const ty = y * ts + oy;
    drawTile(dr, ts, tx, ty, n);
  }
}
