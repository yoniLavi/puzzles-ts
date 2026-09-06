/**
 * Sticks rendering — port of `game_redraw` in `puzzles/unreleased/sticks.c`.
 *
 * A per-tile diffed loop over a black grid backing: each cell is a full-tile
 * `COL_GRID` rect under a one-pixel-smaller fill (black for a wall,
 * background for a white cell), a green center bar for a placed line, the
 * clue number as text (white on black cells, dark on white cells, red when
 * its constraint is currently violated), and a blue frame under the keyboard
 * cursor. The in-flight drag previews its accreted cells; on a fresh win the
 * lines blink off on alternate 0.1 s flash frames. `findMistakes` cells get
 * an inset red frame via an `OverlaySidecar` (docs/games/rendering.md § "Overlay sidecars" — the overlay is
 * part of the diff key so Check & Save repaints an otherwise-unchanged
 * frame).
 *
 * Sticks is compiled with `NARROW_BORDERS` (cmake/platforms/webapp.cmake),
 * so `BORDER = tilesize / 10` — not the desktop `tilesize / 2` — and
 * `computeSize` subtracts 1 to meet the outer grid line.
 */

import { GREEN, PURPLE } from "../../engine/color/colors.ts";
import {
  ERROR,
  HINT_ACTION,
  HINT_EVIDENCE,
  INK,
  PAPER,
} from "../../engine/color/palette.ts";
import { drawThickRectOutline } from "../../engine/draw.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import { drawMarkSides, MARK_ALL } from "../../engine/hint-mark.ts";
import { OverlaySidecar } from "../../engine/overlay-sidecar.ts";
import type { Color, Size } from "../../engine/types.ts";
import { findLiveErrors } from "./solver.ts";
import {
  F_BLOCK,
  F_HOR,
  F_VER,
  type SticksHint,
  type SticksMistake,
  type SticksMove,
  type SticksParams,
  type SticksState,
  type SticksUi,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 48;
const FLASH_FRAME = 0.1;
export const FLASH_TIME = FLASH_FRAME * 5;

// --- palette (upstream COL_* enum, index-for-index) -------------------------

export const COL_BACKGROUND = 0;
export const COL_GRID = 1;
export const COL_LINE = 2;
export const COL_NUMBER = 3;
export const COL_ERROR = 4;
export const COL_CURSOR = 5;
// Fork additions beyond upstream's COL_* enum: the explained hint.
export const COL_HINT = 6; // the forced square's line, in the game's own bar shape
export const COL_HINT_CELL = 7; // the deduction's evidence — an inset ring

export function colors(defaultBackground: Color): Color[] {
  const out: Color[] = [];
  out[COL_BACKGROUND] = defaultBackground;
  out[COL_GRID] = INK;
  // A placed stick is a bar filling a fifth of its cell — a piece, not a glyph,
  // so the named green rather than the entry green a digit takes.
  out[COL_LINE] = GREEN;
  out[COL_NUMBER] = PAPER;
  out[COL_ERROR] = ERROR;
  // Purple, because Sticks has spent the usual two: its lines are green and the
  // hint's forced square is blue (upstream's cursor was that same blue, which
  // `add-sticks-hint` could not leave standing — a cursor and a hint bar in one
  // square would have been one hue for two roles).
  out[COL_CURSOR] = PURPLE;
  out[COL_HINT] = HINT_ACTION;
  out[COL_HINT_CELL] = HINT_EVIDENCE;
  return out;
}

// --- geometry ---------------------------------------------------------------

export const border = (ts: number): number => Math.floor(ts / 10);

export function computeSize(p: SticksParams, ts: number): Size {
  // NARROW_BORDERS: -1 to match the grid outline drawn on first paint.
  return { w: p.w * ts + 2 * border(ts) - 1, h: p.h * ts + 2 * border(ts) - 1 };
}

// --- draw state -------------------------------------------------------------

// Cache flags above the tile bits (0..2: F_HOR | F_VER | F_BLOCK).
const F_ERR = 1 << 8;
const F_CUR = 1 << 9;
const F_FLASH = 1 << 10;
// The hint overlay is part of the diff key, or an otherwise-unchanged frame
// never repaints when a hint is shown or dismissed (docs/games/rendering.md § "Overlay sidecars").
const F_HINT_HOR = 1 << 11;
const F_HINT_VER = 1 << 12;
const F_HINT_EVID = 1 << 13;

export interface SticksDrawState {
  started: boolean;
  tilesize: number;
  cache: Int32Array;
  mistakes: OverlaySidecar;
}

export function newDrawState(state: SticksState): SticksDrawState {
  return {
    started: false,
    tilesize: 0,
    cache: new Int32Array(state.w * state.h).fill(-1),
    mistakes: new OverlaySidecar(state.w * state.h),
  };
}

export function setTileSize(ds: SticksDrawState, ts: number): void {
  ds.tilesize = ts;
}

// --- cell drawing -----------------------------------------------------------

interface TileVisual {
  tile: number;
  clue: number;
  error: boolean;
  cursor: boolean;
  mistake: boolean;
  /** The hint's forced orientation for this square (`F_HOR`/`F_VER`/0). */
  hintLine: number;
  /** This square is part of the displayed hint's evidence. */
  evidence: boolean;
}

function drawTile(
  dr: GameDrawing,
  ts: number,
  x: number,
  y: number,
  v: TileVisual,
): void {
  const { tile, clue, error, cursor, mistake, hintLine, evidence } = v;
  const b = border(ts);
  const px = x * ts + b;
  const py = y * ts + b;
  const black = (tile & F_BLOCK) !== 0;

  dr.drawRect({ x: px, y: py, w: ts, h: ts }, COL_GRID);
  // Evidence is an inset **ring** on every square, black or white — one rule and
  // one shape for one role. A fill on a black square hides the very blackness
  // the argument is about; on a white one it is the wash itself that loses, since
  // a fill pale enough to leave the clue digit legible is too faint to read as a
  // mark (`hint-mark.ts`). A white evidence square is not empty either: it
  // carries the clue the deduction counts with, and often a line.
  dr.drawRect(
    { x: px, y: py, w: ts - 1, h: ts - 1 },
    black ? COL_GRID : COL_BACKGROUND,
  );

  if (tile & F_HOR) {
    dr.drawRect(
      { x: px, y: py + Math.floor((ts * 2) / 5), w: ts - 1, h: Math.floor(ts / 5) },
      COL_LINE,
    );
  }
  if (tile & F_VER) {
    dr.drawRect(
      { x: px + Math.floor((ts * 2) / 5), y: py, w: Math.floor(ts / 5), h: ts - 1 },
      COL_LINE,
    );
  }

  // The forced line, in the game's own bar shape and the hint color — a tint
  // could not say *which* orientation, which is the whole of the move (§5.1a).
  // Drawn, never placed: the player still makes the move.
  if (hintLine & F_HOR) {
    dr.drawRect(
      { x: px, y: py + Math.floor((ts * 2) / 5), w: ts - 1, h: Math.floor(ts / 5) },
      COL_HINT,
    );
  }
  if (hintLine & F_VER) {
    dr.drawRect(
      { x: px + Math.floor((ts * 2) / 5), y: py, w: Math.floor(ts / 5), h: ts - 1 },
      COL_HINT,
    );
  }

  if (evidence) {
    const m = Math.floor(ts / 12);
    drawMarkSides(
      dr,
      {
        box: { x: px + m, y: py + m, w: ts - 1 - 2 * m, h: ts - 1 - 2 * m },
        outer: 0,
        inner: Math.max(2, Math.floor(ts / 10)),
      },
      MARK_ALL,
      COL_HINT_CELL,
    );
  }

  if (clue !== -1) {
    dr.drawText(
      { x: Math.floor((x + 0.5) * ts) + b, y: Math.floor((y + 0.5) * ts) + b },
      {
        align: "center",
        baseline: "mathematical",
        fontType: "variable",
        size: Math.floor(ts * 0.7),
      },
      error ? COL_ERROR : tile & F_BLOCK ? COL_NUMBER : COL_GRID,
      String(clue),
    );
  }

  if (mistake) {
    // Inset red frame: this placed line contradicts the unique solution
    // (Check & Save's overlay — distinct from the red clue-number live
    // errors, which recolor the text above).
    const thick = Math.floor(ts / 7);
    const margin = Math.floor(ts / 20);
    const inner = ts - 1 - 2 * margin;
    drawThickRectOutline(dr, px + margin, py + margin, inner, inner, thick, COL_ERROR);
  }

  if (cursor) {
    const t = Math.floor(ts / 12);
    dr.drawRect({ x: px, y: py, w: t, h: ts - 1 }, COL_CURSOR);
    dr.drawRect({ x: px, y: py, w: ts - 1, h: t }, COL_CURSOR);
    dr.drawRect({ x: px + ts - 1 - t, y: py, w: t, h: ts - 1 }, COL_CURSOR);
    dr.drawRect({ x: px, y: py + ts - 1 - t, w: ts - 1, h: t }, COL_CURSOR);
  }

  dr.drawUpdate({ x: px, y: py, w: ts, h: ts });
}

// --- redraw -----------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: SticksDrawState,
  _prev: SticksState | null,
  state: SticksState,
  _dir: number,
  ui: SticksUi,
  _animTime: number,
  flashTime: number,
  hint?: HintStep<SticksMove, SticksHint>,
  mistakes?: readonly SticksMistake[],
): void {
  const ts = ds.tilesize;
  const { w, h, grid, numbers } = state;
  const b = border(ts);

  if (!ds.started) {
    const fullW = w * ts + 2 * b;
    const fullH = h * ts + 2 * b;
    dr.drawRect({ x: 0, y: 0, w: fullW, h: fullH }, COL_BACKGROUND);
    dr.drawUpdate({ x: 0, y: 0, w: fullW, h: fullH });
    // Outer grid frame (upstream: COORD(0) − tilesize/10 == 0); the per-tile
    // COL_GRID rects draw the interior lines.
    dr.drawRect({ x: 0, y: 0, w: fullW - 1, h: fullH - 1 }, COL_GRID);
    ds.started = true;
  }

  const flash = flashTime > 0 && Math.floor(flashTime / FLASH_FRAME) % 2 === 0;

  // Live clue violations, recomputed pure from the committed grid (upstream
  // stores the equivalent F_ERROR bits in the state; same verdicts).
  const errorList = findLiveErrors(state);
  const errorSet = errorList.length > 0 ? new Set(errorList) : null;

  // In-flight drag preview: cell index → previewed tile value.
  const dragMap = ui.drag.length > 0 ? new Map<number, number>() : null;
  if (dragMap) {
    for (let d = 0; d < ui.drag.length; d++) dragMap.set(ui.drag[d], ui.dragMove[d]);
  }

  ds.mistakes.clear();
  for (const m of mistakes ?? []) ds.mistakes.add(m.index, 1);

  // The displayed hint step's forced square and the cells its argument rests on.
  const hl = hint?.highlights;
  const hintTarget = hl?.target ?? -1;
  const hintBits = hl ? (hl.to === "hor" ? F_HOR : F_VER) : 0;
  const hintEvidence = hl ? new Set(hl.evidence) : null;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let tile = grid[i];

      const preview = !(tile & F_BLOCK) ? dragMap?.get(i) : undefined;
      if (preview !== undefined) tile = preview;

      if (flash) tile &= ~(F_HOR | F_VER);
      const cursor = ui.cursor.visible && ui.cursor.x === x && ui.cursor.y === y;
      // A previewed (uncommitted) cell suppresses its error highlight — the
      // committed grid is what the error check ran on.
      const error = preview === undefined && (errorSet?.has(i) ?? false);
      const hintLine = i === hintTarget ? hintBits : 0;
      const evidence = hintEvidence?.has(i) ?? false;

      const packed =
        (tile & 0x7) |
        (error ? F_ERR : 0) |
        (cursor ? F_CUR : 0) |
        (flash ? F_FLASH : 0) |
        (hintLine & F_HOR ? F_HINT_HOR : 0) |
        (hintLine & F_VER ? F_HINT_VER : 0) |
        (evidence ? F_HINT_EVID : 0);
      if (ds.cache[i] !== packed || ds.mistakes.stale(i)) {
        drawTile(dr, ts, x, y, {
          tile,
          clue: numbers[i],
          error,
          cursor,
          mistake: ds.mistakes.packed[i] !== 0,
          hintLine,
          evidence,
        });
        ds.cache[i] = packed;
        ds.mistakes.commit(i);
      }
    }
  }
}
