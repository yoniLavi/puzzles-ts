/**
 * Sokoban rendering (upstream `game_colours` / `game_redraw` / `draw_tile`).
 *
 * Faithful baseline: per-tile `Int32Array` cache (the packed value is the cell
 * char plus a flash-highlight bit), grid lines drawn once, walls with a bevel,
 * targets / pits / deep-pits / player / barrels as discs, and capital-letter
 * barrel labels. The engine paints no pixels of its own, so Sokoban fills its
 * own background in the first-draw branch (playbook rendering doctrine).
 *
 * Border geometry: the web build defines `NARROW_BORDERS`, so `BORDER = 0`
 * (design D5, docs/games/rendering.md § "The tile cache and the diff key") — the whole board is `w*TILESIZE + 1` wide.
 */

import { mkhighlight } from "../../engine/colour/colour-mkhighlight.ts";
import { BROWN, GREEN } from "../../engine/colour/colours.ts";
import { INK, PAPER, wallColour } from "../../engine/colour/palette.ts";
import { sokobanPit } from "../../engine/colour/palette-games.ts";
import type { GameDrawing } from "../../engine/game.ts";
import type { Colour, Size } from "../../engine/types.ts";
import {
  barrelLabel,
  DEEP_PIT,
  INITIAL,
  isBarrel,
  isOnTarget,
  isPlayer,
  PIT,
  PLAYER,
  PLAYERTARGET,
  type SokobanState,
  TARGET,
  WALL,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 32;
const BORDER = 0; // NARROW_BORDERS
const FLASH_LENGTH = 0.3;

/** The flash-highlight bit ORed into the packed cache word (upstream 0x100). */
const FLASH_BIT = 0x100;
/** Cache sentinel that forces a redraw (upstream INVALID = '!'). */
const CACHE_INVALID = -1;

// --- palette (indices C-identical — augmentation.ts keys dark-mode swaps
// by index [[9,10]], so these must match the upstream enum order) ---------

const COL_BACKGROUND = 0;
const COL_TARGET = 1;
const COL_PIT = 2;
const COL_DEEP_PIT = 3;
const COL_BARREL = 4;
const COL_PLAYER = 5;
const COL_TEXT = 6;
const COL_GRID = 7;
const COL_OUTLINE = 8;
const COL_HIGHLIGHT = 9;
const COL_LOWLIGHT = 10;
const COL_WALL = 11;
const NCOLOURS = 12;

export function colours(defaultBackground: Colour): Colour[] {
  const { background, highlight, lowlight } = mkhighlight(defaultBackground);
  const out: Colour[] = new Array<Colour>(NCOLOURS);
  out[COL_BACKGROUND] = background;
  out[COL_HIGHLIGHT] = highlight;
  out[COL_LOWLIGHT] = lowlight;
  out[COL_OUTLINE] = INK;
  out[COL_PLAYER] = GREEN;
  out[COL_BARREL] = BROWN;
  out[COL_TARGET] = [...lowlight];
  out[COL_PIT] = sokobanPit(lowlight);
  out[COL_DEEP_PIT] = INK;
  out[COL_TEXT] = PAPER;
  out[COL_GRID] = [...lowlight];
  out[COL_WALL] = wallColour(background, highlight);
  return out;
}

// --- sizing -----------------------------------------------------------

const coord = (n: number, ts: number): number => n * ts + BORDER;

export function computeSize(p: { w: number; h: number }, ts: number): Size {
  return { w: 2 * BORDER + 1 + p.w * ts, h: 2 * BORDER + 1 + p.h * ts };
}

// --- draw state -------------------------------------------------------

export interface SokobanDrawState {
  started: boolean;
  tilesize: number;
  w: number;
  h: number;
  /** Per-cell cache of the last-drawn packed tile value (char | FLASH_BIT);
   * `-1` forces a redraw (the no-BigInt Int32Array cache pattern). */
  grid: Int32Array;
}

export function newDrawState(state: SokobanState): SokobanDrawState {
  return {
    started: false,
    tilesize: 0,
    w: state.w,
    h: state.h,
    grid: new Int32Array(state.w * state.h).fill(CACHE_INVALID),
  };
}

export function setTileSize(ds: SokobanDrawState, ts: number): void {
  ds.tilesize = ts;
}

// --- tile drawing -----------------------------------------------------

function drawTile(
  dr: GameDrawing,
  ds: SokobanDrawState,
  x: number,
  y: number,
  packed: number,
): void {
  const ts = ds.tilesize;
  const tx = coord(x, ts);
  const ty = coord(y, ts);
  const bg = packed & FLASH_BIT ? COL_HIGHLIGHT : COL_BACKGROUND;
  const v = packed & 0xff;

  dr.clip({ x: tx + 1, y: ty + 1, w: ts - 1, h: ts - 1 });
  dr.drawRect({ x: tx + 1, y: ty + 1, w: ts - 1, h: ts - 1 }, bg);

  if (v === WALL) {
    const hw = Math.floor(ts / 10); // HIGHLIGHT_WIDTH
    // Bevel: a lowlight triangle bottom-right, a highlight triangle top-left,
    // then the wall-coloured inner square.
    dr.drawPolygon(
      [
        { x: tx + ts, y: ty + ts },
        { x: tx + ts, y: ty + 1 },
        { x: tx + 1, y: ty + ts },
      ],
      COL_LOWLIGHT,
      COL_LOWLIGHT,
    );
    dr.drawPolygon(
      [
        { x: tx + 1, y: ty + 1 },
        { x: tx + ts, y: ty + 1 },
        { x: tx + 1, y: ty + ts },
      ],
      COL_HIGHLIGHT,
      COL_HIGHLIGHT,
    );
    dr.drawRect(
      { x: tx + 1 + hw, y: ty + 1 + hw, w: ts - 2 * hw, h: ts - 2 * hw },
      COL_WALL,
    );
  } else if (v === PIT) {
    dr.drawCircle(
      { x: tx + Math.floor(ts / 2), y: ty + Math.floor(ts / 2) },
      Math.floor((ts * 3) / 7),
      COL_PIT,
      COL_OUTLINE,
    );
  } else if (v === DEEP_PIT) {
    dr.drawCircle(
      { x: tx + Math.floor(ts / 2), y: ty + Math.floor(ts / 2) },
      Math.floor((ts * 3) / 7),
      COL_DEEP_PIT,
      COL_OUTLINE,
    );
  } else {
    if (isOnTarget(v)) {
      dr.drawCircle(
        { x: tx + Math.floor(ts / 2), y: ty + Math.floor(ts / 2) },
        Math.floor((ts * 3) / 7),
        COL_TARGET,
        COL_OUTLINE,
      );
    }
    if (isPlayer(v)) {
      dr.drawCircle(
        { x: tx + Math.floor(ts / 2), y: ty + Math.floor(ts / 2) },
        Math.floor(ts / 3),
        COL_PLAYER,
        COL_OUTLINE,
      );
    } else if (isBarrel(v)) {
      dr.drawCircle(
        { x: tx + Math.floor(ts / 2), y: ty + Math.floor(ts / 2) },
        Math.floor(ts / 3),
        COL_BARREL,
        COL_OUTLINE,
      );
      const label = barrelLabel(v);
      if (label) {
        dr.drawText(
          { x: tx + Math.floor(ts / 2), y: ty + Math.floor(ts / 2) },
          {
            align: "center",
            baseline: "mathematical",
            fontType: "variable",
            size: Math.floor(ts / 2),
          },
          COL_TEXT,
          String.fromCharCode(label),
        );
      }
    }
  }

  dr.unclip();
  dr.drawUpdate({ x: tx, y: ty, w: ts, h: ts });
}

// --- redraw -----------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: SokobanDrawState | null,
  _prev: SokobanState | null,
  state: SokobanState,
  _dir: number,
  _ui: unknown,
  _animTime: number,
  flashTime: number,
): void {
  if (!ds) return;
  const ts = ds.tilesize;
  const { w, h } = state;

  if (!ds.started) {
    // The engine paints no pixels of its own; fill our own background, then
    // draw the grid lines once.
    const size = computeSize({ w, h }, ts);
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_BACKGROUND);
    for (let y = 0; y <= h; y++)
      dr.drawLine(
        { x: coord(0, ts), y: coord(y, ts) },
        { x: coord(w, ts), y: coord(y, ts) },
        COL_GRID,
        1,
      );
    for (let x = 0; x <= w; x++)
      dr.drawLine(
        { x: coord(x, ts), y: coord(0, ts) },
        { x: coord(x, ts), y: coord(h, ts) },
        COL_GRID,
        1,
      );
    ds.started = true;
  }

  // Flash the background on the first, third, … of six sub-frames.
  const flashBit =
    flashTime > 0 && Math.floor((flashTime * 3) / FLASH_LENGTH) % 2 === 0
      ? FLASH_BIT
      : 0;

  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = state.grid[y * w + x];
      if (y === state.py && x === state.px) {
        v = v === TARGET ? PLAYERTARGET : PLAYER;
      }
      // A leftover INITIAL is a wall (should never appear in a real state,
      // but keep the draw total).
      if (v === INITIAL) v = WALL;
      const packed = (v & 0xff) | flashBit;
      if (ds.grid[y * w + x] !== packed) {
        drawTile(dr, ds, x, y, packed);
        ds.grid[y * w + x] = packed;
      }
    }
}
