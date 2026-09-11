import { mkhighlight } from "../../engine/color/color-mkhighlight.ts";
import { TEN } from "../../engine/color/colors.ts";
import { INK, PAPER } from "../../engine/color/palette.ts";
import { drawRecessedBorder } from "../../engine/draw.ts";
import type { GameDrawing } from "../../engine/game.ts";
import type { Color, Size } from "../../engine/types.ts";
import type { SamegameState, SamegameUi } from "./state.ts";

// --- tile-size metrics ------------------------------------------------

export const PREFERRED_TILE_SIZE = 32;
const HIGHLIGHT_WIDTH = 2;
export const FLASH_FRAME = 0.13;

/** `TILE_GAP` for a given full tile size (`game_set_size`). */
const gap = (ts: number) => Math.floor((ts + 8) / 16);
/** `BORDER` = half a full tile (the non-NARROW_BORDERS path). */
const border = (ts: number) => Math.floor(ts / 2);
/** `COORD(n)` — top-left pixel of cell `n` along one axis. */
const coord = (n: number, ts: number) => n * ts + border(ts);

// --- tile flags (packed into the per-cell render cache) ---------------

const TILE_COLMASK = 0x00ff;
const TILE_SELECTED = 0x0100;
const TILE_JOINRIGHT = 0x0200;
const TILE_JOINDOWN = 0x0400;
const TILE_JOINDIAG = 0x0800;
const TILE_HASSEL = 0x1000;
const TILE_IMPOSSIBLE = 0x2000;

// --- color palette indices -------------------------------------------

const COL_BACKGROUND = 0;
const COL_1 = 1; // COL_1..COL_9 are 1..9
const COL_IMPOSSIBLE = 10;
const COL_SEL = 11;
const COL_HIGHLIGHT = 12;
const COL_LOWLIGHT = 13;
const NCOLORS = 14;

export function colors(defaultBackground: Color): Color[] {
  const { background, highlight, lowlight } = mkhighlight(defaultBackground);
  const out: Color[] = new Array<Color>(NCOLORS);
  out[COL_BACKGROUND] = background;
  for (let i = 0; i < 9; i++) out[COL_1 + i] = TEN[i];
  out[COL_IMPOSSIBLE] = INK;
  out[COL_SEL] = PAPER;
  out[COL_HIGHLIGHT] = highlight;
  out[COL_LOWLIGHT] = lowlight;
  return out;
}

export function computeSize(p: { w: number; h: number }, ts: number): Size {
  return {
    w: ts * p.w + 2 * border(ts) - gap(ts),
    h: ts * p.h + 2 * border(ts) - gap(ts),
  };
}

// --- draw state -------------------------------------------------------

export interface SamegameDrawState {
  started: boolean;
  /** Full tile size (`TILE_SIZE`). */
  tilesize: number;
  tileinner: number;
  tilegap: number;
  /** Last-drawn background color index (flash drives this globally). */
  bgcolor: number;
  /** Per-cell cache of the last-drawn packed tile value; `-1` forces a
   * redraw (the no-BigInt Int32Array cache pattern). */
  grid: Int32Array;
}

export function newDrawState(state: SamegameState): SamegameDrawState {
  return {
    started: false,
    tilesize: 0,
    tileinner: 0,
    tilegap: 0,
    bgcolor: -1,
    grid: new Int32Array(state.w * state.h).fill(-1),
  };
}

export function setTileSize(ds: SamegameDrawState, ts: number): void {
  ds.tilesize = ts;
  ds.tilegap = gap(ts);
  ds.tileinner = ts - ds.tilegap;
}

// --- tile drawing -----------------------------------------------------

/**
 * Draw one tile and the gaps to its right and below (upstream
 * `tile_redraw`). If we share a color with our right / down / diagonal
 * neighbor the corresponding gap is filled, so a connected region paints
 * as a single seamless block.
 */
