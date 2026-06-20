/**
 * Unruly rendering — faithful port of `game_redraw` / `unruly_draw_tile`
 * in unruly.c. Per-tile `Int32Array` cache keyed on a packed flag word
 * (the upstream `tile` int); error overlays (3-in-a-row bars, count `!`,
 * unique-match bars) recomputed each frame from the validators; a
 * completion flash inverting filled tiles toward highlight/lowlight.
 *
 * The palette deliberately mirrors the C colour-enum index layout so the
 * app's dark-mode `paletteOverrides` (keyed by index) apply unchanged.
 */
import type { Colour, Size } from "../../../puzzle/types.ts";
import { mkhighlightSpecific } from "../../engine/colour-mkhighlight.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import type { UnrulyHint } from "./index.ts";
import {
  FE_COL_MATCH,
  FE_HOR_ROW_LEFT,
  FE_HOR_ROW_RIGHT,
  FE_ROW_MATCH,
  FE_VER_ROW_BOTTOM,
  FE_VER_ROW_TOP,
  validateCounts,
  validateRows,
} from "./solver.ts";
import {
  EMPTY,
  ONE,
  type UnrulyMistake,
  type UnrulyMove,
  type UnrulyParams,
  type UnrulyState,
  type UnrulyUi,
  ZERO,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 32;
const FLASH_FRAME = 0.12;
export const FLASH_TIME = FLASH_FRAME * 3;
/** Base duration (s) of a single-cell placement animation; the midend
 * stretches it to the uniform hint-step duration for auto-hint. */
export const PLACE_ANIM_TIME = 0.13;

// --- palette (mirrors the unruly.c colour enum index-for-index) ---------
export const COL_BACKGROUND = 0;
export const COL_GRID = 1;
export const COL_EMPTY = 2;
export const COL_0 = 3;
export const COL_0_HIGHLIGHT = 4;
export const COL_0_LOWLIGHT = 5;
export const COL_1 = 6;
export const COL_1_HIGHLIGHT = 7;
export const COL_1_LOWLIGHT = 8;
export const COL_CURSOR = 9;
export const COL_ERROR = 10;
// Hint colours — appended past the dark-mode override range (3–8), so dark
// mode leaves them unchanged. The action cell is COL_HINT (blue); the
// deduction's empty siblings shade COL_HINT_CELL (light blue); the cited
// premise / pivotal cells ring COL_HINT_REF (orange), distinct from the move.
export const COL_HINT = 11;
export const COL_HINT_CELL = 12;
export const COL_HINT_REF = 13;

const grey = (v: number): Colour => [v, v, v];

export function colours(defaultBackground: Colour): Colour[] {
  const out: Colour[] = [];
  out[COL_BACKGROUND] = defaultBackground;
  out[COL_GRID] = grey(0.3);
  out[COL_EMPTY] = grey(0.5);
  // COL_1 ("black") base 0.2, COL_0 ("white") base 0.95 — highlight/lowlight
  // (and a possibly-shifted base) derived exactly as game_mkhighlight_specific.
  const one = mkhighlightSpecific(grey(0.2));
  out[COL_1] = one.base;
  out[COL_1_HIGHLIGHT] = one.highlight;
  out[COL_1_LOWLIGHT] = one.lowlight;
  const zero = mkhighlightSpecific(grey(0.95));
  out[COL_0] = zero.base;
  out[COL_0_HIGHLIGHT] = zero.highlight;
  out[COL_0_LOWLIGHT] = zero.lowlight;
  out[COL_CURSOR] = [0, 0.7, 0];
  out[COL_ERROR] = [1, 0, 0];
  out[COL_HINT] = [0.13, 0.5, 0.85];
  out[COL_HINT_CELL] = [0.7, 0.84, 0.98];
  // Cited premise / pivotal cells. A single ring colour (not the cross-game
  // teal/violet black/white-ref pair): Unruly's ring set is mixed — filled
  // black cells, a balanced reference row holding both colours, and empty
  // reserved windows — so a state-derived colour is ill-defined. Orange keeps
  // it clear of the blue move and of the teal/violet "decided black/white"
  // meaning those hues carry in Singles/Range.
  out[COL_HINT_REF] = [0.95, 0.6, 0.15];
  return out;
}

// --- packed tile flags (upstream FE_*/FF_*; also the cache key) ---------
const FE_COUNT = 0x10;
const FF_ONE = 0x80;
const FF_ZERO = 0x100;
const FF_CURSOR = 0x200;
const FF_FLASH1 = 0x400;
const FF_FLASH2 = 0x800;
const FF_IMMUTABLE = 0x1000;
// Our mistake-overlay bit (no upstream analogue), folded into the cache key.
const FF_MISTAKE = 0x2000;
// Hint-overlay bits (no upstream analogue), also folded into the cache key.
const FF_HINT_TARGET = 0x4000; // the forced cell (filled COL_HINT + preview)
const FF_HINT_ONE = 0x8000; // the forced colour is ONE (else ZERO)
const FF_HINT_AREA = 0x10000; // a journey-sibling empty cell (light shade)
const FF_HINT_RING = 0x20000; // a cited premise / pivotal cell (COL_HINT_REF outline)

// --- geometry -----------------------------------------------------------
const border = (ts: number) => Math.floor(ts / 2);
const outerEdge = (ts: number) => Math.max(Math.floor(ts / 10), 1);
const coord = (n: number, ts: number) => n * ts + border(ts);

export function computeSize(p: UnrulyParams, ts: number): Size {
  return { w: ts * p.w2 + 2 * border(ts), h: ts * p.h2 + 2 * border(ts) };
}

// --- draw state ---------------------------------------------------------

export interface UnrulyDrawState {
  started: boolean;
  tilesize: number;
  w2: number;
  h2: number;
  /** Last-drawn packed tile word per cell; -1 forces a draw. */
  cache: Int32Array;
}

export function newDrawState(state: UnrulyState): UnrulyDrawState {
  return {
    started: false,
    tilesize: 0,
    w2: state.w2,
    h2: state.h2,
    cache: new Int32Array(state.w2 * state.h2).fill(-1),
  };
}

// --- tile drawing -------------------------------------------------------

function drawErrRectangle(
  dr: GameDrawing,
  x: number,
  y: number,
  w: number,
  h: number,
  ts: number,
): void {
  const thick = Math.floor(ts / 10);
  const margin = Math.floor(ts / 20);
  dr.drawRect({ x: x + margin, y: y + margin, w: w - 2 * margin, h: thick }, COL_ERROR);
  dr.drawRect({ x: x + margin, y: y + margin, w: thick, h: h - 2 * margin }, COL_ERROR);
  dr.drawRect(
    { x: x + margin, y: y + h - margin - thick, w: w - 2 * margin, h: thick },
    COL_ERROR,
  );
  dr.drawRect(
    { x: x + w - margin - thick, y: y + margin, w: thick, h: h - 2 * margin },
    COL_ERROR,
  );
}

function drawTile(
  dr: GameDrawing,
  px: number,
  py: number,
  ts: number,
  tile: number,
  // Placement animation: the cell's previous colour index, or -1 if not
  // animating; `animFrac` is the grow progress 0→1.
  animPrevColour = -1,
  animFrac = 1,
): void {
  dr.clip({ x: px, y: py, w: ts, h: ts });

  // Grid edge first, so the tile can overwrite it.
  dr.drawRect({ x: px, y: py, w: ts, h: ts }, COL_GRID);

  // Tile background: FF_ZERO → COL_0 (white), FF_ONE → COL_1 (black), else
  // COL_EMPTY. A flash shifts a filled tile toward highlight (+1) / lowlight (+2).
  let val = tile & FF_ZERO ? COL_0 : tile & FF_ONE ? COL_1 : COL_EMPTY;
  if (tile & (FF_FLASH1 | FF_FLASH2) && (val === COL_0 || val === COL_1)) {
    val += tile & FF_FLASH1 ? 1 : 2;
  }

  const inner = { x: px, y: py, w: ts - 1, h: ts - 1 };
  if (animPrevColour >= 0 && animFrac < 1) {
    // Placement grow: the previous colour beneath, the new colour growing
    // from the cell centre (geometric, no colour tween).
    dr.drawRect(inner, animPrevColour);
    const sz = Math.max(0, Math.round((ts - 1) * animFrac));
    if (sz > 0) {
      const off = Math.floor((ts - 1 - sz) / 2);
      dr.drawRect({ x: px + off, y: py + off, w: sz, h: sz }, val);
    }
  } else if (tile & FF_HINT_TARGET) {
    // The forced cell: blue fill + an inset preview of the colour it forces.
    dr.drawRect(inner, COL_HINT);
    const o = Math.floor(ts / 4);
    dr.drawRect(
      { x: px + o, y: py + o, w: ts - 1 - 2 * o, h: ts - 1 - 2 * o },
      tile & FF_HINT_ONE ? COL_1 : COL_0,
    );
  } else if (tile & FF_HINT_AREA) {
    // A journey-sibling empty cell: light-blue shade.
    dr.drawRect(inner, COL_HINT_CELL);
  } else {
    dr.drawRect(inner, val);
  }

  // Immutable-clue bevel: inset top/left lowlight, bottom/right highlight.
  if ((val === COL_0 || val === COL_1) && tile & FF_IMMUTABLE) {
    const o = Math.floor(ts / 6);
    const span = ts - 2 * o - 2;
    dr.drawRect({ x: px + o, y: py + o, w: span, h: 1 }, val + 2);
    dr.drawRect({ x: px + o, y: py + o, w: 1, h: span }, val + 2);
    dr.drawRect({ x: px + o + 1, y: py + ts - o - 2, w: span, h: 1 }, val + 1);
    dr.drawRect({ x: px + ts - o - 2, y: py + o + 1, w: 1, h: span }, val + 1);
  }

  // 3-in-a-row error bars, extending a half-tile into the run's neighbours
  // (clipped to this tile, so each tile draws its own portion).
  if (tile & (FE_HOR_ROW_LEFT | FE_HOR_ROW_RIGHT)) {
    let left = px;
    let right = px + ts - 1;
    if (tile & FE_HOR_ROW_LEFT) right += Math.floor(ts / 2);
    if (tile & FE_HOR_ROW_RIGHT) left -= Math.floor(ts / 2);
    drawErrRectangle(dr, left, py, right - left, ts - 1, ts);
  }
  if (tile & (FE_VER_ROW_TOP | FE_VER_ROW_BOTTOM)) {
    let top = py;
    let bottom = py + ts - 1;
    if (tile & FE_VER_ROW_TOP) bottom += Math.floor(ts / 2);
    if (tile & FE_VER_ROW_BOTTOM) top -= Math.floor(ts / 2);
    drawErrRectangle(dr, px, top, ts - 1, bottom - top, ts);
  }

  // Count error.
  if (tile & FE_COUNT) {
    dr.drawText(
      { x: px + Math.floor(ts / 2), y: py + Math.floor(ts / 2) },
      {
        align: "center",
        baseline: "mathematical",
        fontType: "variable",
        size: Math.floor(ts / 2),
      },
      COL_ERROR,
      "!",
    );
  }

  // Unique-match bars.
  if (tile & FE_ROW_MATCH) {
    dr.drawRect(
      {
        x: px,
        y: py + Math.floor(ts / 2) - Math.floor(ts / 12),
        w: ts,
        h: 2 * Math.floor(ts / 12),
      },
      COL_ERROR,
    );
  }
  if (tile & FE_COL_MATCH) {
    dr.drawRect(
      {
        x: px + Math.floor(ts / 2) - Math.floor(ts / 12),
        y: py,
        w: 2 * Math.floor(ts / 12),
        h: ts,
      },
      COL_ERROR,
    );
  }

  // Mistake overlay (Check & Save): an inset error-coloured outline, distinct
  // from the live 3-in-a-row / count errors above.
  if (tile & FF_MISTAKE) {
    const t = Math.max(1, Math.floor(ts / 16));
    const inset = Math.max(1, Math.floor(ts / 8));
    const sx = px + inset;
    const sy = py + inset;
    const span = ts - 1 - 2 * inset;
    dr.drawRect({ x: sx, y: sy, w: span, h: t }, COL_ERROR);
    dr.drawRect({ x: sx, y: sy + span - t, w: span, h: t }, COL_ERROR);
    dr.drawRect({ x: sx, y: sy, w: t, h: span }, COL_ERROR);
    dr.drawRect({ x: sx + span - t, y: sy, w: t, h: span }, COL_ERROR);
  }

  // Hint ring: a COL_HINT_REF outline around a cited premise / pivotal cell
  // (its own colour stays visible — for a filled premise that colour *is* the
  // evidence; for an empty reserved window the ring marks the spared cells).
  // Ringed in COL_HINT_REF, not the COL_HINT of the move, so premise and move
  // don't read as the same element type.
  if (tile & FF_HINT_RING) {
    const t = Math.max(1, Math.floor(ts / 12));
    dr.drawRect({ x: px, y: py, w: ts - 1, h: t }, COL_HINT_REF);
    dr.drawRect({ x: px, y: py + ts - 1 - t, w: ts - 1, h: t }, COL_HINT_REF);
    dr.drawRect({ x: px, y: py, w: t, h: ts - 1 }, COL_HINT_REF);
    dr.drawRect({ x: px + ts - 1 - t, y: py, w: t, h: ts - 1 }, COL_HINT_REF);
  }

  // Cursor outline.
  if (tile & FF_CURSOR) {
    const t = Math.floor(ts / 12);
    dr.drawRect({ x: px, y: py, w: t, h: ts - 1 }, COL_CURSOR);
    dr.drawRect({ x: px, y: py, w: ts - 1, h: t }, COL_CURSOR);
    dr.drawRect({ x: px + ts - 1 - t, y: py, w: t, h: ts - 1 }, COL_CURSOR);
    dr.drawRect({ x: px, y: py + ts - 1 - t, w: ts - 1, h: t }, COL_CURSOR);
  }

  dr.unclip();
  dr.drawUpdate({ x: px, y: py, w: ts, h: ts });
}

// --- redraw -------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: UnrulyDrawState | null,
  prev: UnrulyState | null,
  state: UnrulyState,
  _dir: number,
  ui: UnrulyUi,
  animTime: number,
  flashTime: number,
  hint?: HintStep<UnrulyMove, UnrulyHint>,
  mistakes?: readonly UnrulyMistake[],
): void {
  if (!ds) return;
  const ts = ds.tilesize;
  const { w2, h2, grid, immutable } = state;
  const s = w2 * h2;
  const mistakeSet =
    mistakes && mistakes.length > 0
      ? new Set(mistakes.map((m) => m.y * w2 + m.x))
      : null;

  // Displayed hint step: the forced target, its sibling area, premise rings.
  const hl = hint?.highlights;
  const hintTarget = hl ? hl.target.y * w2 + hl.target.x : -1;
  const hintTargetOne = hl?.target.value === ONE;
  const hintAreaSet = hl ? new Set(hl.area) : null;
  const hintRingSet = hl ? new Set(hl.ring) : null;

  // A placement animates only when the engine is driving timed redraws
  // (animTime > 0) and we have a from-state to grow out of.
  const animating = animTime > 0 && prev != null;
  const animFrac = animTime / PLACE_ANIM_TIME;
  const colourOf = (v: number): number =>
    v === ONE ? COL_1 : v === ZERO ? COL_0 : COL_EMPTY;

  if (!ds.started) {
    // The engine paints no pixels of its own: fill the background, then the
    // outer grid-edge frame.
    const size = computeSize({ w2, h2, unique: state.unique, diff: 0 }, ts);
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_BACKGROUND);
    const o = outerEdge(ts);
    dr.drawRect(
      {
        x: coord(0, ts) - o,
        y: coord(0, ts) - o,
        w: ts * w2 + 2 * o - 1,
        h: ts * h2 + 2 * o - 1,
      },
      COL_GRID,
    );
    dr.drawUpdate({ x: 0, y: 0, w: size.w, h: size.h });
    ds.started = true;
  }

  let flash = 0;
  if (flashTime > 0) {
    flash = Math.floor(flashTime / FLASH_FRAME) === 1 ? FF_FLASH2 : FF_FLASH1;
  }

  // Recompute error overlays each frame (live error display, like upstream).
  const gridfs = new Int32Array(s);
  validateRows(state, gridfs);
  const rowfs = new Uint8Array(2 * (w2 + h2));
  validateCounts(state, rowfs);

  for (let y = 0; y < h2; y++) {
    for (let x = 0; x < w2; x++) {
      const i = y * w2 + x;
      let tile = gridfs[i];
      if (grid[i] === ONE) {
        tile |= FF_ONE;
        if (rowfs[y] || rowfs[2 * h2 + x]) tile |= FE_COUNT;
      } else if (grid[i] === ZERO) {
        tile |= FF_ZERO;
        if (rowfs[h2 + y] || rowfs[2 * h2 + w2 + x]) tile |= FE_COUNT;
      }
      tile |= flash;
      if (immutable[i]) tile |= FF_IMMUTABLE;
      if (ui.cursor && ui.cx === x && ui.cy === y) tile |= FF_CURSOR;
      if (mistakeSet?.has(i)) tile |= FF_MISTAKE;
      // Hint overlay (target > ring > sibling-area; area only on empty cells).
      if (i === hintTarget) {
        tile |= FF_HINT_TARGET;
        if (hintTargetOne) tile |= FF_HINT_ONE;
      } else if (hintRingSet?.has(i)) {
        tile |= FF_HINT_RING;
      } else if (hintAreaSet?.has(i) && grid[i] === EMPTY) {
        tile |= FF_HINT_AREA;
      }

      // An animating cell can't be captured by the packed key, so it is
      // redrawn every frame (cache forced stale, Flip's idiom) and grows the
      // new colour out of its previous colour.
      const animThis = animating && prev != null && prev.grid[i] !== grid[i];
      if (animThis) {
        ds.cache[i] = -1;
        drawTile(
          dr,
          coord(x, ts),
          coord(y, ts),
          ts,
          tile,
          colourOf(prev.grid[i]),
          animFrac,
        );
      } else if (ds.cache[i] !== tile) {
        ds.cache[i] = tile;
        drawTile(dr, coord(x, ts), coord(y, ts), ts, tile);
      }
    }
  }
}
