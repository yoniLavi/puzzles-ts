/**
 * Sokoban rendering (upstream `game_colours` / `game_redraw` / `draw_tile`):
 * a per-tile `Int32Array` cache (the cell char plus a flash-highlight bit), grid
 * lines drawn once, walls with a bevel, targets / pits / deep pits / player /
 * barrels as discs, and capital-letter barrel labels. The engine paints no
 * pixels of its own, so Sokoban fills its own background on the first draw.
 *
 * There is no border (upstream's is a tile wide): the board is
 * `w * tilesize + 1` wide, the 1 for the closing grid line.
 */

import { mkhighlight } from "../../engine/color/color-mkhighlight.ts";
import { BROWN, GREEN } from "../../engine/color/colors.ts";
import { FLASH, GRID_MID, INK, PAPER, wallColor } from "../../engine/color/palette.ts";
import { sokobanPit } from "../../engine/color/palette-games.ts";
import { drawRaisedBevel, raisedBevelWidth } from "../../engine/draw.ts";
import type { GameDrawing } from "../../engine/game.ts";
import type { Color, Size } from "../../engine/types.ts";
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
export const FLASH_LENGTH = 0.3;

/** The flash-highlight bit ORed into the packed cache word (upstream 0x100). */
const FLASH_BIT = 0x100;
/** Cache sentinel that forces a redraw (upstream INVALID = '!'). */
const CACHE_INVALID = -1;

// --- palette (upstream's enum order: augmentation.ts keys its dark-mode swap
// of the bevel colors, 9 and 10, by index) -------------------------------

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
/** Appended past the upstream enum, which flashed the floor to its own bevel
 * highlight; the index-keyed swap above never reaches it. */
const COL_FLASH = 12;
const NCOLORS = 13;

export function colors(defaultBackground: Color): Color[] {
  const { background, highlight, lowlight } = mkhighlight(defaultBackground);
  const out: Color[] = new Array<Color>(NCOLORS);
  out[COL_BACKGROUND] = background;
  out[COL_HIGHLIGHT] = highlight;
  out[COL_LOWLIGHT] = lowlight;
  out[COL_OUTLINE] = INK;
  out[COL_PLAYER] = GREEN;
  out[COL_BARREL] = BROWN;
  // A target disc: sunk into the floor, in the floor's own shadow.
  out[COL_TARGET] = lowlight;
  out[COL_PIT] = sokobanPit(lowlight);
  out[COL_DEEP_PIT] = INK;
  out[COL_TEXT] = PAPER;
  out[COL_GRID] = GRID_MID;
  out[COL_WALL] = wallColor(background, highlight);
  out[COL_FLASH] = FLASH;
  return out;
}

export function computeSize(p: { w: number; h: number }, ts: number): Size {
  return { w: p.w * ts + 1, h: p.h * ts + 1 };
}

// --- draw state -------------------------------------------------------

export interface SokobanDrawState {
  started: boolean;
  tilesize: number;
  /** Per-cell cache of the last-drawn packed tile value (char | FLASH_BIT). */
  grid: Int32Array;
}

export function newDrawState(state: SokobanState): SokobanDrawState {
  return {
    started: false,
    tilesize: 0,
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
  const tx = x * ts;
  const ty = y * ts;
  const v = packed & 0xff;
  const center = { x: tx + Math.floor(ts / 2), y: ty + Math.floor(ts / 2) };
  const disc = (r: number, fill: number) => dr.drawCircle(center, r, fill, COL_OUTLINE);
  const floorDisc = Math.floor((ts * 3) / 7); // a target or a pit
  const pieceDisc = Math.floor(ts / 3); // the player or a barrel

  dr.clip({ x: tx + 1, y: ty + 1, w: ts - 1, h: ts - 1 });
  dr.drawRect(
    { x: tx + 1, y: ty + 1, w: ts - 1, h: ts - 1 },
    packed & FLASH_BIT ? COL_FLASH : COL_BACKGROUND,
  );

  if (v === WALL) {
    const hw = raisedBevelWidth(ts);
    // Bevel, then the wall-colored inner square. The tile body is inset by one
    // to leave the grid line showing, so the bevel follows that rect.
    drawRaisedBevel(
      dr,
      { left: tx + 1, top: ty + 1, right: tx + ts, bottom: ty + ts },
      COL_HIGHLIGHT,
      COL_LOWLIGHT,
    );
    dr.drawRect(
      { x: tx + 1 + hw, y: ty + 1 + hw, w: ts - 2 * hw, h: ts - 2 * hw },
      COL_WALL,
    );
  } else if (v === PIT) {
    disc(floorDisc, COL_PIT);
  } else if (v === DEEP_PIT) {
    disc(floorDisc, COL_DEEP_PIT);
  } else {
    if (isOnTarget(v)) disc(floorDisc, COL_TARGET);
    if (isPlayer(v)) {
      disc(pieceDisc, COL_PLAYER);
    } else if (isBarrel(v)) {
      disc(pieceDisc, COL_BARREL);
      const label = barrelLabel(v);
      if (label) {
        dr.drawText(
          center,
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
  ds: SokobanDrawState,
  _prev: SokobanState | null,
  state: SokobanState,
  _dir: number,
  _ui: unknown,
  _animTime: number,
  flashTime: number,
): void {
  const ts = ds.tilesize;
  const { w, h } = state;

  if (!ds.started) {
    const size = computeSize({ w, h }, ts);
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_BACKGROUND);
    for (let y = 0; y <= h; y++)
      dr.drawLine({ x: 0, y: y * ts }, { x: w * ts, y: y * ts }, COL_GRID, 1);
    for (let x = 0; x <= w; x++)
      dr.drawLine({ x: x * ts, y: 0 }, { x: x * ts, y: h * ts }, COL_GRID, 1);
    ds.started = true;
  }

  // Flash the background in the first and last thirds of the flash.
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
      // A hand-typed desc may carry generation's INITIAL; it draws as a wall.
      if (v === INITIAL) v = WALL;
      const packed = v | flashBit;
      if (ds.grid[y * w + x] !== packed) {
        drawTile(dr, ds, x, y, packed);
        ds.grid[y * w + x] = packed;
      }
    }
}
