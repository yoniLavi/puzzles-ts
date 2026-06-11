import type { Colour, Point, Size } from "../../../puzzle/types.ts";
import { mkhighlight } from "../../engine/colour-mkhighlight.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import { fill } from "./solver.ts";
import { FILLX, FILLY, type FloodMove, type FloodParams, type FloodState } from "./state.ts";

// --- tile-size-derived metrics ----------------------------------------

export const PREFERRED_TILE_SIZE = 32;

const sepWidth = (ts: number) => Math.floor(ts / 32);
const cursorInset = (ts: number) => Math.floor(ts / 8);
const highlightWidth = (ts: number) => Math.floor(ts / 10);
const border = (ts: number) => Math.floor(ts / 2);
const coord = (n: number, ts: number) => n * ts + border(ts);

const VICTORY_FLASH_FRAME = 0.03;
const DEFEAT_FLASH_FRAME = 0.1;

// --- colour palette indices -------------------------------------------

const COL_BACKGROUND = 0;
const COL_SEPARATOR = 1;
const COL_1 = 2; // COL_1..COL_10 are 2..11
const COL_HIGHLIGHT = 12;
const COL_LOWLIGHT = 13;

/** The ten fixed play colours (upstream `game_colours`), each RGB in
 * 0..1: red, yellow, green, blue, orange, purple, brown, light blue,
 * light green, pink. */
const PLAY_COLOURS: Colour[] = [
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0.2, 0.3, 1],
  [1, 0.5, 0],
  [0.5, 0, 0.7],
  [0.5, 0.3, 0.3],
  [0.4, 0.8, 1],
  [0.7, 1, 0.7],
  [1, 0.6, 1],
];

export const COLOUR_NAMES = [
  "red",
  "yellow",
  "green",
  "blue",
  "orange",
  "purple",
  "brown",
  "light blue",
  "light green",
  "pink",
];

export function colours(defaultBackground: Colour): Colour[] {
  const { background, highlight, lowlight } = mkhighlight(defaultBackground);
  const out: Colour[] = [];
  out[COL_BACKGROUND] = background;
  out[COL_SEPARATOR] = [0, 0, 0];
  for (let i = 0; i < 10; i++) out[COL_1 + i] = PLAY_COLOURS[i];
  out[COL_HIGHLIGHT] = highlight;
  out[COL_LOWLIGHT] = lowlight;
  return out;
}

