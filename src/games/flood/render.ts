import { mkhighlight } from "../../engine/color/color-mkhighlight.ts";
import { BLACK, TEN, TEN_NAMES } from "../../engine/color/colors.ts";
import { drawRecessedBorder as drawBevel, drawRectOutline } from "../../engine/draw.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import type { Color, Size } from "../../engine/types.ts";
import { fill } from "./solver.ts";
import {
  FILLX,
  FILLY,
  type FloodMove,
  type FloodParams,
  type FloodState,
  type FloodUi,
} from "./state.ts";

// --- tile-size-derived metrics ----------------------------------------

export const PREFERRED_TILE_SIZE = 32;

const sepWidth = (ts: number) => Math.floor(ts / 32);
const cursorInset = (ts: number) => Math.floor(ts / 8);
const highlightWidth = (ts: number) => Math.floor(ts / 10);
const border = (ts: number) => Math.floor(ts / 2);
const coord = (n: number, ts: number) => n * ts + border(ts);

export const VICTORY_FLASH_FRAME = 0.03;
export const DEFEAT_FLASH_FRAME = 0.1;

// --- color palette indices -------------------------------------------

const COL_BACKGROUND = 0;
const COL_SEPARATOR = 1;
const COL_1 = 2; // COL_1..COL_10 are 2..11
const COL_HIGHLIGHT = 12;
const COL_LOWLIGHT = 13;

/**
 * The ten tiles, as the hint says them: *"Fill with orange"*. Re-exported from
 * the palette rather than written here, because the sentence is a claim about
 * the board and only a word and a color from the same place keep it true. A
 * scheme may restyle a tile, but not into what a player would call another color.
 */
export const COLOR_NAMES = TEN_NAMES;

export function colors(defaultBackground: Color): Color[] {
  const { background, highlight, lowlight } = mkhighlight(defaultBackground);
  const out: Color[] = [];
  out[COL_BACKGROUND] = background;
  // `BLACK`, not `INK`: the line between two tiles is drawn against the
  // tiles, not the board, and stays black under both schemes.
  out[COL_SEPARATOR] = BLACK;
  for (let i = 0; i < 10; i++) out[COL_1 + i] = TEN[i];
  out[COL_HIGHLIGHT] = highlight;
  out[COL_LOWLIGHT] = lowlight;
  return out;
}

export function computeSize(p: Pick<FloodParams, "w" | "h">, ts: number): Size {
  return { w: border(ts) * 2 + ts * p.w, h: border(ts) * 2 + ts * p.h };
}

// --- draw state -------------------------------------------------------

// Tile-flag bits, packed into the per-cell cache (upstream's `tile`).
const BORDER_L = 0x001;
const BORDER_R = 0x002;
const BORDER_U = 0x004;
const BORDER_D = 0x008;
const CORNER_UL = 0x010;
const CORNER_UR = 0x020;
const CORNER_DL = 0x040;
const CORNER_DR = 0x080;
const CURSOR = 0x100;
const BADFLASH = 0x200;
const SOLNNEXT = 0x400;
const COLOR_SHIFT = 11;

export interface FloodDrawState {
  started: boolean;
  tileSize: number;
  /** Per-cell cache of the last-drawn packed tile; `-1` forces a redraw. */
  grid: Int32Array;
}

export function newDrawState(state: FloodState): FloodDrawState {
  return {
    started: false,
    tileSize: 0,
    grid: new Int32Array(state.w * state.h).fill(-1),
  };
}

function drawTile(
  dr: GameDrawing,
  ts: number,
  x: number,
  y: number,
  tile: number,
): void {
  const tx = coord(x, ts);
  const ty = coord(y, ts);
  const sep = sepWidth(ts);

  const color = tile & BADFLASH ? COL_SEPARATOR : (tile >> COLOR_SHIFT) + COL_1;
  dr.drawRect({ x: tx, y: ty, w: ts, h: ts }, color);

  if (sep > 0) {
    if (tile & BORDER_L) dr.drawRect({ x: tx, y: ty, w: sep, h: ts }, COL_SEPARATOR);
    if (tile & BORDER_R)
      dr.drawRect({ x: tx + ts - sep, y: ty, w: sep, h: ts }, COL_SEPARATOR);
    if (tile & BORDER_U) dr.drawRect({ x: tx, y: ty, w: ts, h: sep }, COL_SEPARATOR);
    if (tile & BORDER_D)
      dr.drawRect({ x: tx, y: ty + ts - sep, w: ts, h: sep }, COL_SEPARATOR);

    if (tile & CORNER_UL) dr.drawRect({ x: tx, y: ty, w: sep, h: sep }, COL_SEPARATOR);
    if (tile & CORNER_UR)
      dr.drawRect({ x: tx + ts - sep, y: ty, w: sep, h: sep }, COL_SEPARATOR);
    if (tile & CORNER_DL)
      dr.drawRect({ x: tx, y: ty + ts - sep, w: sep, h: sep }, COL_SEPARATOR);
    if (tile & CORNER_DR)
      dr.drawRect(
        { x: tx + ts - sep, y: ty + ts - sep, w: sep, h: sep },
        COL_SEPARATOR,
      );
  }

  if (tile & CURSOR) {
    const inset = cursorInset(ts);
    drawRectOutline(
      dr,
      tx + inset,
      ty + inset,
      ts - inset * 2,
      ts - inset * 2,
      COL_SEPARATOR,
    );
  }

  if (tile & SOLNNEXT) {
    dr.drawCircle(
      { x: tx + Math.floor(ts / 2), y: ty + Math.floor(ts / 2) },
      Math.floor(ts / 6),
      COL_SEPARATOR,
      COL_SEPARATOR,
    );
  }

  dr.drawUpdate({ x: tx, y: ty, w: ts, h: ts });
}

