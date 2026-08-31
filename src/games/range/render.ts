/**
 * Range rendering — port of `draw_cell` / `game_redraw` in `range.c`: a
 * per-cell diffed loop drawing a grid-outlined tile (black fill for a
 * black square, lowlight under the cursor or the completion flash,
 * otherwise the background), a small centred dot for a white mark, and
 * the clue number. Rule violations are recomputed every frame via
 * `findErrors` and drawn in the error colour — Range highlights errors
 * live, which is upstream behaviour, not the fork's Check & Save.
 */

import { mkhighlight } from "../../engine/colour/colour-mkhighlight.ts";
import {
  ERROR,
  HINT_ACTION,
  HINT_BLACKREF,
  HINT_EVIDENCE,
  INK,
  PAPER,
} from "../../engine/colour/palette.ts";
import { drawRectOutline } from "../../engine/draw.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import { drawMarkSides, MARK_ALL } from "../../engine/hint-mark.ts";
import type { Colour, Size } from "../../engine/types.ts";
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

export const COL_BACKGROUND = 0; // an undecided (EMPTY) cell — a soft grey
export const COL_GRID = 1; // == COL_BLACK == COL_TEXT == COL_USER
export const COL_ERROR = 2;
export const COL_LOWLIGHT = 3; // == COL_CURSOR
export const COL_HINT = 4; // the cell the displayed hint forces — ringed
export const COL_HINT_CELL = 5; // the deduction's premise/area cells — outlined
export const COL_WHITEBG = 6; // a known-white cell: a clue or the player's white mark
export const COL_HINT_BLACKREF = 7; // a cited decided-black premise (teal ring)

export function colours(defaultBackground: Colour): Colour[] {
  const { background, lowlight } = mkhighlight(defaultBackground);
  const out: Colour[] = [];
  out[COL_BACKGROUND] = background;
  out[COL_GRID] = INK;
  out[COL_ERROR] = ERROR;
  out[COL_LOWLIGHT] = lowlight;
  out[COL_HINT] = HINT_ACTION;
  out[COL_HINT_CELL] = HINT_EVIDENCE;
  // Pure white — `mkhighlight` has shifted COL_BACKGROUND off pure white,
  // so a known-white cell reads as visibly white against undecided cells.
  out[COL_WHITEBG] = PAPER;
  // Cited decided-black premise ring — the cross-game "a shaded black square is
  // the reason" hue (matches Singles' COL_HINT_BLACKREF), distinct from the blue
  // target fill so premise and move don't read as the same colour.
  out[COL_HINT_BLACKREF] = HINT_BLACKREF;
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
const F_HINT_REF = 1 << 22; // this cell is a hint area cell (light shade)
const F_HINT_BLACKREF = 1 << 23; // a black premise cell, outlined in COL_HINT
const F_HINT_CLUE = 1 << 21; // the clue driving the deduction — digit in COL_HINT

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

/** Hint highlight for a cell: 0 none, 1 forced target (black *or* white —
 * both render as the same blue highlight; the narration says which mark),
 * 3 area (premise) cell, 4 black premise cell (kept black, outlined in
 * COL_HINT — e.g. the adjacent black that forces a neighbour white). */
type HintKind = 0 | 1 | 3 | 4;

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
  /** This clue drives the displayed deduction: its digit draws `COL_HINT` so
   * the narration can say "the highlighted 5" instead of "clue 5", which names
   * nothing when its own shaded run holds a second 5. Orthogonal to
   * `hintKind` — the clue is *inside* the shaded area, so it keeps that fill
   * and changes only its digit (Light Up's recoloured clue). */
  clueRef = false,
): void {
  const b = border(ts);
  const x = b + ts * c;
  const y = b + ts * r;
  const tx = x + Math.floor(ts / 2);
  const ty = y + Math.floor(ts / 2);
  const dotsz = Math.floor((ts + 9) / 10);

  // Fill precedence: a black square keeps its identity; the cursor/flash
  // overlay is a lowlight; a known-white cell (clue or white mark) is pure
  // white; an undecided cell is the soft-grey background. No hint role appears
  // here — the target is ringed and the evidence outlined, below. A Range
  // premise area reaches along a clue's arms and takes in the clue cell itself,
  // so it is not the all-undecided region it looks like: it carries the digit
  // the deduction is counting with.
  const fill =
    value === BLACK
      ? error
        ? COL_ERROR
        : COL_GRID
      : flash || cursor
        ? COL_LOWLIGHT
        : value === WHITE || value > 0
          ? COL_WHITEBG
          : COL_BACKGROUND;

  drawRectOutline(dr, x, y, ts + 1, ts + 1, COL_GRID);
  dr.drawRect({ x: x + 1, y: y + 1, w: ts - 1, h: ts - 1 }, fill);
  if (error) drawRectOutline(dr, x + 1, y + 1, ts - 1, ts - 1, COL_ERROR);

  // The evidence area's outline and the acted-on cell's ring, on the cell's own
  // border. The evidence first, so a cell that is both keeps the target's mark.
  const band = {
    box: { x: x + 1, y: y + 1, w: ts - 1, h: ts - 1 },
    outer: 0,
    inner: Math.max(2, ts >> 4),
  };
  if (hintKind === 3) drawMarkSides(dr, band, MARK_ALL, COL_HINT_CELL);
  if (hintKind === 1) drawMarkSides(dr, band, MARK_ALL, COL_HINT);

  // A black premise cell stays black; ring it in COL_HINT_BLACKREF (a doubled
  // 2px inset outline) so "this shaded square is the reason" reads distinct from
  // the COL_HINT blue of the forced move.
  if (hintKind === 4) {
    drawRectOutline(dr, x + 1, y + 1, ts - 1, ts - 1, COL_HINT_BLACKREF);
    drawRectOutline(dr, x + 2, y + 2, ts - 3, ts - 3, COL_HINT_BLACKREF);
  }

  // No forced-mark preview: the hint only *highlights* the target cell blue
  // ("act here"); it does not place the black square / white dot the player
  // must enter themselves — doing so reads as already-done. The narration
  // says which mark; auto-hint applies it for real in animation mode.
  // (Owner-directed, 2026-06-20 — see hint-authoring.md.)

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
      error ? COL_ERROR : clueRef ? COL_HINT : COL_GRID,
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
  mistakes?: readonly { r: number; c: number }[],
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

  // The displayed hint step: the target cell, the deduction's area cells
  // (light-blue shade) and any black premise cells (outlined).
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
        i === hintTarget ? 1 : hintBlackSet?.has(i) ? 4 : hintAreaSet?.has(i) ? 3 : 0;
      const clueRef = i === hintClue;

      let packed = value + 2;
      if (error) packed |= F_ERROR;
      if (cursor) packed |= F_CURSOR;
      if (flash) packed |= F_FLASH;
      if (mistake) packed |= F_MISTAKE;
      if (hintKind === 1) packed |= F_HINT_TARGET;
      if (hintKind === 3) packed |= F_HINT_REF;
      if (hintKind === 4) packed |= F_HINT_BLACKREF;
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