export function computeSize(p: FloodParams, ts: number): Size {
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
const COLOUR_SHIFT = 11;

export interface FloodDrawState {
  started: boolean;
  tilesize: number;
  w: number;
  h: number;
  /** Per-cell cache of the last-drawn packed tile value; `-1` forces a
   * redraw (the documented no-BigInt Int32Array cache pattern). */
  grid: Int32Array;
}

export function newDrawState(state: FloodState): FloodDrawState {
  return {
    started: false,
    tilesize: 0,
    w: state.w,
    h: state.h,
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

  let colour: number;
  if (tile & BADFLASH) colour = COL_SEPARATOR;
  else colour = (tile >> COLOUR_SHIFT) + COL_1;
  dr.drawRect({ x: tx, y: ty, w: ts, h: ts }, colour);

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
      ts - 1 - inset * 2,
      ts - 1 - inset * 2,
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

/** Upstream `draw_rect_outline`: four 1px-thick edges of a rectangle. */
function drawRectOutline(
  dr: GameDrawing,
  x: number,
  y: number,
  w: number,
  h: number,
  colour: number,
): void {
  dr.drawLine({ x, y }, { x: x + w, y }, colour, 1);
  dr.drawLine({ x: x + w, y }, { x: x + w, y: y + h }, colour, 1);
  dr.drawLine({ x: x + w, y: y + h }, { x, y: y + h }, colour, 1);
  dr.drawLine({ x, y: y + h }, { x, y }, colour, 1);
}

function drawRecessedFrame(
  dr: GameDrawing,
  w: number,
  h: number,
  ts: number,
): void {
  const hw = highlightWidth(ts);
  const sep = sepWidth(ts);

  // Recessed bevel around the whole playfield (cloned from fifteen):
  // a highlight polygon (top/right) and a lowlight polygon (bottom/left).
  const hi: Point[] = [
    { x: coord(w, ts) + hw - 1, y: coord(h, ts) + hw - 1 },
    { x: coord(w, ts) + hw - 1, y: coord(0, ts) - hw },
    { x: coord(w, ts) + hw - 1 - ts, y: coord(0, ts) - hw + ts },
    { x: coord(0, ts) - hw + ts, y: coord(h, ts) + hw - 1 - ts },
    { x: coord(0, ts) - hw, y: coord(h, ts) + hw - 1 },
  ];
  dr.drawPolygon(hi, COL_HIGHLIGHT, COL_HIGHLIGHT);

  const lo: Point[] = [
    { x: coord(0, ts) - hw, y: coord(0, ts) - hw },
    { x: coord(w, ts) + hw - 1, y: coord(0, ts) - hw },
    { x: coord(w, ts) + hw - 1 - ts, y: coord(0, ts) - hw + ts },
    { x: coord(0, ts) - hw + ts, y: coord(h, ts) + hw - 1 - ts },
    { x: coord(0, ts) - hw, y: coord(h, ts) + hw - 1 },
  ];
  dr.drawPolygon(lo, COL_LOWLIGHT, COL_LOWLIGHT);

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
  ds: FloodDrawState | null,
  _prev: FloodState | null,
  state: FloodState,
  _dir: number,
  ui: FloodUiLike,
  _animTime: number,
  flashTime: number,
  activeHint?: HintStep<FloodMove>,
): void {
  if (!ds) return;
  const ts = ds.tilesize;
  const { w, h, colours: ncolours } = state;
  const wh = w * h;

  if (!ds.started) {
    // The engine paints no pixels of its own; fill our own background.
    const size = computeSize({ w, h, colours: ncolours, leniency: 0 }, ts);
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_BACKGROUND);
    drawRecessedFrame(dr, w, h, ts);
    ds.started = true;
  }

  // Flash type follows the terminal status: a completed board flashes
  // the victory rainbow, a lost board the defeat blink (design D8).
  let flashframe = -1;
  let victory = false;
  if (flashTime > 0) {
    victory = state.complete;
    const frame = victory ? VICTORY_FLASH_FRAME : DEFEAT_FLASH_FRAME;
    flashframe = Math.floor(flashTime / frame);
  }

  // Build the display grid (a mutable copy we may overlay onto).
  const grid = Uint8Array.from(state.grid);

  // Hint overlay: highlight every square of the next fill's colour that
  // is adjacent to the controlled region (upstream's SOLNNEXT). Compute
  // it as upstream does: fill to the target, fill again in a sentinel
  // colour (= ncolours, out of range), then revert anything that was not
  // originally the target colour. Sentinel-coloured cells are SOLNNEXT.
  let solnmove = 0;
  const showSoln =
    activeHint !== undefined &&
    activeHint.move.type === "fill" &&
    !state.complete &&
    state.grid[FILLY * w + FILLX] !== activeHint.move.colour;
  if (showSoln && activeHint?.move.type === "fill") {
    solnmove = activeHint.move.colour;
    const queue = new Int32Array(wh);
    fill(w, h, grid, FILLX, FILLY, solnmove, queue);
    fill(w, h, grid, FILLX, FILLY, ncolours, queue);
    for (let i = 0; i < wh; i++)
      if (grid[i] === ncolours && state.grid[i] !== solnmove) grid[i] = state.grid[i];
  }

  // Victory rainbow: superimpose the radiating colour wave.
  if (flashframe >= 0 && victory) {
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        const flashpos = flashframe - (Math.abs(x - FILLX) + Math.abs(y - FILLY));
        if (flashpos >= 0 && flashpos < ncolours) grid[y * w + x] = flashpos;
      }
    }
  }

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const pos = y * w + x;
      let tile: number;
      if (grid[pos] === ncolours) {
        tile = (solnmove << COLOUR_SHIFT) | SOLNNEXT;
      } else {
        tile = grid[pos] << COLOUR_SHIFT;
      }

      if (x === 0 || grid[pos - 1] !== grid[pos]) tile |= BORDER_L;
      if (x === w - 1 || grid[pos + 1] !== grid[pos]) tile |= BORDER_R;
      if (y === 0 || grid[pos - w] !== grid[pos]) tile |= BORDER_U;
      if (y === h - 1 || grid[pos + w] !== grid[pos]) tile |= BORDER_D;
      if (x === 0 || y === 0 || grid[pos - w - 1] !== grid[pos]) tile |= CORNER_UL;
      if (x === w - 1 || y === 0 || grid[pos - w + 1] !== grid[pos]) tile |= CORNER_UR;
      if (x === 0 || y === h - 1 || grid[pos + w - 1] !== grid[pos]) tile |= CORNER_DL;
      if (x === w - 1 || y === h - 1 || grid[pos + w + 1] !== grid[pos])
        tile |= CORNER_DR;
      if (ui.cursorVisible && ui.cx === x && ui.cy === y) tile |= CURSOR;
      if (flashframe >= 0 && !victory && flashframe !== 1) tile |= BADFLASH;

      if (ds.grid[pos] !== tile) {
        drawTile(dr, ts, x, y, tile);
        ds.grid[pos] = tile;
      }
    }
  }
}

/** Minimal shape `redraw` reads from the UI (kept structural so the
 * render module needn't import the full `FloodUi`). */
interface FloodUiLike {
  cursorVisible: boolean;
  cx: number;
  cy: number;
}
