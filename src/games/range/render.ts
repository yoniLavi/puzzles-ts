/**
 * Range rendering — port of `draw_cell` / `game_redraw` in `range.c`: a
 * per-cell diffed loop drawing a grid-outlined tile (black fill for a
 * black square, the flash fill on completion, white for a known-white
 * cell, otherwise the background), corner brackets under the keyboard
 * cursor, a small centered dot for a white mark, and the clue number.
 * Rule violations are recomputed every frame via `findErrors` and drawn in
 * the error color — Range highlights errors live, which is upstream
 * behavior, not the fork's Check & Save.
 */

import { mkhighlight } from "../../engine/color/color-mkhighlight.ts";
import {
  BLACK as BLACK_PIECE,
  WHITE as WHITE_PIECE,
} from "../../engine/color/colors.ts";
import {
  CURSOR,
  ERROR,
  FLASH,
  HINT_ACTION,
  HINT_BLACKREF,
  HINT_EVIDENCE,
  INK,
} from "../../engine/color/palette.ts";
import { drawRectCorners, drawRectOutline, glyphFont } from "../../engine/draw.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import { drawMarkSides, MARK_ALL } from "../../engine/hint-mark.ts";
import type { Color, Size } from "../../engine/types.ts";
import type { RangeHint } from "./index.ts";
import { findErrors } from "./solver.ts";
import {
  BLACK,
  type Cell,
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

export const COL_BACKGROUND = 0; // an undecided (EMPTY) cell — a soft gray
/** Grid lines, and the ink of a glyph on an undecided cell. Upstream aliases
 * COL_BLACK, COL_TEXT and COL_USER onto this slot; the black square is split
 * off into {@link COL_BLACK} because it is a *piece*, not ink. */
export const COL_GRID = 1;
export const COL_ERROR = 2;
export const COL_FLASH = 3; // upstream's COL_LOWLIGHT slot: the solved flash
export const COL_HINT = 4; // the cell the displayed hint forces — ringed
export const COL_HINT_CELL = 5; // the deduction's premise/area cells — outlined
export const COL_WHITEBG = 6; // a known-white cell: a clue or the player's white mark
export const COL_HINT_BLACKREF = 7; // a cited decided-black premise (teal ring)
// Appended past the upstream enum (Range has no index-keyed dark overrides).
export const COL_CURSOR = 8; // the keyboard cursor, upstream's COL_LOWLIGHT alias
/** A shaded square — and the ink of the dot or digit on a known-white cell,
 * which sits on {@link COL_WHITEBG}'s pinned white and so must be pinned too. */
export const COL_BLACK = 9;

export function colors(defaultBackground: Color): Color[] {
  const { background } = mkhighlight(defaultBackground);
  const out: Color[] = [];
  out[COL_BACKGROUND] = background;
  out[COL_GRID] = INK;
  out[COL_ERROR] = ERROR;
  out[COL_FLASH] = FLASH;
  out[COL_HINT] = HINT_ACTION;
  out[COL_HINT_CELL] = HINT_EVIDENCE;
  // A known-white cell *is* white and a shaded square *is* black — pieces, not
  // contrast — so both are pinned and survive the dark scheme un-inverted.
  // `mkhighlight` has shifted COL_BACKGROUND off pure white, so a known-white
  // cell still reads as visibly white against undecided cells.
  out[COL_WHITEBG] = WHITE_PIECE;
  out[COL_BLACK] = BLACK_PIECE;
  out[COL_CURSOR] = CURSOR;
  // Cited decided-black premise ring — the cross-game "a shaded black square is
  // the reason" hue (matches Singles' COL_HINT_BLACKREF), distinct from the blue
  // target fill so premise and move don't read as the same color.
  out[COL_HINT_BLACKREF] = HINT_BLACKREF;
  return out;
}

// --- geometry --------------------------------------------------------------

/** The board's pixel origin. Exported so `interpretMove` reads the same number
 * the painter does — one function, both callers
 * ([`docs/games/mechanics.md`](../../../docs/games/mechanics.md)). */
export const border = (ts: number): number => Math.floor(ts / 2);

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
const F_HINT_CLUE = 1 << 21; // the clue driving the deduction — digit in COL_HINT

/** A cell's role in the displayed hint, with its cache flag. The `target` is
 * the forced cell, black or white alike (the narration says which mark),
 * ringed in COL_HINT; the `area` is the deduction's evidence, outlined in
 * COL_HINT_CELL; a `blackRef` is a black premise cell, kept black and ringed
 * in COL_HINT_BLACKREF. */
const HINT_FLAG = { none: 0, target: 1 << 20, area: 1 << 22, blackRef: 1 << 23 };
type HintKind = keyof typeof HINT_FLAG;

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
  /** This clue drives the displayed deduction, so its digit draws `COL_HINT`
   * (see `RangeHint.clue`). The clue is *inside* the outlined area, so it
   * keeps that outline and changes only its digit. */
  clueRef = false,
): void {
  const b = border(ts);
  const x = b + ts * c;
  const y = b + ts * r;
  const tx = x + Math.floor(ts / 2);
  const ty = y + Math.floor(ts / 2);
  const dotsz = Math.floor((ts + 9) / 10);

  // Fill precedence: a black square keeps its identity; the solved flash is a
  // fill; a known-white cell (clue or white mark) is pure white; an undecided
  // cell is the soft-gray background. The cursor is corner brackets, not a
  // fill, so a clue cell under it keeps its white and its digit keeps its ink.
  // No hint role is a fill either: a Range premise area runs along a clue's
  // arms and takes in the clue cell itself, whose digit the deduction counts.
  const fill =
    value === BLACK
      ? error
        ? COL_ERROR
        : COL_BLACK
      : flash
        ? COL_FLASH
        : value === WHITE || value > 0
          ? COL_WHITEBG
          : COL_BACKGROUND;
  // A glyph on the pinned-white cell is pinned black; anywhere else it is ink.
  const glyph = fill === COL_WHITEBG ? COL_BLACK : COL_GRID;

  drawRectOutline(dr, x, y, ts + 1, ts + 1, COL_GRID);
  dr.drawRect({ x: x + 1, y: y + 1, w: ts - 1, h: ts - 1 }, fill);
  if (error) drawRectOutline(dr, x + 1, y + 1, ts - 1, ts - 1, COL_ERROR);
  if (cursor) drawRectCorners(dr, tx, ty, Math.floor((ts * 3) / 10), COL_CURSOR);

  // The hint marks sit on the cell's own border. A black premise gets a doubled
  // inset outline so "this shaded square is the reason" reads distinct from the
  // blue ring of the forced move. The target is never previewed with its mark:
  // a placed square or dot would read as already done, so the narration says
  // which mark and auto-hint applies it for real.
  const band = {
    box: { x: x + 1, y: y + 1, w: ts - 1, h: ts - 1 },
    outer: 0,
    inner: Math.max(2, ts >> 4),
  };
  if (hintKind === "area") drawMarkSides(dr, band, MARK_ALL, COL_HINT_CELL);
  if (hintKind === "target") drawMarkSides(dr, band, MARK_ALL, COL_HINT);
  if (hintKind === "blackRef") {
    drawRectOutline(dr, x + 1, y + 1, ts - 1, ts - 1, COL_HINT_BLACKREF);
    drawRectOutline(dr, x + 2, y + 2, ts - 3, ts - 3, COL_HINT_BLACKREF);
  }

  if (value === WHITE) {
    dr.drawRect(
      {
        x: tx - Math.floor(dotsz / 2),
        y: ty - Math.floor(dotsz / 2),
        w: dotsz,
        h: dotsz,
      },
      error ? COL_ERROR : glyph,
    );
  } else if (value > 0) {
    dr.drawText(
      { x: tx, y: ty },
      glyphFont(Math.floor((ts * 3) / 5)),
      error ? COL_ERROR : clueRef ? COL_HINT : glyph,
      String(value),
    );
  }

  dr.drawUpdate({ x, y, w: ts + 1, h: ts + 1 });
}

