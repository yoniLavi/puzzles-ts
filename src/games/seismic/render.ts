/**
 * Seismic rendering — port of `game_redraw` from `seismic.c`.
 *
 * The board is one black rectangle with each cell painted back over it, inset by
 * a pixel on any side that is a *region* boundary — so the region walls are the
 * black left showing through, and there is no wall-drawing code at all. The four
 * corner pixels each cell may owe (where its diagonal neighbor is in another
 * region) are painted after the cell, because the cell's own fill can cover
 * them.
 *
 * That geometry depends only on the region partition, which never changes for
 * the life of a game — so the per-tile cache (`Int32Array`, docs/games/rendering.md § "The tile cache and the diff key") keys
 * on the cell's *contents* alone: its digit, pencil marks, error flags and the
 * background color the cursor/flash chose. The Check-&-Save mistake overlay
 * rides in an `OverlaySidecar` so it repaints a cell whose contents are
 * otherwise unchanged.
 *
 * **Two deliberate divergences, both display-only** (byte-parity was never in
 * scope for drawing — docs/games/solver-and-generator.md § "Divergence and what it costs"):
 *  - upstream stores the 9-bit pencil bitmask in a `char` before drawing it, so
 *    a penciled **9** is truncated away and never appears. Fixed here (§3.2's
 *    "a display-only value with the wrong type is a bug you may just fix");
 *  - upstream repaints every cell every frame (its own "optimize drawing
 *    routines" TODO) and its `game_drawstate` is a literal `int FIXME`. This
 *    port caches per tile, like every other port.
 *
 * The canvas also gains a half-tile strip below the board for the pencil-mode
 * indicator (docs/games/mechanics.md § "Pencil marks: the full note-taking UX"): the web build compiles `NARROW_BORDERS`, so the
 * black board rectangle covers the canvas edge to edge and there is nowhere else
 * to put it. The grid's own geometry is untouched.
 */

