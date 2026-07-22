/**
 * Bricks rendering — port of `game_redraw` (and `game_compute_size`,
 * `game_set_offsets`, the error-mark helpers) in
 * `puzzles/unreleased/bricks.c`.
 *
 * The hexagon is drawn by shearing the padded parallelogram: each row is
 * offset rightward by `tilesize / 2` (`tx += (i/w) * ts/2`), so every
 * geometric difference from a plain grid comes out of that one offset plus
 * the `F_BOUND` mask (which cells are skipped). Bricks is compiled with
 * `NARROW_BORDERS` (webapp.cmake), so `BORDER = 0` and `computeSize` adds one
 * pixel for the right/bottom edges.
 *
 * Rule-violation marks (three-in-a-row bars, gravity diamonds, over-count red
 * clues) are display of the same validity pass `findMistakes` exposes (design
 * D7). Upstream shows them **live only while a drag is in flight**; a
 * committed board carries none until Check & Save asks. So this renderer draws
 * error marks from either the in-flight drag preview *or* the `mistakes`
 * overlay the midend passes after a Check & Save — never on a plain committed
 * frame, matching upstream.
 */
import type { Colour, Size } from "../../../puzzle/types.ts";
import { mkhighlight } from "../../engine/colour-mkhighlight.ts";
import type { GameDrawing } from "../../engine/game.ts";
import { bricksValidate } from "./solver.ts";
import {
  type BricksMistake,
  type BricksParams,
  type BricksState,
  type BricksUi,
  COL_MASK,
  F_BOUND,
  F_EMPTY,
  F_SHADE,
  F_UNSHADE,
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

export function colours(defaultBackground: Colour): Colour[] {
  const { background, highlight, lowlight } = mkhighlight(defaultBackground);
  const out: Colour[] = [];
  out[COL_MIDLIGHT] = background;
  out[COL_LOWLIGHT] = lowlight;
  out[COL_HIGHLIGHT] = highlight;
  out[COL_BORDER] = [0, 0, 0];
  out[COL_SHADE] = [0.1, 0.1, 0.1];
  out[COL_ERROR] = [1, 0, 0];
  out[COL_CURSOR] = [0, 0.7, 0];
  return out;
}

// --- geometry (NARROW_BORDERS: BORDER = 0) ----------------------------------

/** Even tile size (upstream `tilesize &= ~1`) so the `ts/2` shear is exact. */
const evenTs = (ts: number): number => ts & ~1;

export function computeSize(p: BricksParams, ts0: number): Size {
  const ts = evenTs(ts0);
  // *x = w*ts + ts/2 + 1 ; *y = h*ts + 1 (2*BORDER = 0, +1 for the edges).
  return { w: p.w * ts + (ts >> 1) + 1, h: p.h * ts + 1 };
}

/** The per-frame origin (upstream `game_set_offsets`): shift left so the
 * sheared rows centre in the canvas. Shared with `interpretMove` so pointer
 * mapping and drawing agree. */
export function offsets(h: number, ts: number): { ox: number; oy: number } {
  let ox = -(((h / 2) | 0) - 1) * ts;
  if (h & 1) ox -= ts;
  return { ox, oy: 0 };
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
  dr.drawRect({ x: x + margin, y: y + margin, w: w - 2 * margin, h: thick }, COL_ERROR);
  dr.drawRect({ x: x + margin, y: y + margin, w: thick, h: h - 2 * margin }, COL_ERROR);
  dr.drawRect(
    { x: x + margin, y: y + h - margin - thick, w: w - 2 * margin, h: thick },
    COL_ERROR,
  );
  dr.drawRect(
    { x: x + w - margin - thick, y: y + margin, w: thick, h: h - 2 * margin },
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

function drawRectCorners(
  dr: GameDrawing,
  cx: number,
  cy: number,
  r: number,
  col: number,
): void {
  const seg = (x1: number, y1: number, x2: number, y2: number) =>
    dr.drawLine({ x: x1, y: y1 }, { x: x2, y: y2 }, col, 1);
  seg(cx - r, cy - r, cx - r, cy - (r >> 1));
  seg(cx - r, cy - r, cx - (r >> 1), cy - r);
  seg(cx - r, cy + r, cx - r, cy + (r >> 1));
  seg(cx - r, cy + r, cx - (r >> 1), cy + r);
  seg(cx + r, cy - r, cx + r, cy - (r >> 1));
  seg(cx + r, cy - r, cx + (r >> 1), cy - r);
  seg(cx + r, cy + r, cx + r, cy + (r >> 1));
  seg(cx + r, cy + r, cx + (r >> 1), cy + r);
}

// --- one tile ---------------------------------------------------------------

function drawTile(
  dr: GameDrawing,
  ts: number,
  tx: number,
  ty: number,
  n: number,
): void {
  const col =
    n & F_BOUND
      ? COL_MIDLIGHT
      : (n & COL_MASK) === F_SHADE
        ? COL_SHADE
        : (n & COL_MASK) === F_UNSHADE || !(n & COL_MASK)
          ? COL_HIGHLIGHT
          : COL_MIDLIGHT;

  dr.drawRect({ x: tx + 1, y: ty + 1, w: ts - 1, h: ts - 1 }, col);

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

  // Three-in-a-row bar (extends toward the shaded neighbour(s)).
  if (n & (FE_LINE_LEFT | FE_LINE_RIGHT)) {
    let left = tx + 1;
    let right = tx + ts - 1;
    if (n & FE_LINE_LEFT) right += ts >> 1;
    if (n & FE_LINE_RIGHT) left -= ts >> 1;
    drawErrRectangle(dr, left, ty + 1, right - left, ts - 1, ts);
  }

  const cx = tx + (ts >> 1);
  const cy = ty + (ts >> 1);

  // Clue number, or (on a coloured/error cell) the gravity diamond.
  if (!(n & (COL_MASK | F_BOUND))) {
    const num = n & NUM_MASK;
    dr.drawText(
      { x: cx, y: cy },
      {
        align: "center",
        baseline: "mathematical",
        fontType: "variable",
        size: ts >> 1,
      },
      n & FE_ERROR ? COL_ERROR : COL_BORDER,
      num === 7 ? "?" : String(num),
    );
  } else if (n & FE_ERROR) {
    drawErrGravity(dr, ts, cx, ty + ts);
  }

  if (n & FE_TOPLEFT) drawErrGravity(dr, ts, tx, ty);
  if (n & FE_TOPRIGHT) drawErrGravity(dr, ts, tx + ts, ty);

  if (n & FE_CURSOR) drawRectCorners(dr, cx, cy, (ts / 3) | 0, COL_CURSOR);

  dr.drawUpdate({ x: tx, y: ty, w: ts + 1, h: ts + 1 });
}

// --- redraw -----------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: BricksDrawState | null,
  _prev: BricksState | null,
  state: BricksState,
  _dir: number,
  ui: BricksUi,
  _animTime: number,
  flashTime: number,
  _hint?: unknown,
  mistakes?: readonly BricksMistake[],
): void {
  if (!ds) return;
  const ts = ds.tilesize;
  const { w, h, grid } = state;
  const s = w * h;
  const { ox, oy } = offsets(h, ts);

  if (!ds.started) {
    const { w: fullW, h: fullH } = computeSize({ w: state.pw, h, diff: 0 }, ts);
    dr.drawRect({ x: 0, y: 0, w: fullW, h: fullH }, COL_MIDLIGHT);
    dr.drawUpdate({ x: 0, y: 0, w: fullW, h: fullH });
    ds.started = true;
  }

  const flash = flashTime > 0 && ((flashTime / FLASH_FRAME) | 0) & 1;

  // Apply the in-flight drag preview to a working grid.
  const hasDrag = ui.drag.length > 0 && ui.dragtype !== 0;
  const shown = hasDrag ? grid.slice() : grid;
  if (hasDrag) {
    for (const i of ui.drag) {
      if (shown[i] & COL_MASK) shown[i] = ui.dragtype;
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
    if (ui.cshow && ui.cx === x && ui.cy === y) n |= FE_CURSOR;

    if (ds.cache[i] === n) continue;
    ds.cache[i] = n;

    const tx = x * ts + ox + y * (ts >> 1);
    const ty = y * ts + oy;
    drawTile(dr, ts, tx, ty, n);
  }
}