// --- redraw ----------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: RangeDrawState,
  _prev: RangeState | null,
  state: RangeState,
  _dir: number,
  ui: RangeUi,
  _animTime: number,
  flashTime: number,
  hint?: HintStep<RangeMove, RangeHint>,
  mistakes?: readonly Cell[],
): void {
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

  const hl = hint?.highlights;
  const hintTarget = hl ? idx(hl.target.r, hl.target.c, w) : -1;
  const hintAreaSet = hl ? new Set(hl.area.map((m) => idx(m.r, m.c, w))) : null;
  const hintBlackSet = hl?.blackRefs
    ? new Set(hl.blackRefs.map((m) => idx(m.r, m.c, w)))
    : null;
  const hintClue = hl?.clue ? idx(hl.clue.r, hl.clue.c, w) : -1;

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const i = idx(r, c, w);
      const value = grid[i];
      const error = errors[i];
      const mistake = mistakeSet?.has(i) ?? false;
      const cursor = ui.cursor.visible && r === ui.cursor.y && c === ui.cursor.x;
      const hintKind: HintKind =
        i === hintTarget
          ? "target"
          : hintBlackSet?.has(i)
            ? "blackRef"
            : hintAreaSet?.has(i)
              ? "area"
              : "none";
      const clueRef = i === hintClue;

      let packed = (value + 2) | HINT_FLAG[hintKind];
      if (error) packed |= F_ERROR;
      if (cursor) packed |= F_CURSOR;
      if (flash) packed |= F_FLASH;
      if (mistake) packed |= F_MISTAKE;
      if (clueRef) packed |= F_HINT_CLUE;

      if (ds.cache[i] !== packed) {
        drawCell(
          dr,
          ts,
          r,
          c,
          value,
          error || mistake,
          cursor,
          flash,
          hintKind,
          clueRef,
        );
        ds.cache[i] = packed;
      }
    }
  }
}