import { mkhighlight } from "../../engine/color/color-mkhighlight.ts";
import {
  ERROR,
  INK,
  PENCIL_BODY,
  pencilColor,
  playerEntryColor,
} from "../../engine/color/palette.ts";
import type { GameDrawing } from "../../engine/game.ts";
import { OverlaySidecar } from "../../engine/overlay-sidecar.ts";
import { drawPencilGlyph } from "../../engine/pencil-indicator.ts";
import type { Color, Size } from "../../engine/types.ts";
import {
  FM_ERRORMASK,
  FM_FIXED,
  type SeismicParams,
  type SeismicState,
  type SeismicUi,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 40;
export const FLASH_TIME = 0.7;
const FLASH_FRAME = 0.1;

/** Width of a region wall, in pixels. */
const GRIDEXTRA = 1;
/** The `NARROW_BORDERS` arm — the web build defines it, so the grid's outer
 * outline is drawn *inside* the border area rather than a half-tile margin
 * (docs/games/rendering.md § "Sizing": check the define, don't port the desktop default). */
export const BORDER = GRIDEXTRA * 2;

// --- palette (index-for-index with the upstream COL_* enum) ----------------

export const COL_BACKGROUND = 0;
export const COL_HIGHLIGHT = 1;
export const COL_LOWLIGHT = 2;
export const COL_BORDER = 3;
export const COL_NUM_FIXED = 4;
export const COL_NUM_GUESS = 5;
export const COL_NUM_ERROR = 6;
export const COL_NUM_PENCIL = 7;
/** Present so the palette indices match upstream's enum; upstream's on-screen
 * renderer never reads it (a distance error is drawn in `COL_NUM_ERROR`, which
 * is the same red). */
export const COL_ERRORDIST = 8;
/** Fork addition, appended past the upstream enum (Seismic declares no dark-mode
 * `paletteOverrides`, so appending is safe): the pencil indicator's body. */
export const COL_PENCIL_BODY = 9;

export function colors(defaultBackground: Color): Color[] {
  const { background, highlight, lowlight } = mkhighlight(defaultBackground);
  const out: Color[] = [];
  out[COL_BACKGROUND] = background;
  out[COL_HIGHLIGHT] = highlight;
  out[COL_LOWLIGHT] = lowlight;
  out[COL_BORDER] = INK;
  out[COL_NUM_FIXED] = INK;
  out[COL_NUM_GUESS] = playerEntryColor(background);
  out[COL_NUM_ERROR] = ERROR;
  out[COL_NUM_PENCIL] = pencilColor(background);
  out[COL_ERRORDIST] = ERROR;
  out[COL_PENCIL_BODY] = PENCIL_BODY;
  return out;
}

// --- geometry --------------------------------------------------------------

/** Height of the fork pencil-mode indicator strip below the board. */
const indicatorSize = (ts: number): number => (ts / 2) | 0;

/** The board's own size, without the indicator strip — upstream's
 * `game_compute_size`, `NARROW_BORDERS` arm (which subtracts the outline it
 * drew inside the border). */
function boardSize(p: SeismicParams, ts: number): Size {
  return {
    w: p.w * ts + 2 * BORDER - GRIDEXTRA * 2,
    h: p.h * ts + 2 * BORDER - GRIDEXTRA * 2,
  };
}

export function computeSize(p: SeismicParams, ts: number): Size {
  const board = boardSize(p, ts);
  return { w: board.w, h: board.h + indicatorSize(ts) };
}

/** Upstream `FROMCOORD` — C integer division, which **truncates** toward zero,
 * so a pointer inside the two-pixel border maps to row/column 0 rather than −1
 * (docs/games/input.md § "The accreting-paint drag"; Sticks and Mathrax needed the same). */
export function fromCoord(v: number, ts: number): number {
  return Math.trunc((v - BORDER) / ts);
}

// --- draw state ------------------------------------------------------------

export interface SeismicDrawState {
  started: boolean;
  tilesize: number;
  w: number;
  h: number;
  /** Per-tile last-drawn contents (−1 = never drawn): the digit in bits 0–3, the
   * pencil bitmask in bits 4–12, the cell flags in 13–15, the chosen background
   * color in 16–17 and the pencil-cursor marker in bit 18. */
  tiles: Int32Array;
  /** The Check-&-Save mistake overlay. */
  wrong: OverlaySidecar;
  /** Whether the pencil-mode indicator was on last frame. */
  pencilModeShown: boolean;
}

export function newDrawState(state: SeismicState): SeismicDrawState {
  const { w, h } = state;
  return {
    started: false,
    tilesize: 0,
    w,
    h,
    tiles: new Int32Array(w * h).fill(-1),
    wrong: new OverlaySidecar(w * h),
    pencilModeShown: false,
  };
}

export function setTileSize(ds: SeismicDrawState, ts: number): void {
  ds.tilesize = ts;
}

// --- tile drawing ----------------------------------------------------------

/** The inset a cell's fill takes on each side that borders another region — the
 * gap that leaves the black backing showing as a wall. */
function cellRect(state: SeismicState, x: number, y: number, ts: number) {
  const { w, h, dsf } = state;
  const i = y * w + x;
  let cx = BORDER + x * ts;
  let cy = BORDER + y * ts;
  let cw = ts - 1;
  let ch = ts - 1;

  if (x === 0 || !dsf.equivalent(i, i - 1)) {
    cx += GRIDEXTRA;
    cw -= GRIDEXTRA;
  }
  if (x === w - 1 || !dsf.equivalent(i, i + 1)) cw -= GRIDEXTRA * 2;
  if (y === 0 || !dsf.equivalent(i, i - w)) {
    cy += GRIDEXTRA;
    ch -= GRIDEXTRA;
  }
  if (y === h - 1 || !dsf.equivalent(i, i + w)) ch -= GRIDEXTRA * 2;

  return { cx, cy, cw, ch };
}

/** The auto-sized pencil-mark grid — upstream's layout arithmetic verbatim,
 * integer division throughout. Bit `n − 1` is candidate `n`. */
function drawPencilMarks(
  dr: GameDrawing,
  ts: number,
  cx: number,
  cy: number,
  marks: number,
): void {
  let nhints = 0;
  for (let n = 0; n < 9; n++) if (marks & (1 << n)) nhints++;
  if (!nhints) return;

  let hw = 1;
  while (hw * hw < nhints) hw++;
  if (hw < 3) hw = 3;
  let hh = ((nhints + hw - 1) / hw) | 0;
  if (hh < 2) hh = 2;
  const hmax = Math.max(hw, hh);
  const fontsz = (ts / (((hmax * (11 - hmax)) / 8) | 0)) | 0;

  let j = 0;
  for (let n = 0; n < 9; n++) {
    if (!(marks & (1 << n))) continue;
    const hx = j % hw;
    const hy = (j / hw) | 0;
    dr.drawText(
      {
        x: cx + ((((4 * hx + 3) * ts) / (4 * hw + 2)) | 0),
        y: cy + ((((4 * hy + 3) * ts) / (4 * hh + 2)) | 0),
      },
      { align: "center", baseline: "mathematical", fontType: "variable", size: fontsz },
      COL_NUM_PENCIL,
      String(n + 1),
    );
    j++;
  }
}

function drawTile(
  dr: GameDrawing,
  ds: SeismicDrawState,
  state: SeismicState,
  x: number,
  y: number,
  color: number,
  pencilCursor: boolean,
  wrong: boolean,
): void {
  const ts = ds.tilesize;
  const { w, h, dsf, grid, pencil, flags } = state;
  const i = y * w + x;
  const tx = BORDER + x * ts;
  const ty = BORDER + y * ts;
  const { cx, cy, cw, ch } = cellRect(state, x, y, ts);

  dr.clip({ x: tx, y: ty, w: ts, h: ts });
  dr.drawUpdate({ x: tx, y: ty, w: ts, h: ts });

  dr.drawRect({ x: cx, y: cy, w: cw, h: ch }, color);

  // The pencil-entry cursor: a triangle in the cell's top-left corner.
  if (pencilCursor) {
    dr.drawPolygon(
      [
        { x: cx, y: cy },
        { x: cx + ((ts / 2) | 0), y: cy },
        { x: cx, y: cy + ((ts / 2) | 0) },
      ],
      COL_LOWLIGHT,
      COL_LOWLIGHT,
    );
  }

  // A cell whose *diagonal* neighbor is in another region owes that corner a
  // black pixel — drawn after the fill, which can otherwise cover it.
  const corner = (px: number, py: number) =>
    dr.drawRect({ x: px, y: py, w: GRIDEXTRA, h: GRIDEXTRA }, COL_BORDER);
  if (x > 0 && y > 0 && !dsf.equivalent(i, i - w - 1))
    corner(1 + tx - GRIDEXTRA, 1 + ty - GRIDEXTRA);
  if (x + 1 < w && y > 0 && !dsf.equivalent(i, i - w + 1))
    corner(tx + ts - 2 * GRIDEXTRA, 1 + ty - GRIDEXTRA);
  if (x > 0 && y + 1 < h && !dsf.equivalent(i, i + w - 1))
    corner(1 + tx - GRIDEXTRA, ty + ts - 2 * GRIDEXTRA);
  if (x + 1 < w && y + 1 < h && !dsf.equivalent(i, i + w + 1))
    corner(tx + ts - 2 * GRIDEXTRA, ty + ts - 2 * GRIDEXTRA);

  if (grid[i] === 0) {
    drawPencilMarks(dr, ts, cx, cy, pencil[i]);
  } else {
    const ink =
      flags[i] & FM_FIXED
        ? COL_NUM_FIXED
        : flags[i] & FM_ERRORMASK
          ? COL_NUM_ERROR
          : COL_NUM_GUESS;
    dr.drawText(
      { x: tx + ((ts / 2) | 0), y: ty + ((ts / 2) | 0) },
      {
        align: "center",
        baseline: "mathematical",
        fontType: "variable",
        size: (ts / 2) | 0,
      },
      ink,
      String(grid[i]),
    );
  }

  // Check & Save mistake overlay (fork addition): an inset red double outline,
  // so it reads distinctly from the red *digit* a live rule violation gets.
  if (wrong) {
    for (const inset of [2, 3]) {
      const l = tx + inset;
      const t = ty + inset;
      const r = tx + ts - 2 - inset;
      const b = ty + ts - 2 - inset;
      dr.drawLine({ x: l, y: t }, { x: r, y: t }, COL_NUM_ERROR, 1);
      dr.drawLine({ x: r, y: t }, { x: r, y: b }, COL_NUM_ERROR, 1);
      dr.drawLine({ x: r, y: b }, { x: l, y: b }, COL_NUM_ERROR, 1);
      dr.drawLine({ x: l, y: b }, { x: l, y: t }, COL_NUM_ERROR, 1);
    }
  }

  dr.unclip();
}

// --- pencil-mode indicator (fork addition) ---------------------------------

function drawPencilIndicator(
  dr: GameDrawing,
  p: SeismicParams,
  ts: number,
  on: boolean,
): void {
  const size = indicatorSize(ts);
  const board = boardSize(p, ts);
  const ox = board.w - size;
  const oy = board.h;
  dr.drawRect({ x: ox, y: oy, w: size, h: size }, COL_BACKGROUND);
  if (on) drawPencilGlyph(dr, ox, oy, size, COL_PENCIL_BODY, COL_BORDER);
  dr.drawUpdate({ x: ox, y: oy, w: size, h: size });
}

// --- redraw ----------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: SeismicDrawState,
  _prev: SeismicState | null,
  state: SeismicState,
  _dir: number,
  ui: SeismicUi,
  _animTime: number,
  flashTime: number,
  _hint?: unknown,
  mistakes?: readonly { x: number; y: number }[],
): void {
  const ts = ds.tilesize;
  const { w, h } = state;
  const size = computeSize(state.params, ts);
  const firstFrame = !ds.started;

  if (firstFrame) {
    // The engine paints no pixels of its own (docs/games/rendering.md § "The rendering doctrine"): fill the whole
    // canvas, then lay down the black rectangle the region walls show through.
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_BACKGROUND);
    dr.drawRect(
      {
        x: BORDER - GRIDEXTRA * 2,
        y: BORDER - GRIDEXTRA * 2,
        w: w * ts + GRIDEXTRA * 2,
        h: h * ts + GRIDEXTRA * 2,
      },
      COL_BORDER,
    );
    dr.drawUpdate({ x: 0, y: 0, w: size.w, h: size.h });
    ds.started = true;
  }

  // The completion flash runs a three-phase diagonal wave; the cursor is hidden
  // while it plays.
  const flash = flashTime > 0 ? Math.floor(flashTime / FLASH_FRAME) % 3 : -1;
  const cshow = flashTime > 0 ? false : ui.cursor.visible;

  ds.wrong.packCells(mistakes, (x, y) => y * w + x);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const highlighted = cshow && ui.cursor.x === x && ui.cursor.y === y;
      const pencilCursor = highlighted && ui.pencilMode;

      let color: number;
      if (flash === -1) {
        color = highlighted && !ui.pencilMode ? COL_HIGHLIGHT : COL_BACKGROUND;
      } else {
        color =
          (x + y) % 3 === flash
            ? COL_BACKGROUND
            : (x + y + 1) % 3 === flash
              ? COL_LOWLIGHT
              : COL_HIGHLIGHT;
      }

      const tile =
        state.grid[i] |
        (state.pencil[i] << 4) |
        (state.flags[i] << 13) |
        (color << 16) |
        ((pencilCursor ? 1 : 0) << 18);

      if (ds.tiles[i] !== tile || ds.wrong.stale(i)) {
        drawTile(dr, ds, state, x, y, color, pencilCursor, ds.wrong.at(i));
        ds.tiles[i] = tile;
        ds.wrong.commit(i);
      }
    }
  }

  if (firstFrame || ds.pencilModeShown !== ui.pencilMode) {
    drawPencilIndicator(dr, state.params, ts, ui.pencilMode);
    ds.pencilModeShown = ui.pencilMode;
  }
}