function drawRecessedFrame(dr: GameDrawing, w: number, h: number, ts: number): void {
  const hw = highlightWidth(ts);
  const sep = sepWidth(ts);

  // Recessed bevel around the whole playfield (cloned from fifteen).
  drawBevel(
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

  // Separator frame just outside the grid.
  dr.drawRect(
    {
      x: coord(0, ts) - sep,
      y: coord(0, ts) - sep,
      w: ts * w + 2 * sep,
      h: ts * h + 2 * sep,
    },
    COL_SEPARATOR,
  );
}

export function redraw(
  dr: GameDrawing,
  ds: FloodDrawState,
  _prev: FloodState | null,
  state: FloodState,
  _dir: number,
  ui: FloodUi,
  _animTime: number,
  flashTime: number,
  activeHint?: HintStep<FloodMove>,
): void {
  const ts = ds.tileSize;
  const { w, h, colors: ncolors } = state;
  const wh = w * h;

  if (!ds.started) {
    // The engine paints no pixels of its own; fill our own background.
    dr.drawRect({ x: 0, y: 0, ...computeSize(state, ts) }, COL_BACKGROUND);
    drawRecessedFrame(dr, w, h, ts);
    ds.started = true;
  }

  // Flash type follows the terminal status: a completed board flashes
  // the victory rainbow, a lost board the defeat blink.
  let flashframe = -1;
  let victory = false;
  if (flashTime > 0) {
    victory = state.completed;
    const frame = victory ? VICTORY_FLASH_FRAME : DEFEAT_FLASH_FRAME;
    flashframe = Math.floor(flashTime / frame);
  }

  // Build the display grid (a mutable copy we may overlay onto).
  const grid = Uint8Array.from(state.grid);

  // Hint overlay: mark every square of the next fill's color that is
  // adjacent to the controlled region (upstream's SOLNNEXT), found as
  // upstream does: fill to that color, fill again in an out-of-range
  // sentinel (`ncolors`), then revert whatever was not originally that color.
  let hintColor = 0;
  const next = activeHint?.move;
  if (
    next?.type === "fill" &&
    !state.completed &&
    state.grid[FILLY * w + FILLX] !== next.color
  ) {
    hintColor = next.color;
    const queue = new Int32Array(wh);
    fill(w, h, grid, FILLX, FILLY, hintColor, queue);
    fill(w, h, grid, FILLX, FILLY, ncolors, queue);
    for (let i = 0; i < wh; i++)
      if (grid[i] === ncolors && state.grid[i] !== hintColor) grid[i] = state.grid[i];
  }

  // Victory rainbow: superimpose the radiating color wave.
  if (flashframe >= 0 && victory) {
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        const flashpos = flashframe - (Math.abs(x - FILLX) + Math.abs(y - FILLY));
        if (flashpos >= 0 && flashpos < ncolors) grid[y * w + x] = flashpos;
      }
    }
  }

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const pos = y * w + x;
      let tile =
        grid[pos] === ncolors
          ? (hintColor << COLOR_SHIFT) | SOLNNEXT
          : grid[pos] << COLOR_SHIFT;
      if (x === 0 || grid[pos - 1] !== grid[pos]) tile |= BORDER_L;
      if (x === w - 1 || grid[pos + 1] !== grid[pos]) tile |= BORDER_R;
      if (y === 0 || grid[pos - w] !== grid[pos]) tile |= BORDER_U;
      if (y === h - 1 || grid[pos + w] !== grid[pos]) tile |= BORDER_D;
      if (x === 0 || y === 0 || grid[pos - w - 1] !== grid[pos]) tile |= CORNER_UL;
      if (x === w - 1 || y === 0 || grid[pos - w + 1] !== grid[pos]) tile |= CORNER_UR;
      if (x === 0 || y === h - 1 || grid[pos + w - 1] !== grid[pos]) tile |= CORNER_DL;
      if (x === w - 1 || y === h - 1 || grid[pos + w + 1] !== grid[pos])
        tile |= CORNER_DR;
      if (ui.cursor.visible && ui.cursor.x === x && ui.cursor.y === y) tile |= CURSOR;
      if (flashframe >= 0 && !victory && flashframe !== 1) tile |= BADFLASH;

      if (ds.grid[pos] !== tile) {
        drawTile(dr, ts, x, y, tile);
        ds.grid[pos] = tile;
      }
    }
  }
}
