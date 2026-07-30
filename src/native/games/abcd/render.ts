/**
 * ABCD rendering — idiomatic port of `game_redraw` / the draw helpers from
 * `abcd.c`.
 *
 * The grid is drawn with the `A…` border letters in the top-left gutter, the
 * edge clues along the top and left borders (red when a clue is over- or
 * under-satisfiable), and a `w × h` block of bevelled cells: each holds either
 * an entered letter (red on an adjacency violation, else the guess colour) or,
 * when empty, its pencil-mark grid. A selected cell is highlighted; under
 * diagonal mode each interior cell carries a small corner cross as the
 * no-diagonal-touch cue. A solved board runs a diagonal-stripe flash.
 *
 * `webapp.cmake` defines `NARROW_BORDERS`, so the compiled arm is
 * `BORDER = 0`; `computeSize` carries upstream's `+1` tile-background allowance.
 *
 * Because a cell's pixels depend only on its own letter + pencil cube + a small
 * flag set (cursor / pencil-cursor / adjacency-error / flash phase), a single
 * per-tile `Int32Array` cache suffices — with the (fork) Check-&-Save mistake
 * overlay tracked in a sidecar so a mistaken-but-unchanged cell still repaints
 * (playbook §3.2).
 */

import type { Colour, Size } from "../../../puzzle/types.ts";
import { mkhighlight } from "../../engine/colour-mkhighlight.ts";
import type { GameDrawing } from "../../engine/game.ts";
import { OverlaySidecar } from "../../engine/overlay-sidecar.ts";
import { ERROR, GRID_MID, INK, PENCIL_BODY } from "../../engine/palette.ts";
import { drawPencilGlyph } from "../../engine/pencil-indicator.ts";
import {
  type AbcdState,
  type AbcdUi,
  cuboid,
  EMPTY,
  horClue,
  NO_NUMBER,
  verClue,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 36;
export const FLASH_TIME = 0.7;
const FLASH_FRAME = 0.1;

// --- palette (index-for-index with the upstream COL_* enum) ----------------

export const COL_OUTERBG = 0;
export const COL_INNERBG = 1;
export const COL_GRID = 2;
export const COL_BORDERLETTER = 3;
export const COL_TEXT = 4;
export const COL_GUESS = 5;
export const COL_ERROR = 6;
export const COL_PENCIL = 7;
export const COL_HIGHLIGHT = 8;
export const COL_LOWLIGHT = 9;
// Fork addition, appended past the upstream enum (ABCD has no dark-mode
// paletteOverrides, so a plain append is safe): the yellow body of the shared
// pencil-mode indicator glyph.
export const COL_PENCIL_BODY = 10;

export function colours(defaultBackground: Colour): Colour[] {
  const outer = defaultBackground;
  const { background: inner, highlight, lowlight } = mkhighlight(defaultBackground);
  const out: Colour[] = [];
  out[COL_OUTERBG] = outer;
  out[COL_INNERBG] = inner;
  out[COL_GRID] = GRID_MID;
  out[COL_BORDERLETTER] = [0, 0, 0.6 * outer[1]];
  out[COL_TEXT] = INK;
  out[COL_GUESS] = [0, 0.6 * inner[1], 0];
  out[COL_ERROR] = ERROR;
  out[COL_PENCIL] = [0.5 * inner[0], 0.5 * inner[1], inner[2]];
  out[COL_HIGHLIGHT] = highlight;
  out[COL_LOWLIGHT] = lowlight;
  out[COL_PENCIL_BODY] = PENCIL_BODY;
  return out;
}

// --- geometry (NARROW_BORDERS ⇒ BORDER = 0) --------------------------------

const outerCoord = (v: number, ts: number): number => v * ts;
const innerCoord = (v: number, ts: number, n: number): number => (v + n) * ts;

/** Pixel → grid cell along one axis (returns an out-of-range index off-grid). */
export function fromCoord(px: number, ts: number, n: number): number {
  return Math.floor(px / ts) - n;
}

export function computeSize(p: { w: number; h: number; n: number }, ts: number): Size {
  // `NARROW_BORDERS` adds +1 to the width for the tile-background allowance.
  return { w: (p.w + p.n) * ts + 1, h: (p.h + p.n) * ts };
}

// --- draw state ------------------------------------------------------------

// Cache-key bit layout for a cell's packed tile value.
const K_LETTER = 0; // bits 0-3: letter + 1 (0 = empty)
const DF_CURSOR = 1 << 4;
const DF_PENCIL = 1 << 5; // cursor is in pencil mode over this cell
const DF_ERR = 1 << 6; // this letter breaks an adjacency rule
const K_FLASH = 7; // bits 7-8: flash phase + 1 (0 = not flashing)
const K_PENCIL = 9; // bits 9+: the n-bit pencil-mark mask

export interface AbcdDrawState {
  started: boolean;
  tilesize: number;
  w: number;
  h: number;
  n: number;
  /** `w·h` last-drawn packed tile values (-1 = never drawn). */
  tiles: Int32Array;
  /** `(w+h)·n` last-drawn clue-error flags (-1 = never drawn). */
  clueErr: Int8Array;
  /** Mistake-overlay sidecar (fork addition) — keeps Check & Save in the diff key. */
  wrong: OverlaySidecar;
  /** Whether the pencil-mode indicator was on last frame (fork addition). */
  pencilModeShown: boolean;
}

export function newDrawState(state: AbcdState): AbcdDrawState {
  const { w, h, n } = state.params;
  return {
    started: false,
    tilesize: 0,
    w,
    h,
    n,
    tiles: new Int32Array(w * h).fill(-1),
    clueErr: new Int8Array((w + h) * n).fill(-1),
    wrong: new OverlaySidecar(w * h),
    pencilModeShown: false,
  };
}

export function setTileSize(ds: AbcdDrawState, ts: number): void {
  ds.tilesize = ts;
}

// --- error computation (base render, not findMistakes) ---------------------

/** Per-clue "over- or under-satisfiable" flag (upstream `abcd_count_clues`). */
function computeClueErrors(state: AbcdState): Uint8Array {
  const { w, h, n } = state.params;
  const { grid, numbers } = state;
  const err = new Uint8Array((w + h) * n);
  for (const horizontal of [true, false]) {
    const amx = horizontal ? h : w;
    const bmx = horizontal ? w : h;
    for (let a = 0; a < amx; a++) {
      for (let i = 0; i < n; i++) {
        const pos = horizontal ? horClue(a, i, n) : verClue(a, i, n, h);
        const clue = numbers[pos];
        if (clue === NO_NUMBER) continue;
        let found = 0;
        let empty = 0;
        for (let b = 0; b < bmx; b++) {
          const g = grid[horizontal ? a * w + b : b * w + a];
          if (g === i) found++;
          else if (g === EMPTY) empty++;
        }
        if (found > clue || found + empty < clue) err[pos] = 1;
      }
    }
  }
  return err;
}

/** Per-cell "shares its letter with an identical neighbour" flag
 * (upstream `abcd_set_errors_adjacent`, all directions OR-ed). */
function computeAdjacencyErrors(state: AbcdState): Uint8Array {
  const { w, h, diag } = state.params;
  const g = state.grid;
  const err = new Uint8Array(w * h);
  const scan = (
    sx: number,
    sy: number,
    ex: number,
    ey: number,
    dx: number,
    dy: number,
  ): void => {
    for (let x = sx; x < ex; x++) {
      for (let y = sy; y < ey; y++) {
        const c = g[y * w + x];
        if (c !== EMPTY && c === g[(y + dy) * w + (x + dx)]) {
          err[y * w + x] = 1;
          err[(y + dy) * w + (x + dx)] = 1;
        }
      }
    }
  };
  scan(0, 0, w - 1, h, 1, 0); // horizontal
  scan(0, 0, w, h - 1, 0, 1); // vertical
  if (diag) {
    scan(0, 0, w - 1, h - 1, 1, 1); // topleft-bottomright
    scan(0, 1, w - 1, h, 1, -1); // bottomleft-topright
  }
  return err;
}

// --- drawing helpers -------------------------------------------------------

function drawBorderLetters(
  dr: GameDrawing,
  ts: number,
  n: number,
  colour: number,
): void {
  for (let i = 0; i < n; i++) {
    const letter = String.fromCharCode(65 + i);
    // horizontal
    dr.drawText(
      {
        x: outerCoord(i, ts) + ((ts / 2) | 0),
        y: outerCoord(n - 1, ts) + ((ts / 2) | 0),
      },
      {
        align: "center",
        baseline: "mathematical",
        fontType: "variable",
        size: (ts / 2) | 0,
      },
      colour,
      letter,
    );
    if (i === n - 1) continue; // don't draw the corner letter twice
    // vertical
    dr.drawText(
      {
        x: outerCoord(n - 1, ts) + ((ts / 2) | 0),
        y: outerCoord(i, ts) + ((ts / 2) | 0),
      },
      {
        align: "center",
        baseline: "mathematical",
        fontType: "variable",
        size: (ts / 2) | 0,
      },
      colour,
      letter,
    );
  }
}

function drawPencilMarks(
  dr: GameDrawing,
  state: AbcdState,
  ts: number,
  x: number,
  y: number,
): void {
  const { w, n } = state.params;
  const ox = innerCoord(x, ts, n);
  const oy = innerCoord(y, ts, n);
  let nhints = 0;
  for (let i = 0; i < n; i++) if (state.pencil[cuboid(x, y, i, n, w)]) nhints++;
  if (nhints === 0) return;

  let hw = 1;
  while (hw * hw < nhints) hw++;
  if (hw < 3) hw = 3;
  let hh = ((nhints + hw - 1) / hw) | 0;
  if (hh < 2) hh = 2;
  const hmax = Math.max(hw, hh);
  const denom = ((hmax * (11 - hmax)) / 8) | 0;
  const fontsz = denom > 0 ? (ts / denom) | 0 : ts;

  let j = 0;
  for (let i = 0; i < n; i++) {
    if (!state.pencil[cuboid(x, y, i, n, w)]) continue;
    const hx = j % hw;
    const hy = (j / hw) | 0;
    dr.drawText(
      {
        x: (ox + ((4 * hx + 3) * ts) / (4 * hw + 2)) | 0,
        y: (oy + ((4 * hy + 3) * ts) / (4 * hh + 2)) | 0,
      },
      { align: "center", baseline: "mathematical", fontType: "variable", size: fontsz },
      COL_PENCIL,
      String.fromCharCode(65 + i),
    );
    j++;
  }
}

function drawTile(
  dr: GameDrawing,
  ds: AbcdDrawState,
  state: AbcdState,
  x: number,
  y: number,
  fs: number,
  flash: number,
  wrong: boolean,
): void {
  const ts = ds.tilesize;
  const { w, n, diag } = state.params;
  const tx = innerCoord(x, ts, n);
  const ty = innerCoord(y, ts, n);
  const flashing = flash >= 0;
  const letter = state.grid[y * w + x];

  // Background: a diagonal stripe while flashing, else a cursor highlight.
  const bgcol =
    flashing && (x + y) % 3 === flash
      ? COL_HIGHLIGHT
      : flashing && (x + y + 2) % 3 === flash
        ? COL_LOWLIGHT
        : !flashing && fs & DF_CURSOR
          ? COL_HIGHLIGHT
          : COL_INNERBG;
  dr.drawRect({ x: tx + 1, y: ty, w: ts - 1, h: ts - 1 }, bgcol);

  // Pencil-cursor marker (top-left triangle).
  if (!flashing && fs & DF_PENCIL) {
    dr.drawPolygon(
      [
        { x: tx, y: ty },
        { x: tx + ((ts / 2) | 0), y: ty },
        { x: tx, y: ty + ((ts / 2) | 0) },
      ],
      COL_HIGHLIGHT,
      COL_HIGHLIGHT,
    );
  }

  if (letter !== EMPTY) {
    dr.drawText(
      { x: tx + ((ts / 2) | 0), y: ty + ((ts / 2) | 0) },
      {
        align: "center",
        baseline: "mathematical",
        fontType: "variable",
        size: (ts / 2) | 0,
      },
      fs & DF_ERR ? COL_ERROR : COL_GUESS,
      String.fromCharCode(65 + letter),
    );
  } else {
    drawPencilMarks(dr, state, ts, x, y);
  }

  // Cell border.
  dr.drawPolygon(
    [
      { x: tx, y: ty - 1 },
      { x: tx + ts, y: ty - 1 },
      { x: tx + ts, y: ty + ts - 1 },
      { x: tx, y: ty + ts - 1 },
    ],
    -1,
    COL_GRID,
  );

  // Diagonal-mode corner crosses (interior corners only).
  const d = (ts / 6) | 0;
  if (diag && x > 0 && y > 0)
    dr.drawLine({ x: tx, y: ty - 1 }, { x: tx + d, y: ty + d - 1 }, COL_GRID, 1);
  if (diag && x < w - 1 && y > 0)
    dr.drawLine(
      { x: tx + ts, y: ty - 1 },
      { x: tx + ts - d, y: ty + d - 1 },
      COL_GRID,
      1,
    );
  if (diag && x > 0 && y < state.params.h - 1)
    dr.drawLine(
      { x: tx, y: ty + ts - 1 },
      { x: tx + d, y: ty + ts - d - 1 },
      COL_GRID,
      1,
    );
  if (diag && x < w - 1 && y < state.params.h - 1)
    dr.drawLine(
      { x: tx + ts, y: ty + ts - 1 },
      { x: tx + ts - d, y: ty + ts - d - 1 },
      COL_GRID,
      1,
    );

  // Check-&-Save mistake overlay (fork addition): an inset red outline.
  if (wrong) {
    const l = tx;
    const t = ty;
    const r = tx + ts - 1;
    const b = ty + ts - 1;
    for (const inset of [2, 3]) {
      dr.drawLine(
        { x: l + inset, y: t + inset },
        { x: r - inset, y: t + inset },
        COL_ERROR,
        1,
      );
      dr.drawLine(
        { x: r - inset, y: t + inset },
        { x: r - inset, y: b - inset },
        COL_ERROR,
        1,
      );
      dr.drawLine(
        { x: r - inset, y: b - inset },
        { x: l + inset, y: b - inset },
        COL_ERROR,
        1,
      );
      dr.drawLine(
        { x: l + inset, y: b - inset },
        { x: l + inset, y: t + inset },
        COL_ERROR,
        1,
      );
    }
  }

  dr.drawUpdate({ x: tx, y: ty, w: ts, h: ts });
}

// --- pencil-mode indicator -------------------------------------------------

/** The shared CapsLock-style pencil-mode glyph, drawn in the empty top-left
 * gutter corner (above/left of the diagonal border letters, never overlapping a
 * cell or clue) — the same indicator Towers/Unequal/Mathrax use. */
function drawPencilIndicator(dr: GameDrawing, ts: number, on: boolean): void {
  dr.drawRect({ x: 0, y: 0, w: ts, h: ts }, COL_OUTERBG);
  if (on) drawPencilGlyph(dr, 0, 0, ts, COL_PENCIL_BODY, COL_GRID);
  dr.drawUpdate({ x: 0, y: 0, w: ts, h: ts });
}

// --- redraw ----------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: AbcdDrawState | null,
  _prev: AbcdState | null,
  state: AbcdState,
  _dir: number,
  ui: AbcdUi,
  _animTime: number,
  flashTime: number,
  _hint?: unknown,
  mistakes?: readonly { x: number; y: number }[],
): void {
  if (!ds) return;
  const ts = ds.tilesize;
  const { w, h, n } = state.params;
  const firstFrame = !ds.started;

  if (!ds.started) {
    const size = computeSize(state.params, ts);
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_OUTERBG);
    drawBorderLetters(dr, ts, n, COL_BORDERLETTER);
    dr.drawUpdate({ x: 0, y: 0, w: size.w, h: size.h });
    ds.started = true;
  }

  const flash = flashTime > 0 ? Math.floor(flashTime / FLASH_FRAME) % 3 : -1;

  // Clues (redraw only those whose error flag flipped).
  const clueErr = computeClueErrors(state);
  for (const horizontal of [true, false]) {
    const amx = horizontal ? h : w;
    for (let a = 0; a < amx; a++) {
      for (let i = 0; i < n; i++) {
        const pos = horizontal ? horClue(a, i, n) : verClue(a, i, n, h);
        if (ds.clueErr[pos] === clueErr[pos]) continue;
        const oo = outerCoord(i, ts);
        const oi = innerCoord(a, ts, n);
        const ox = horizontal ? oo : oi;
        const oy = horizontal ? oi : oo;
        dr.drawRect({ x: ox, y: oy, w: ts - 1, h: ts - 1 }, COL_OUTERBG);
        const clue = state.numbers[pos];
        if (clue !== NO_NUMBER) {
          dr.drawText(
            { x: ox + ((ts / 2) | 0), y: oy + ((ts / 2) | 0) },
            {
              align: "center",
              baseline: "mathematical",
              fontType: "variable",
              size: (ts / 2) | 0,
            },
            clueErr[pos] ? COL_ERROR : COL_TEXT,
            String(clue),
          );
        }
        dr.drawUpdate({ x: ox, y: oy, w: ts - 1, h: ts - 1 });
        ds.clueErr[pos] = clueErr[pos];
      }
    }
  }

  // Grid tiles.
  const adjErr = computeAdjacencyErrors(state);
  ds.wrong.packCells(mistakes, (x, y) => y * w + x);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let fs = 0;
      if (ui.hshow && ui.hx === x && ui.hy === y)
        fs |= ui.hpencil ? DF_PENCIL : DF_CURSOR;
      if (adjErr[i]) fs |= DF_ERR;

      const letter = state.grid[i];
      let pencilMask = 0;
      if (letter === EMPTY) {
        for (let c = 0; c < n; c++)
          if (state.pencil[cuboid(x, y, c, n, w)]) pencilMask |= 1 << c;
      }
      const tile =
        ((letter === EMPTY ? 0 : letter + 1) << K_LETTER) |
        fs |
        ((flash + 1) << K_FLASH) |
        (pencilMask << K_PENCIL);

      if (ds.tiles[i] !== tile || ds.wrong.stale(i)) {
        drawTile(dr, ds, state, x, y, fs, flash, ds.wrong.at(i));
        ds.tiles[i] = tile;
        ds.wrong.commit(i);
      }
    }
  }

  // Pencil-mode indicator (fork addition): the sticky-pencil "mode on" glyph.
  if (firstFrame || ds.pencilModeShown !== ui.hpencil) {
    drawPencilIndicator(dr, ts, ui.hpencil);
    ds.pencilModeShown = ui.hpencil;
  }
}
