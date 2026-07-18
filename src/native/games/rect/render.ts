/**
 * Rectangles rendering — a faithful port of `game_redraw` / `draw_tile` from
 * `rect.c`, using the `NARROW_BORDERS` geometry the web build compiles
 * (`BORDER = 1`).
 *
 * The per-cell cache word packs exactly upstream's `visible[]` — the four edge
 * values (0/1/2/3) and four corner values (2 bits each) around the cell, plus
 * the `CORRECT` and `CURSOR` bits — into an `Int32Array` (playbook §3.2). Four
 * extra bits carry the `findMistakes` wrong-edge overlay so it repaints and
 * clears through the same cache. The drag preview is drawn into a scratch copy
 * of the edges before the corner pass, so it too lives entirely in the word.
 *
 * Palette is index-for-index with the C colour enum, plus an appended
 * `COL_MISTAKE`.
 */

import type { Colour, Rect, Size } from "../../../puzzle/types.ts";
import type { GameDrawing } from "../../engine/game.ts";
import { gridDrawRect } from "./moves.ts";
import type {
  RectDrawState,
  RectMistake,
  RectParams,
  RectState,
  RectUi,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 24;
export const BORDER = 1;
export const FLASH_TIME = 0.13;

// --- palette (mirrors the rect.c colour enum index-for-index) --------------
export const COL_BACKGROUND = 0;
export const COL_CORRECT = 1;
export const COL_LINE = 2;
export const COL_TEXT = 3;
export const COL_GRID = 4;
export const COL_DRAG = 5;
export const COL_DRAGERASE = 6;
export const COL_CURSOR = 7;
export const COL_MISTAKE = 8; // appended past the C enum (design D4)

export function colours(defaultBackground: Colour): Colour[] {
  const bg = defaultBackground;
  const out: Colour[] = [];
  out[COL_BACKGROUND] = bg;
  out[COL_GRID] = [0.5 * bg[0], 0.5 * bg[1], 0.5 * bg[2]];
  out[COL_DRAG] = [1, 0, 0];
  out[COL_DRAGERASE] = [0.2, 0.2, 1];
  out[COL_CORRECT] = [0.75 * bg[0], 0.75 * bg[1], 0.75 * bg[2]];
  out[COL_LINE] = [0, 0, 0];
  out[COL_TEXT] = [0, 0, 0];
  out[COL_CURSOR] = [1, 0.5, 0.5];
  out[COL_MISTAKE] = [1, 0, 0];
  return out;
}

// --- cache-word bits -------------------------------------------------------
const CORRECT = 1 << 16;
const CURSOR = 1 << 17;
const M_TOP = 1 << 18;
const M_BOTTOM = 1 << 19;
const M_LEFT = 1 << 20;
const M_RIGHT = 1 << 21;

const coord = (n: number, tile: number) => n * tile + BORDER;
const colourOf = (k: number) =>
  k === 1 ? COL_LINE : k === 2 ? COL_DRAG : COL_DRAGERASE;

const hrange = (w: number, h: number, x: number, y: number) =>
  x >= 0 && x < w && y >= 1 && y < h;
const vrange = (w: number, h: number, x: number, y: number) =>
  x >= 1 && x < w && y >= 0 && y < h;

export function computeSize(p: RectParams, tileSize: number): Size {
  return { w: p.w * tileSize + 2 * BORDER + 1, h: p.h * tileSize + 2 * BORDER + 1 };
}

export function newDrawState(state: RectState): RectDrawState {
  return {
    started: false,
    tileSize: 0,
    w: state.w,
    h: state.h,
    visible: new Int32Array(state.w * state.h).fill(-1),
  };
}

function drawTile(
  dr: GameDrawing,
  tile: number,
  state: RectState,
  x: number,
  y: number,
  hedge: Uint8Array,
  vedge: Uint8Array,
  corners: Uint8Array,
  bgflags: number,
  mistake: number,
): void {
  const { w, h } = state;
  const cx = coord(x, tile);
  const cy = coord(y, tile);
  const rect = (rx: number, ry: number, rw: number, rh: number, c: number) =>
    dr.drawRect({ x: rx, y: ry, w: rw, h: rh } satisfies Rect, c);

  rect(cx, cy, tile + 1, tile + 1, COL_GRID);
  rect(
    cx + 1,
    cy + 1,
    tile - 1,
    tile - 1,
    bgflags & CURSOR ? COL_CURSOR : bgflags & CORRECT ? COL_CORRECT : COL_BACKGROUND,
  );

  const num = state.grid[y * w + x];
  if (num) {
    dr.drawText(
      { x: cx + Math.floor(tile / 2), y: cy + Math.floor(tile / 2) },
      {
        align: "center",
        baseline: "mathematical",
        fontType: "variable",
        size: Math.floor(tile / 2),
      },
      COL_TEXT,
      String(num),
    );
  }

  // Edges. A boundary edge (outside the grid) is always a solid black line.
  if (!hrange(w, h, x, y) || hedge[y * w + x])
    rect(
      cx,
      cy,
      tile + 1,
      2,
      mistake & M_TOP
        ? COL_MISTAKE
        : hrange(w, h, x, y)
          ? colourOf(hedge[y * w + x])
          : COL_LINE,
    );
  if (!hrange(w, h, x, y + 1) || hedge[(y + 1) * w + x])
    rect(
      cx,
      cy + tile - 1,
      tile + 1,
      2,
      mistake & M_BOTTOM
        ? COL_MISTAKE
        : hrange(w, h, x, y + 1)
          ? colourOf(hedge[(y + 1) * w + x])
          : COL_LINE,
    );
  if (!vrange(w, h, x, y) || vedge[y * w + x])
    rect(
      cx,
      cy,
      2,
      tile + 1,
      mistake & M_LEFT
        ? COL_MISTAKE
        : vrange(w, h, x, y)
          ? colourOf(vedge[y * w + x])
          : COL_LINE,
    );
  if (!vrange(w, h, x + 1, y) || vedge[y * w + (x + 1)])
    rect(
      cx + tile - 1,
      cy,
      2,
      tile + 1,
      mistake & M_RIGHT
        ? COL_MISTAKE
        : vrange(w, h, x + 1, y)
          ? colourOf(vedge[y * w + (x + 1)])
          : COL_LINE,
    );

  // Corners.
  if (corners[y * w + x]) rect(cx, cy, 2, 2, colourOf(corners[y * w + x]));
  if (x + 1 < w && corners[y * w + (x + 1)])
    rect(cx + tile - 1, cy, 2, 2, colourOf(corners[y * w + (x + 1)]));
  if (y + 1 < h && corners[(y + 1) * w + x])
    rect(cx, cy + tile - 1, 2, 2, colourOf(corners[(y + 1) * w + x]));
  if (x + 1 < w && y + 1 < h && corners[(y + 1) * w + (x + 1)])
    rect(cx + tile - 1, cy + tile - 1, 2, 2, colourOf(corners[(y + 1) * w + (x + 1)]));

  dr.drawUpdate({ x: cx, y: cy, w: tile + 1, h: tile + 1 } satisfies Rect);
}

export function redraw(
  dr: GameDrawing,
  ds: RectDrawState | null,
  _prev: RectState | null,
  state: RectState,
  _dir: number,
  ui: RectUi,
  _animTime: number,
  flashTime: number,
  _hint?: unknown,
  mistakes?: readonly RectMistake[],
): void {
  if (!ds) return;
  const { w, h } = state;
  const tile = ds.tileSize;

  // Apply the in-progress drag preview to scratch edge copies.
  let hedge = state.hedge;
  let vedge = state.vedge;
  if (ui.dragged && ui.x1 >= 0 && ui.y1 >= 0 && ui.x2 >= 0 && ui.y2 >= 0) {
    hedge = state.hedge.slice();
    vedge = state.vedge.slice();
    gridDrawRect(
      w,
      h,
      hedge,
      vedge,
      ui.erasing ? 3 : 2,
      true,
      true,
      ui.x1,
      ui.y1,
      ui.x2,
      ui.y2,
    );
  }

  // Corners: a corner pixel lights to the max value of the edges meeting it.
  const corners = new Uint8Array(w * h);
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++) {
      if (x > 0) {
        const e = vedge[y * w + x];
        if (corners[y * w + x] < e) corners[y * w + x] = e;
        if (y + 1 < h && corners[(y + 1) * w + x] < e) corners[(y + 1) * w + x] = e;
      }
      if (y > 0) {
        const e = hedge[y * w + x];
        if (corners[y * w + x] < e) corners[y * w + x] = e;
        if (x + 1 < w && corners[y * w + (x + 1)] < e) corners[y * w + (x + 1)] = e;
      }
    }

  // Wrong-edge overlay from findMistakes.
  const wrongH = new Uint8Array(w * h);
  const wrongV = new Uint8Array(w * h);
  if (mistakes) {
    for (const m of mistakes) {
      if (m.edge === "h") wrongH[m.y * w + m.x] = 1;
      else wrongV[m.y * w + m.x] = 1;
    }
  }

  if (!ds.started) {
    dr.drawRect(
      {
        x: coord(0, tile) - 1,
        y: coord(0, tile) - 1,
        w: w * tile + 3,
        h: h * tile + 3,
      },
      COL_LINE,
    );
    ds.started = true;
    dr.drawUpdate({
      x: 0,
      y: 0,
      w: w * tile + 2 * BORDER + 1,
      h: h * tile + 2 * BORDER + 1,
    });
    ds.visible.fill(-1);
  }

  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++) {
      let c = 0;
      if (hrange(w, h, x, y)) c |= hedge[y * w + x];
      if (hrange(w, h, x, y + 1)) c |= hedge[(y + 1) * w + x] << 2;
      if (vrange(w, h, x, y)) c |= vedge[y * w + x] << 4;
      if (vrange(w, h, x + 1, y)) c |= vedge[y * w + (x + 1)] << 6;
      c |= corners[y * w + x] << 8;
      if (x + 1 < w) c |= corners[y * w + (x + 1)] << 10;
      if (y + 1 < h) c |= corners[(y + 1) * w + x] << 12;
      if (x + 1 < w && y + 1 < h) c |= corners[(y + 1) * w + (x + 1)] << 14;
      if (state.correct[y * w + x] && !flashTime) c |= CORRECT;
      if (ui.cursorVisible && ui.cursorX === x && ui.cursorY === y) c |= CURSOR;

      let mistake = 0;
      if (wrongH[y * w + x]) mistake |= M_TOP;
      if (y + 1 < h && wrongH[(y + 1) * w + x]) mistake |= M_BOTTOM;
      if (wrongV[y * w + x]) mistake |= M_LEFT;
      if (x + 1 < w && wrongV[y * w + (x + 1)]) mistake |= M_RIGHT;
      c |= mistake;

      if (ds.visible[y * w + x] !== c) {
        drawTile(dr, tile, state, x, y, hedge, vedge, corners, c, mistake);
        ds.visible[y * w + x] = c;
      }
    }
}
