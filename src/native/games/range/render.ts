/**
 * Range rendering — port of `draw_cell` / `game_redraw` in `range.c`: a
 * per-cell diffed loop drawing a grid-outlined tile (black fill for a
 * black square, lowlight under the cursor or the completion flash,
 * otherwise the background), a small centred dot for a white mark, and
 * the clue number. Rule violations are recomputed every frame via
 * `findErrors` and drawn in the error colour — Range highlights errors
 * live, which is upstream behaviour, not the fork's Check & Save.
 */
import type { Colour, Size } from "../../../puzzle/types.ts";
import { mkhighlight } from "../../engine/colour-mkhighlight.ts";
import { drawRectOutline } from "../../engine/draw.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import type { RangeHint } from "./index.ts";
import { findErrors } from "./solver.ts";
import {
  BLACK,
  idx,
  type RangeMove,
  type RangeParams,
  type RangeState,
  type RangeUi,
  WHITE,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 32;
export const FLASH_TIME = 0.7;

// --- palette (upstream COL_* enum) -----------------------------------------

export const COL_BACKGROUND = 0;
export const COL_GRID = 1; // == COL_BLACK == COL_TEXT == COL_USER
export const COL_ERROR = 2;
export const COL_LOWLIGHT = 3; // == COL_CURSOR
export const COL_HINT = 4; // the cell the displayed hint forces (blue)
export const COL_HINT_CELL = 5; // premise cells (clue / adjacent black) (light blue)

export function colours(defaultBackground: Colour): Colour[] {
  const { background, lowlight } = mkhighlight(defaultBackground);
  const out: Colour[] = [];
  out[COL_BACKGROUND] = background;
  out[COL_GRID] = [0, 0, 0];
  out[COL_ERROR] = [1, 0, 0];
  out[COL_LOWLIGHT] = lowlight;
  out[COL_HINT] = [0.13, 0.5, 0.85];
  out[COL_HINT_CELL] = [0.82, 0.9, 0.99];
  return out;
}

// --- geometry --------------------------------------------------------------

const border = (ts: number): number => Math.floor(ts / 2);

export function computeSize(p: RangeParams, ts: number): Size {
  return { w: p.w * ts + 2 * border(ts), h: p.h * ts + 2 * border(ts) };
}

// --- draw state ------------------------------------------------------------

// Packed cache flags above the (value + 2) field (value + 2 ≥ 0; clues
// can reach ~w + h − 1).
const F_ERROR = 1 << 16;
const F_CURSOR = 1 << 17;
const F_FLASH = 1 << 18;
const F_MISTAKE = 1 << 19;
const F_HINT_TARGET = 1 << 20; // this cell is the displayed hint's target
const F_HINT_WHITE = 1 << 21; // …and the forced mark is white (else black)
const F_HINT_REF = 1 << 22; // this cell is a hint premise (light shade)

export interface RangeDrawState {
  started: boolean;
  tilesize: number;
  w: number;
  h: number;
  cache: Int32Array;
}

export function newDrawState(state: RangeState): RangeDrawState {
  return {
    started: false,
    tilesize: 0,
    w: state.w,
    h: state.h,
    cache: new Int32Array(state.w * state.h).fill(-1),
  };
}

export function setTileSize(ds: RangeDrawState, ts: number): void {
  ds.tilesize = ts;
}

// --- cell drawing ----------------------------------------------------------

/** Hint highlight for a cell: 0 none, 1 forced-black target, 2
 * forced-white target, 3 premise (reference) cell. */
type HintKind = 0 | 1 | 2 | 3;

function drawCell(
  dr: GameDrawing,
  ts: number,
  r: number,
  c: number,
  value: number,
  error: boolean,
  cursor: boolean,
  flash: boolean,
  hintKind: HintKind,
): void {
  const b = border(ts);
  const x = b + ts * c;
  const y = b + ts * r;
  const tx = x + Math.floor(ts / 2);
  const ty = y + Math.floor(ts / 2);
  const dotsz = Math.floor((ts + 9) / 10);

  // A hint target paints the whole cell blue; a black square keeps its
  // identity; a premise cell shades light blue; otherwise normal.
  const fill =
    hintKind === 1 || hintKind === 2
      ? COL_HINT
      : value === BLACK
        ? error
          ? COL_ERROR
          : COL_GRID
        : hintKind === 3
          ? COL_HINT_CELL
          : flash || cursor
            ? COL_LOWLIGHT
            : COL_BACKGROUND;

  drawRectOutline(dr, x, y, ts + 1, ts + 1, COL_GRID);
  dr.drawRect({ x: x + 1, y: y + 1, w: ts - 1, h: ts - 1 }, fill);
  if (error) drawRectOutline(dr, x + 1, y + 1, ts - 1, ts - 1, COL_ERROR);

  // Preview the mark the hint forces, on top of the blue target cell.
  if (hintKind === 1) {
    // Forced black: an inset black square.
    const inset = Math.max(2, Math.floor(ts / 5));
    dr.drawRect(
      { x: x + inset, y: y + inset, w: ts - 2 * inset, h: ts - 2 * inset },
      COL_GRID,
    );
  } else if (hintKind === 2) {
    // Forced white: the white dot.
    dr.drawRect(
      {
        x: tx - Math.floor(dotsz / 2),
        y: ty - Math.floor(dotsz / 2),
        w: dotsz,
        h: dotsz,
      },
      COL_GRID,
    );
  }

  if (value === WHITE) {
    dr.drawRect(
      {
        x: tx - Math.floor(dotsz / 2),
        y: ty - Math.floor(dotsz / 2),
        w: dotsz,
        h: dotsz,
      },
      error ? COL_ERROR : COL_GRID,
    );
  } else if (value > 0) {
    dr.drawText(
      { x: tx, y: ty },
      {
        align: "center",
        baseline: "mathematical",
        fontType: "variable",
        size: Math.floor((ts * 3) / 5),
      },
      error ? COL_ERROR : COL_GRID,
      String(value),
    );
  }

  dr.drawUpdate({ x, y, w: ts + 1, h: ts + 1 });
}

// --- redraw ----------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: RangeDrawState | null,
  _prev: RangeState | null,
  state: RangeState,
  _dir: number,
  ui: RangeUi,
  _animTime: number,
  flashTime: number,
  hint?: HintStep<RangeMove, RangeHint>,
  mistakes?: readonly { r: number; c: number }[],
): void {
  if (!ds) return;
  const ts = ds.tilesize;
  const { w, h, grid } = state;

  if (!ds.started) {
    const size = computeSize({ w, h }, ts);
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_BACKGROUND);
    ds.started = true;
  }

  // Whole-board flash pulse: lowlight every non-black cell on alternate
  // beats of the flash.
  const flash = flashTime > 0 && Math.floor((flashTime * 5) / FLASH_TIME) % 2 === 1;

  const errors: boolean[] = new Array(w * h).fill(false);
  findErrors(grid, w, h, errors);

  // Check & Save mistakes (cells contradicting the unique solution) are
  // highlighted the same red as live rule violations.
  const mistakeSet = mistakes ? new Set(mistakes.map((m) => idx(m.r, m.c, w))) : null;

  // The displayed hint step: its target cell and its premise cells.
  const hl = hint?.highlights;
  const hintTarget = hl ? idx(hl.target.r, hl.target.c, w) : -1;
  const hintWhite = hl?.target.value === "white";
  const hintRefSet = hl ? new Set(hl.refs.map((m) => idx(m.r, m.c, w))) : null;

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const i = idx(r, c, w);
      const value = grid[i];
      const error = errors[i];
      const mistake = mistakeSet?.has(i) ?? false;
      const cursor = ui.cursorShow && r === ui.r && c === ui.c;
      const hintKind: HintKind =
        i === hintTarget ? (hintWhite ? 2 : 1) : hintRefSet?.has(i) ? 3 : 0;

      let packed = value + 2;
      if (error) packed |= F_ERROR;
      if (cursor) packed |= F_CURSOR;
      if (flash) packed |= F_FLASH;
      if (mistake) packed |= F_MISTAKE;
      if (hintKind === 1 || hintKind === 2) packed |= F_HINT_TARGET;
      if (hintKind === 2) packed |= F_HINT_WHITE;
      if (hintKind === 3) packed |= F_HINT_REF;

      if (ds.cache[i] !== packed) {
        drawCell(dr, ts, r, c, value, error || mistake, cursor, flash, hintKind);
        ds.cache[i] = packed;
      }
    }
  }
}