function tileRedraw(
  dr: GameDrawing,
  ds: SamegameDrawState,
  x: number,
  y: number,
  dright: boolean,
  dbelow: boolean,
  tile: number,
  bgcolor: number,
): void {
  const ts = ds.tilesize;
  const inner = ds.tileinner;
  const tgap = ds.tilegap;
  const col = tile & TILE_COLMASK;

  let outerCol = bgcolor;
  let innerCol = bgcolor;
  if (col) {
    if (tile & TILE_IMPOSSIBLE) {
      outerCol = col;
      innerCol = COL_IMPOSSIBLE;
    } else if (tile & TILE_SELECTED) {
      outerCol = COL_SEL;
      innerCol = col;
    } else {
      outerCol = col;
      innerCol = col;
    }
  }

  const tileW = dright ? ts : inner;
  const tileH = dbelow ? ts : inner;
  const outerW = tile & TILE_JOINRIGHT ? tileW : inner;
  const outerH = tile & TILE_JOINDOWN ? tileH : inner;
  const cx = coord(x, ts);
  const cy = coord(y, ts);

  // Draw the background if any of it will be visible.
  if (outerW !== tileW || outerH !== tileH || outerCol === bgcolor)
    dr.drawRect({ x: cx, y: cy, w: tileW, h: tileH }, bgcolor);
  // Draw the piece.
  if (outerCol !== bgcolor)
    dr.drawRect({ x: cx, y: cy, w: outerW, h: outerH }, outerCol);
  if (innerCol !== outerCol)
    dr.drawRect(
      {
        x: cx + Math.floor(inner / 4),
        y: cy + Math.floor(inner / 4),
        w: Math.floor(inner / 2),
        h: Math.floor(inner / 2),
      },
      innerCol,
    );
  // Reset the bottom-right corner if we join right & down but not diag.
  if (
    (tile & (TILE_JOINRIGHT | TILE_JOINDOWN | TILE_JOINDIAG)) ===
      (TILE_JOINRIGHT | TILE_JOINDOWN) &&
    outerCol !== bgcolor &&
    tgap !== 0
  )
    dr.drawRect({ x: cx + inner, y: cy + inner, w: tgap, h: tgap }, bgcolor);

  if (tile & TILE_HASSEL) {
    const sx = cx + 2;
    const sy = cy + 2;
    const ssz = inner - 5;
    const scol = outerCol === COL_SEL ? COL_LOWLIGHT : COL_HIGHLIGHT;
    dr.drawLine({ x: sx, y: sy }, { x: sx + ssz, y: sy }, scol, 1);
    dr.drawLine({ x: sx + ssz, y: sy }, { x: sx + ssz, y: sy + ssz }, scol, 1);
    dr.drawLine({ x: sx + ssz, y: sy + ssz }, { x: sx, y: sy + ssz }, scol, 1);
    dr.drawLine({ x: sx, y: sy + ssz }, { x: sx, y: sy }, scol, 1);
  }

  dr.drawUpdate({ x: cx, y: cy, w: ts, h: ts });
}

/** The recessed bevel around the whole playfield (cloned from fifteen). */
function drawRecessedFrame(dr: GameDrawing, w: number, h: number, ts: number): void {
  const g = gap(ts);
  drawRecessedBorder(
    dr,
    {
      left: coord(0, ts) - HIGHLIGHT_WIDTH,
      top: coord(0, ts) - HIGHLIGHT_WIDTH,
      right: coord(w, ts) + HIGHLIGHT_WIDTH - 1 - g,
      bottom: coord(h, ts) + HIGHLIGHT_WIDTH - 1 - g,
    },
    ts,
    COL_HIGHLIGHT,
    COL_LOWLIGHT,
  );
}

export function redraw(
  dr: GameDrawing,
  ds: SamegameDrawState,
  _prev: SamegameState | null,
  state: SamegameState,
  _dir: number,
  ui: SamegameUi,
  _animTime: number,
  flashTime: number,
): void {
  const ts = ds.tilesize;
  const { w, h } = state;

  if (!ds.started) {
    // The engine paints no pixels of its own; fill our own background.
    const size = computeSize({ w, h }, ts);
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_BACKGROUND);
    drawRecessedFrame(dr, w, h, ts);
    ds.started = true;
  }

  let bgcolor: number;
  if (flashTime > 0) {
    const frame = Math.floor(flashTime / FLASH_FRAME);
    bgcolor = frame % 2 ? COL_LOWLIGHT : COL_HIGHLIGHT;
  } else {
    bgcolor = COL_BACKGROUND;
  }
  const bgChanged = ds.bgcolor !== bgcolor;

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const i = y * w + x;
      const col = state.tiles[i];
      let tile = col;
      const dright = x + 1 < w;
      const dbelow = y + 1 < h;

      if (ui.selected[i]) tile |= TILE_SELECTED;
      if (state.impossible) tile |= TILE_IMPOSSIBLE;
      if (dright && state.tiles[i + 1] === col) tile |= TILE_JOINRIGHT;
      if (dbelow && state.tiles[i + w] === col) tile |= TILE_JOINDOWN;
      if (
        tile & TILE_JOINRIGHT &&
        tile & TILE_JOINDOWN &&
        state.tiles[i + w + 1] === col
      )
        tile |= TILE_JOINDIAG;
      // Hide the keyboard cursor on a finished (complete/impossible) board.
      if (
        ui.cursor.visible &&
        ui.cursor.x === x &&
        ui.cursor.y === y &&
        !(state.completed || state.impossible)
      )
        tile |= TILE_HASSEL;

      if (ds.grid[i] !== tile || bgChanged) {
        tileRedraw(dr, ds, x, y, dright, dbelow, tile, bgcolor);
        ds.grid[i] = tile;
      }
    }
  }
  ds.bgcolor = bgcolor;
}
