import type { Colour, Point, Size } from "../../../puzzle/types.ts";
import { mkhighlight } from "../../engine/colour-mkhighlight.ts";
import type { GameDrawing } from "../../engine/game.ts";
import type { SamegameState, SamegameUi } from "./state.ts";

// --- tile-size metrics ------------------------------------------------

export const PREFERRED_TILE_SIZE = 32;
const HIGHLIGHT_WIDTH = 2;
const FLASH_FRAME = 0.13;

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

// --- colour palette indices -------------------------------------------

const COL_BACKGROUND = 0;
const COL_1 = 1; // COL_1..COL_9 are 1..9
const COL_IMPOSSIBLE = 10;
const COL_SEL = 11;
const COL_HIGHLIGHT = 12;
const COL_LOWLIGHT = 13;
const NCOLOURS = 14;

/** The nine fixed play colours (upstream `game_colours`), each RGB 0..1. */
const PLAY_COLOURS: Colour[] = [
  [0, 0, 1], // 1 blue
  [0, 0.5, 0], // 2 green
  [1, 0, 0], // 3 red
  [0.7, 0.7, 0], // 4 yellow
  [1, 0, 1], // 5 magenta
  [0, 0.8, 0.8], // 6 cyan
  [0.5, 0.5, 1], // 7 light blue
  [0.2, 0.8, 0.2], // 8 light green
  [1, 0.5, 0.5], // 9 pink
];

export function colours(defaultBackground: Colour): Colour[] {
  const { background, highlight, lowlight } = mkhighlight(defaultBackground);
  const out: Colour[] = new Array<Colour>(NCOLOURS);
  out[COL_BACKGROUND] = background;
  for (let i = 0; i < 9; i++) out[COL_1 + i] = PLAY_COLOURS[i];
  out[COL_IMPOSSIBLE] = [0, 0, 0];
  out[COL_SEL] = [1, 1, 1];
  out[COL_HIGHLIGHT] = highlight;
  out[COL_LOWLIGHT] = lowlight;
  return out;
}

export function computeSize(p: { w: number; h: number }, ts: number): Size {
  // game_compute_size: TILE_SIZE*n + 2*BORDER - TILE_GAP.
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
  w: number;
  h: number;
  /** Last-drawn background colour index (flash drives this globally). */
  bgcolour: number;
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
    w: state.w,
    h: state.h,
    bgcolour: -1,
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
 * `tile_redraw`). If we share a colour with our right / down / diagonal
 * neighbour the corresponding gap is filled, so a connected region paints
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
  bgcolour: number,
): void {
  const ts = ds.tilesize;
  const inner = ds.tileinner;
  const tgap = ds.tilegap;
  const col = tile & TILE_COLMASK;

  let outerCol = bgcolour;
  let innerCol = bgcolour;
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
  if (outerW !== tileW || outerH !== tileH || outerCol === bgcolour)
    dr.drawRect({ x: cx, y: cy, w: tileW, h: tileH }, bgcolour);
  // Draw the piece.
  if (outerCol !== bgcolour)
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
    outerCol !== bgcolour &&
    tgap !== 0
  )
    dr.drawRect({ x: cx + inner, y: cy + inner, w: tgap, h: tgap }, bgcolour);

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
  const HW = HIGHLIGHT_WIDTH;
  const g = gap(ts);
  const right = coord(w, ts) + HW - 1 - g;
  const bottom = coord(h, ts) + HW - 1 - g;
  const left = coord(0, ts) - HW;
  const top = coord(0, ts) - HW;

  const highlight: Point[] = [
    { x: right, y: bottom },
    { x: right, y: top },
    { x: right - ts, y: top + ts },
    { x: left + ts, y: bottom - ts },
    { x: left, y: bottom },
  ];
  dr.drawPolygon(highlight, COL_HIGHLIGHT, COL_HIGHLIGHT);

  const lowlight: Point[] = [
    { x: left, y: top },
    { x: right, y: top },
    { x: right - ts, y: top + ts },
    { x: left + ts, y: bottom - ts },
    { x: left, y: bottom },
  ];
  dr.drawPolygon(lowlight, COL_LOWLIGHT, COL_LOWLIGHT);
}

export function redraw(
  dr: GameDrawing,
  ds: SamegameDrawState | null,
  _prev: SamegameState | null,
  state: SamegameState,
  _dir: number,
  ui: SamegameUi,
  _animTime: number,
  flashTime: number,
): void {
  if (!ds) return;
  const ts = ds.tilesize;
  const { w, h } = state;

  if (!ds.started) {
    // The engine paints no pixels of its own; fill our own background.
    const size = computeSize({ w, h }, ts);
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_BACKGROUND);
    drawRecessedFrame(dr, w, h, ts);
    ds.started = true;
  }

  let bgcolour: number;
  if (flashTime > 0) {
    const frame = Math.floor(flashTime / FLASH_FRAME);
    bgcolour = frame % 2 ? COL_LOWLIGHT : COL_HIGHLIGHT;
  } else {
    bgcolour = COL_BACKGROUND;
  }
  const bgChanged = ds.bgcolour !== bgcolour;

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
        ui.displaySel &&
        ui.xsel === x &&
        ui.ysel === y &&
        !(state.complete || state.impossible)
      )
        tile |= TILE_HASSEL;

      if (ds.grid[i] !== tile || bgChanged) {
        tileRedraw(dr, ds, x, y, dright, dbelow, tile, bgcolour);
        ds.grid[i] = tile;
      }
    }
  }
  ds.bgcolour = bgcolour;
}
