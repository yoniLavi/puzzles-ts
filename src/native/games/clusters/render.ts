/**
 * Clusters rendering — port of `game_redraw` / `draw_tile` in
 * `puzzles/unreleased/clusters.c`. A per-tile diffed loop: each cell is a
 * `COL_GRID` rect under a slightly smaller colour rect (red `COL_0` / blue
 * `COL_1` / background), a dot circle for a given, a red four-sided outline
 * for a rule violation, and a green frame under the keyboard cursor. Rule
 * violations are recomputed every frame from the current grid and shown live
 * (upstream behaviour); the in-flight paint drag previews its cells in the
 * drag colour. On a fresh win the whole board flashes by swapping both
 * colours on alternate beats.
 *
 * Clusters is compiled with `NARROW_BORDERS` (cmake/platforms/webapp.cmake),
 * so `BORDER = tilesize / 10` — a thin grid margin, not the desktop
 * `tilesize / 2` — and `computeSize` subtracts 1 to meet the outer grid line.
 */
import type { Colour, Size } from "../../../puzzle/types.ts";
import { BLUE, ORANGE, PINK_WASH } from "../../engine/colours.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import { OverlaySidecar } from "../../engine/overlay-sidecar.ts";
import {
  CURSOR,
  ERROR,
  HINT_ACTION,
  HINT_EVIDENCE,
  INK,
  PAPER,
} from "../../engine/palette.ts";
import type { ClustersHintHighlights } from "./index.ts";
import { findErrors } from "./solver.ts";
import {
  type ClustersMove,
  type ClustersParams,
  type ClustersState,
  type ClustersUi,
  COLMASK,
  F_COLOR_0,
  F_COLOR_1,
  F_SINGLE,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 32;
const FLASH_FRAME = 0.1;
export const FLASH_TIME = FLASH_FRAME * 3;

// --- palette (upstream COL_* enum, index-for-index) ------------------------

export const COL_BACKGROUND = 0;
export const COL_GRID = 1;
export const COL_0 = 2; // red tile
export const COL_1 = 3; // blue tile
export const COL_0_DOT = 4; // dot on a red tile (dark)
export const COL_1_DOT = 5; // dot on a blue tile (white)
export const COL_ERROR = 6;
export const COL_CURSOR = 7;
// Hint legend (add-clusters-hint, §5.3/§5.4 of hint-authoring.md): the forced
// cell fills COL_HINT blue; the tile the refuted colouring would break — the
// one element the narration calls "ringed" — gets a double COL_HINT_DANGER
// ring (an outline, because the tile's own colour *is* part of the premise;
// doubled so it cannot be confused with the single red live-error frame); a
// lookahead chain's what-if cells shade COL_HINT_CELL with a small mark of
// the colour each would be forced to. No further premise role: every other
// tile the narration cites is orthogonally adjacent to the target or the
// danger tile, already in view.
export const COL_HINT = 8;
export const COL_HINT_CELL = 9;
export const COL_HINT_DANGER = 10;

export function colours(defaultBackground: Colour): Colour[] {
  const out: Colour[] = [];
  out[COL_BACKGROUND] = defaultBackground;
  out[COL_GRID] = INK;
  out[COL_0] = PINK_WASH;
  out[COL_1] = BLUE;
  out[COL_0_DOT] = INK;
  out[COL_1_DOT] = PAPER;
  out[COL_ERROR] = ERROR;
  out[COL_CURSOR] = CURSOR;
  out[COL_HINT] = HINT_ACTION;
  out[COL_HINT_CELL] = HINT_EVIDENCE;
  out[COL_HINT_DANGER] = ORANGE;
  return out;
}

// --- geometry --------------------------------------------------------------

export const border = (ts: number): number => Math.floor(ts / 10);

export function computeSize(p: ClustersParams, ts: number): Size {
  // NARROW_BORDERS: subtract 1 to meet the outer grid line drawn in redraw.
  return { w: p.w * ts + 2 * border(ts) - 1, h: p.h * ts + 2 * border(ts) - 1 };
}

// --- draw state ------------------------------------------------------------

// Cache flags above the effective-tile byte (0..6: colour bits + F_SINGLE).
const F_ERR = 1 << 8;
const F_CUR = 1 << 9;

// Hint-overlay bits, packed per cell into the OverlaySidecar (playbook §3.2:
// the sidecar is part of the diff key, so a newly displayed or dropped hint
// repaints on an otherwise-unchanged frame).
const HB_TARGET = 1; // the forced cell — COL_HINT fill
const HB_DANGER = 1 << 1; // tile that would break — double COL_HINT_DANGER ring
const HB_CHAIN_0 = 1 << 2; // what-if cell forced red in the hypothetical
const HB_CHAIN_1 = 1 << 3; // what-if cell forced blue in the hypothetical

export interface ClustersDrawState {
  started: boolean;
  tilesize: number;
  w: number;
  h: number;
  cache: Int32Array;
  hint: OverlaySidecar;
}

export function newDrawState(state: ClustersState): ClustersDrawState {
  return {
    started: false,
    tilesize: 0,
    w: state.w,
    h: state.h,
    cache: new Int32Array(state.w * state.h).fill(-1),
    hint: new OverlaySidecar(state.w * state.h),
  };
}

export function setTileSize(ds: ClustersDrawState, ts: number): void {
  ds.tilesize = ts;
}

// --- cell drawing ----------------------------------------------------------

/** A one-tile-inset square ring of thickness `t` (the premise/danger cue —
 * an outline, so the ringed tile's own colour stays visible under it). */
function drawRing(
  dr: GameDrawing,
  px: number,
  py: number,
  size: number,
  inset: number,
  t: number,
  colour: number,
): void {
  const o = size - 2 * inset;
  dr.drawRect({ x: px + inset, y: py + inset, w: o, h: t }, colour);
  dr.drawRect({ x: px + inset, y: py + inset, w: t, h: o }, colour);
  dr.drawRect({ x: px + inset, y: py + inset + o - t, w: o, h: t }, colour);
  dr.drawRect({ x: px + inset + o - t, y: py + inset, w: t, h: o }, colour);
}

function drawTile(
  dr: GameDrawing,
  ts: number,
  x: number,
  y: number,
  tile: number,
  error: boolean,
  cursor: boolean,
  hintBits: number,
): void {
  const b = border(ts);
  const px = x * ts + b;
  const py = y * ts + b;

  // The hint target and a chain's what-if cells are always empty cells, so
  // their highlight takes the fill (nothing underneath to hide, §5.4).
  const fill =
    hintBits & HB_TARGET
      ? COL_HINT
      : hintBits & (HB_CHAIN_0 | HB_CHAIN_1)
        ? COL_HINT_CELL
        : tile & F_COLOR_1
          ? COL_1
          : tile & F_COLOR_0
            ? COL_0
            : COL_BACKGROUND;
  dr.drawRect({ x: px, y: py, w: ts, h: ts }, COL_GRID);
  dr.drawRect({ x: px, y: py, w: ts - 1, h: ts - 1 }, fill);

  // The small mark of the colour a what-if cell would be forced to — a
  // deliberately tile-unlike size, so it reads as hypothetical, not placed.
  if (hintBits & (HB_CHAIN_0 | HB_CHAIN_1)) {
    const m = Math.floor(ts / 3);
    dr.drawRect(
      {
        x: px + Math.floor((ts - m) / 2),
        y: py + Math.floor((ts - m) / 2),
        w: m,
        h: m,
      },
      hintBits & HB_CHAIN_0 ? COL_0 : COL_1,
    );
  }

  if (tile & F_SINGLE) {
    const dot = tile & F_COLOR_1 ? COL_1_DOT : COL_0_DOT;
    dr.drawCircle(
      { x: px + Math.floor(ts / 2), y: py + Math.floor(ts / 2) },
      Math.floor(ts / 5),
      dot,
      dot,
    );
  }

  if (error) {
    // Four-sided inset red frame (upstream clusters_draw_err_rectangle).
    const thick = Math.floor(ts / 7);
    const margin = Math.floor(ts / 20);
    const inner = ts - 1 - 2 * margin;
    dr.drawRect({ x: px + margin, y: py + margin, w: inner, h: thick }, COL_ERROR);
    dr.drawRect({ x: px + margin, y: py + margin, w: thick, h: inner }, COL_ERROR);
    dr.drawRect(
      { x: px + margin, y: py + ts - 1 - margin - thick, w: inner, h: thick },
      COL_ERROR,
    );
    dr.drawRect(
      { x: px + ts - 1 - margin - thick, y: py + margin, w: thick, h: inner },
      COL_ERROR,
    );
  }

  if (cursor) {
    const t = Math.floor(ts / 12);
    dr.drawRect({ x: px, y: py, w: t, h: ts - 1 }, COL_CURSOR);
    dr.drawRect({ x: px, y: py, w: ts - 1, h: t }, COL_CURSOR);
    dr.drawRect({ x: px + ts - 1 - t, y: py, w: t, h: ts - 1 }, COL_CURSOR);
    dr.drawRect({ x: px, y: py + ts - 1 - t, w: ts - 1, h: t }, COL_CURSOR);
  }

  // The danger ring, last so nothing paints over it. Doubled — structure,
  // not just hue, distinguishes it from the single red live-error frame.
  if (hintBits & HB_DANGER) {
    const rt = Math.max(2, Math.floor(ts / 12));
    drawRing(dr, px, py, ts - 1, 1, rt, COL_HINT_DANGER);
    drawRing(dr, px, py, ts - 1, 1 + 2 * rt, rt, COL_HINT_DANGER);
  }

  dr.drawUpdate({ x: px, y: py, w: ts, h: ts });
}

// --- redraw ----------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: ClustersDrawState | null,
  _prev: ClustersState | null,
  state: ClustersState,
  _dir: number,
  ui: ClustersUi,
  _animTime: number,
  flashTime: number,
  hint?: HintStep<ClustersMove>,
): void {
  if (!ds) return;
  const ts = ds.tilesize;
  const { w, h, grid } = state;
  const b = border(ts);

  if (!ds.started) {
    const fullW = w * ts + 2 * b;
    const fullH = h * ts + 2 * b;
    dr.drawRect({ x: 0, y: 0, w: fullW, h: fullH }, COL_BACKGROUND);
    dr.drawUpdate({ x: 0, y: 0, w: fullW, h: fullH });
    // Outer grid frame; the per-tile COL_GRID rects draw the interior lines
    // (upstream game_redraw's first-draw block, COORD(0) − tilesize/10 == 0).
    dr.drawRect({ x: 0, y: 0, w: fullW - 1, h: fullH - 1 }, COL_GRID);
    ds.started = true;
  }

  const flash = flashTime > 0 && Math.floor(flashTime / FLASH_FRAME) % 2 === 0;

  // Live rule violations, recomputed from the committed grid every frame
  // (pure — never mutates the state's grid).
  const errorList = findErrors(grid, w, h);
  const errorSet = errorList.length > 0 ? new Set(errorList) : null;

  const dragSet = ui.dragType !== -1 && ui.drag.length > 0 ? new Set(ui.drag) : null;

  // The displayed hint step's overlay, repacked each frame (cleared when no
  // hint is on display, so a dropped hint repaints too).
  const hl = hint?.highlights as ClustersHintHighlights | undefined;
  ds.hint.clear();
  if (hl) {
    ds.hint.add(hl.target.y * w + hl.target.x, HB_TARGET);
    if (hl.danger) ds.hint.add(hl.danger.y * w + hl.danger.x, HB_DANGER);
    for (const c of hl.chain) {
      ds.hint.add(c.y * w + c.x, c.fill === F_COLOR_0 ? HB_CHAIN_0 : HB_CHAIN_1);
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let tile = grid[i];

      // In-flight paint drag previews non-given cells in the drag colour.
      if (dragSet?.has(i) && !(tile & F_SINGLE)) tile = ui.dragType;

      if (flash) tile ^= COLMASK; // swap both colours on the flash beat

      // A dragged (uncommitted) cell shows no error outline — its colour is a
      // preview, not the committed state the error check ran on.
      const error =
        !(dragSet?.has(i) && !(grid[i] & F_SINGLE)) && (errorSet?.has(i) ?? false);
      const cursor = ui.cursor && ui.cx === x && ui.cy === y;

      const packed = (tile & 0x7) | (error ? F_ERR : 0) | (cursor ? F_CUR : 0);
      if (ds.cache[i] !== packed || ds.hint.stale(i)) {
        drawTile(dr, ts, x, y, tile, error, cursor, ds.hint.packed[i]);
        ds.cache[i] = packed;
        ds.hint.commit(i);
      }
    }
  }
}
