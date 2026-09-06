/**
 * Fifteen's renderer: the beveled tiles, the recessed playfield border, and the
 * two-pass sliding animation.
 *
 * The board's pixel origin lives here and `interpretMove` imports it — one
 * function, both callers (`docs/games/mechanics.md`).
 */

import { mkhighlight } from "../../engine/color/color-mkhighlight.ts";
import { HINT_ACTION, INK } from "../../engine/color/palette.ts";
import {
  drawRecessedBorder as drawBevel,
  drawRaisedBevel,
  raisedBevelWidth,
} from "../../engine/draw.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import { coord as coordE, fromCoord as fromCoordE } from "../../engine/geometry.ts";
import type { Color, Size } from "../../engine/types.ts";
import type { FifteenMove, FifteenParams, FifteenState, FifteenUi } from "./state.ts";

// --- constants --------------------------------------------------------

export const PREFERRED_TILE_SIZE = 48;
export const ANIM_TIME = 0.13;
export const FLASH_FRAME = 0.13;

// --- color indices ---------------------------------------------------

const COL_BACKGROUND = 0;
const COL_TEXT = 1;
const COL_HIGHLIGHT = 2;
const COL_LOWLIGHT = 3;
const COL_HINT = 4;

// --- hint highlights --------------------------------------------------

/** Highlight data for a Fifteen hint step: the tile that should slide
 * into the gap. The renderer fills that tile's cell with `COL_HINT`. */
export interface FifteenHintHighlights {
  tile: number;
}

// --- coordinate helpers -----------------------------------------------

function border(ts: number): number {
  return Math.floor(ts / 2);
}

function coord(pos: number, ts: number): number {
  return coordE(pos, ts, border(ts));
}

export function fromCoord(pixel: number, ts: number): number {
  return fromCoordE(pixel, ts, border(ts));
}

// --- drawing ----------------------------------------------------------

export interface FifteenDrawState {
  started: boolean;
  w: number;
  h: number;
  bgcolor: number;
  /** Per-cell cache of the last-drawn tile value; `-1` forces a redraw
   * (unknown, or animating). */
  tiles: Int32Array;
  tilesize: number;
  /** Tile value currently highlighted as a hint, or null. */
  hintTile: number | null;
}

export function newDrawState(state: FifteenState): FifteenDrawState {
  return {
    started: false,
    w: state.w,
    h: state.h,
    bgcolor: COL_BACKGROUND,
    tiles: new Int32Array(state.n).fill(-1),
    tilesize: 0,
    hintTile: null,
  };
}

export function computeSize(p: FifteenParams, ts: number): Size {
  const b = border(ts);
  return { w: ts * p.w + 2 * b, h: ts * p.h + 2 * b };
}

export function colors(defaultBackground: Color): Color[] {
  const { background, highlight, lowlight } = mkhighlight(defaultBackground);
  const out: Color[] = [];
  out[COL_BACKGROUND] = background;
  out[COL_TEXT] = INK;
  out[COL_HIGHLIGHT] = highlight;
  out[COL_LOWLIGHT] = lowlight;
  out[COL_HINT] = HINT_ACTION;
  return out;
}

function drawTile(
  dr: GameDrawing,
  ts: number,
  hw: number,
  x: number,
  y: number,
  tile: number,
  bgColor: number,
): void {
  if (tile === 0) {
    dr.drawRect({ x, y, w: ts, h: ts }, bgColor);
  } else {
    drawRaisedBevel(
      dr,
      { left: x, top: y, right: x + ts - 1, bottom: y + ts - 1 },
      COL_HIGHLIGHT,
      COL_LOWLIGHT,
    );
    // Center fill.
    dr.drawRect({ x: x + hw, y: y + hw, w: ts - 2 * hw, h: ts - 2 * hw }, bgColor);
    // Number.
    dr.drawText(
      { x: x + Math.floor(ts / 2), y: y + Math.floor(ts / 2) },
      { align: "center", baseline: "mathematical", fontType: "variable", size: ts / 3 },
      COL_TEXT,
      String(tile),
    );
  }
  dr.drawUpdate({ x, y, w: ts, h: ts });
}

function drawRecessedBorder(
  dr: GameDrawing,
  w: number,
  h: number,
  ts: number,
  hw: number,
): void {
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
}

export function redraw(
  dr: GameDrawing,
  ds: FifteenDrawState,
  prev: FifteenState | null,
  state: FifteenState,
  _dir: number,
  _ui: FifteenUi,
  animTime: number,
  flashTime: number,
  activeHint?: HintStep<FifteenMove, FifteenHintHighlights>,
): void {
  const ts = ds.tilesize;
  const { w, h, n } = state;
  const hw = raisedBevelWidth(ts);

  let bgcolor = COL_BACKGROUND;
  if (flashTime > 0) {
    const frame = Math.floor(flashTime / FLASH_FRAME);
    bgcolor = frame % 2 ? COL_LOWLIGHT : COL_HIGHLIGHT;
  }

  if (!ds.started) {
    // The engine paints no pixels of its own: fill our own background
    // (the recessed border leaves a margin around the playfield).
    const size = computeSize({ w, h }, ts);
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_BACKGROUND);
    drawRecessedBorder(dr, w, h, ts, hw);
    ds.started = true;
  }

  const hintTile = activeHint?.highlights?.tile ?? null;

  // Two passes so a whole sliding line animates cleanly: pass 0 blanks
  // the cells vacated by moving tiles, pass 1 draws the moving tiles
  // interpolated toward the gap.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      // A cell whose tile differs from the previous state is animating
      // (-1 = "always redraw"); otherwise it shows its settled value.
      let t = prev && prev.tiles[i] !== state.tiles[i] ? -1 : state.tiles[i];
      const t0 = t;

      if (
        ds.bgcolor !== bgcolor ||
        ds.hintTile !== hintTile ||
        ds.tiles[i] !== t ||
        ds.tiles[i] === -1 ||
        t === -1
      ) {
        let x: number;
        let y: number;

        if (t === -1) {
          if (pass === 0) {
            // Blank the vacated cell.
            x = coord(i % w, ts);
            y = coord(Math.floor(i / w), ts);
            t = 0;
          } else {
            t = state.tiles[i];
            // Don't draw the moving gap; just leave it blank.
            if (t === 0) continue;

            const x1 = coord(i % w, ts);
            const y1 = coord(Math.floor(i / w), ts);
            // Find where this tile was in the previous state.
            let j = 0;
            for (; j < (prev as FifteenState).n; j++) {
              if ((prev as FifteenState).tiles[j] === state.tiles[i]) break;
            }
            const x0 = coord(j % w, ts);
            const y0 = coord(Math.floor(j / w), ts);

            let c = animTime / ANIM_TIME;
            c = Math.max(0, Math.min(1, c));
            x = x0 + Math.floor(c * (x1 - x0));
            y = y0 + Math.floor(c * (y1 - y0));
          }
        } else {
          if (pass === 0) continue;
          x = coord(i % w, ts);
          y = coord(Math.floor(i / w), ts);
        }

        const cellBg = t !== 0 && t === hintTile ? COL_HINT : bgcolor;
        drawTile(dr, ts, hw, x, y, t, cellBg);
      }
      ds.tiles[i] = t0;
    }
  }

  ds.bgcolor = bgcolor;
  ds.hintTile = hintTile;
}
