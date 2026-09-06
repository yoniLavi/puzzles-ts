/**
 * Light Up rendering — port of `tile_flags` / `tile_redraw` /
 * `game_redraw` in `lightup.c`: a per-tile diffed loop over a packed
 * display-flag word per cell (the playbook's Int32Array cache-key
 * pattern is upstream's own model here). Black squares show their clue
 * (red when provably wrong), open squares fill yellow when lit, bulbs
 * are circles (red when lit by another bulb), the player's
 * impossible-mark is a small black blob, and the completion flash is a
 * 3-phase background blink.
 *
 * The palette stays index-for-index with the upstream color enum —
 * the app's dark-mode `paletteOverrides` for lightup target indices 2
 * (black) and 3 (light).
 */

import { BLACK, WHITE, YELLOW_WASH } from "../../engine/color/colors.ts";
import {
  CURSOR,
  ERROR_WASH,
  GRID_MID,
  HINT_ACTION,
  HINT_BLACKREF,
  HINT_EVIDENCE_WASH,
  HINT_WHITEREF,
} from "../../engine/color/palette.ts";
import { drawRectOutline } from "../../engine/draw.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import { fromCoord as fromCoordE } from "../../engine/geometry.ts";
import { drawMarkSides, MARK_ALL } from "../../engine/hint-mark.ts";
import type { Color, Size } from "../../engine/types.ts";
import type { LightupHint, LightupMistake } from "./index.ts";
import {
  F_BLACK,
  F_IMPOSSIBLE,
  F_LIGHT,
  F_NUMBERED,
  idx,
  type LightupMove,
  type LightupState,
  type LightupUi,
  numberWrong,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 32;
export const FLASH_TIME = 0.3;

// --- palette (upstream COL_* enum, index-for-index) --------------------------

export const COL_BACKGROUND = 0;
export const COL_GRID = 1;
export const COL_BLACK = 2;
export const COL_LIGHT = 3; // white: bulbs and clue digits
export const COL_LIT = 4; // yellow lit-square fill
export const COL_ERROR = 5;
export const COL_CURSOR = 6;
// Fork hint colors, appended past the C enum (lightup's dark-mode
// paletteOverrides touch only indices 2/3, so these are safe). The digit
// of a driving clue recolors COL_HINT (the Pattern clue↔move tie).
export const COL_HINT = 7; // forced cell(s), blue fill (highlight only)
export const COL_HINT_CELL = 8; // evidence: the shade on a *dark* square
export const COL_HINT_LITERF = 9; // cited lit/bulb premise (green ring)
export const COL_HINT_DARKREF = 10; // the unlit square a deduction is about (violet ring)

export function colors(defaultBackground: Color): Color[] {
  const bg = defaultBackground;
  const out: Color[] = [];
  out[COL_BACKGROUND] = bg;
  out[COL_GRID] = GRID_MID;
  // Pinned: a wall *is* black and a bulb *is* white, in either scheme.
  out[COL_BLACK] = BLACK;
  out[COL_LIGHT] = WHITE;
  // The **wash** step, not plain yellow: a lit square is a large fill with
  // bulbs and clue digits drawn on top of it, and its job is to read as *the
  // board, lit* rather than as an object placed on the board. Plain yellow is a
  // near-board tint under a light scheme and a bright patch under a dark one —
  // the regression `hand-author-dark-palette` F1 found in Slide's target zone.
  out[COL_LIT] = YELLOW_WASH;
  out[COL_ERROR] = ERROR_WASH;
  out[COL_CURSOR] = CURSOR;
  out[COL_HINT] = HINT_ACTION;
  out[COL_HINT_CELL] = HINT_EVIDENCE_WASH;
  out[COL_HINT_LITERF] = HINT_BLACKREF;
  // The unlit square is the *empty* reference cell, so it takes the white-ref
  // premise color (Pattern's and Singles' empty reference is the same violet).
  out[COL_HINT_DARKREF] = HINT_WHITEREF;
  return out;
}

// --- geometry -----------------------------------------------------------------

export const border = (ts: number): number => Math.floor(ts / 2);
export const coord = (v: number, ts: number): number => v * ts + border(ts);
/** Pixel → cell, upstream FROMCOORD (safe for coords just left of the
 * border thanks to the +TILE_SIZE shift). */
export const fromCoord = (v: number, ts: number): number =>
  fromCoordE(v, ts, border(ts));

export function computeSize(p: { w: number; h: number }, ts: number): Size {
  return { w: p.w * ts + 2 * border(ts), h: p.h * ts + 2 * border(ts) };
}

// --- display flags (upstream DF_*) ---------------------------------------------

const DF_BLACK = 1;
const DF_NUMBERED = 2;
const DF_LIT = 4;
const DF_LIGHT = 8;
const DF_OVERLAP = 16;
const DF_CURSOR = 32;
const DF_NUMBERWRONG = 64;
const DF_FLASH = 128;
const DF_IMPOSSIBLE = 256;
/** Fork addition: this cell contradicts the unique solution (Check & Save). */
const DF_WRONG = 512;
/** Fork addition: the show-lit-blobs pref, in the key so a toggle repaints. */
const DF_BLOBS_PREF = 1024;
// Fork additions: the displayed hint step, in the key so hint changes repaint.
const DF_HINT_TARGET = 2048; // forced cell — blue COL_HINT fill
const DF_HINT_AREA = 4096; // evidence — shade when dark, green ring when lit
const DF_HINT_DARKREF = 8192; // the unlit square the deduction is about — violet ring
const DF_HINT_CLUE = 16384; // driving clue — digit recolored

export interface LightupDrawState {
  started: boolean;
  tilesize: number;
  crad: number;
  w: number;
  h: number;
  cache: Int32Array;
}

export function newDrawState(state: LightupState): LightupDrawState {
  return {
    started: false,
    tilesize: 0,
    crad: 0,
    w: state.w,
    h: state.h,
    cache: new Int32Array(state.w * state.h).fill(-1),
  };
}

export function setTileSize(ds: LightupDrawState, ts: number): void {
  ds.tilesize = ts;
  ds.crad = Math.floor((3 * (ts - 1)) / 8);
}

// --- per-tile flags + draw -------------------------------------------------------

function tileFlags(
  state: LightupState,
  ui: LightupUi,
  x: number,
  y: number,
  flashing: boolean,
): number {
  const i = idx(x, y, state.w);
  const flags = state.flags[i];
  const lights = state.lights[i];
  let ret = 0;

  if (flashing) ret |= DF_FLASH;
  if (ui.cursor.visible && x === ui.cursor.x && y === ui.cursor.y) ret |= DF_CURSOR;

  if (flags & F_BLACK) {
    ret |= DF_BLACK;
    if (flags & F_NUMBERED) {
      if (numberWrong(state, x, y)) ret |= DF_NUMBERWRONG;
      ret |= DF_NUMBERED;
    }
  } else {
    if (lights > 0) ret |= DF_LIT;
    if (flags & F_LIGHT) {
      ret |= DF_LIGHT;
      if (lights > 1) ret |= DF_OVERLAP;
    }
    if (flags & F_IMPOSSIBLE) ret |= DF_IMPOSSIBLE;
  }
  return ret;
}

function tileRedraw(
  dr: GameDrawing,
  ds: LightupDrawState,
  state: LightupState,
  ui: LightupUi,
  x: number,
  y: number,
): void {
  const ts = ds.tilesize;
  const dsFlags = ds.cache[idx(x, y, ds.w)];
  const dx = coord(x, ts);
  const dy = coord(y, ts);
  const lit = dsFlags & DF_FLASH ? COL_GRID : COL_LIT;

  if (dsFlags & DF_BLACK) {
    dr.drawRect({ x: dx, y: dy, w: ts, h: ts }, COL_BLACK);
    if (dsFlags & DF_NUMBERED) {
      // A hint's driving clue recolors its digit COL_HINT (the Pattern
      // clue↔move tie; the light COL_HINT_CELL would be unreadable as a
      // cue — nearly white on black). A provably-wrong clue stays red.
      const ccol =
        dsFlags & DF_NUMBERWRONG
          ? COL_ERROR
          : dsFlags & DF_HINT_CLUE
            ? COL_HINT
            : COL_LIGHT;
      // The clue value never changes over the game, so it is not part of
      // the diff key (upstream's observation).
      dr.drawText(
        { x: dx + Math.floor(ts / 2), y: dy + Math.floor(ts / 2) },
        {
          align: "center",
          baseline: "mathematical",
          fontType: "variable",
          size: Math.floor((ts * 3) / 5),
        },
        ccol,
        String(state.lights[idx(x, y, state.w)]),
      );
    }
  } else {
    // Hint roles (fork): the target square is **ringed** COL_HINT below, so a
    // square that already holds a light or an impossible-blob keeps showing it.
    // A *dark* evidence square shades COL_HINT_CELL and that is the wash form of
    // the role doing its job: the premise there is that the square is **not
    // lit**, which a teal shade preserves — it is not yellow — where a *lit*
    // evidence square's premise is the yellow itself, so that one keeps its
    // color and takes a green ring instead.
    const fill =
      dsFlags & DF_HINT_AREA && !(dsFlags & DF_LIT)
        ? COL_HINT_CELL
        : dsFlags & DF_LIT
          ? lit
          : COL_BACKGROUND;
    dr.drawRect({ x: dx, y: dy, w: ts, h: ts }, fill);
    drawRectOutline(dr, dx, dy, ts, ts, COL_GRID);
    if (dsFlags & DF_HINT_TARGET) {
      drawMarkSides(
        dr,
        { box: { x: dx, y: dy, w: ts, h: ts }, outer: 0, inner: Math.max(2, ts >> 4) },
        MARK_ALL,
        COL_HINT,
      );
    }
    if (dsFlags & DF_HINT_AREA && dsFlags & DF_LIT) {
      drawRectOutline(dr, dx + 1, dy + 1, ts - 1, ts - 1, COL_HINT_LITERF);
      drawRectOutline(dr, dx + 2, dy + 2, ts - 3, ts - 3, COL_HINT_LITERF);
    }
    if (dsFlags & DF_HINT_DARKREF) {
      drawRectOutline(dr, dx + 1, dy + 1, ts - 1, ts - 1, COL_HINT_DARKREF);
      drawRectOutline(dr, dx + 2, dy + 2, ts - 3, ts - 3, COL_HINT_DARKREF);
    }
    if (dsFlags & DF_LIGHT) {
      const lcol = dsFlags & DF_OVERLAP ? COL_ERROR : COL_LIGHT;
      dr.drawCircle(
        { x: dx + Math.floor(ts / 2), y: dy + Math.floor(ts / 2) },
        ds.crad,
        lcol,
        COL_BLACK,
      );
    } else if (
      dsFlags & DF_IMPOSSIBLE &&
      (!(dsFlags & DF_LIT) || ui.drawBlobsWhenLit)
    ) {
      const rlen = Math.floor(ts / 4);
      dr.drawRect(
        {
          x: dx + Math.floor(ts / 2) - Math.floor(rlen / 2),
          y: dy + Math.floor(ts / 2) - Math.floor(rlen / 2),
          w: rlen,
          h: rlen,
        },
        COL_BLACK,
      );
    }
  }

  // Check & Save: this cell contradicts the unique solution — a doubled
  // red inset ring (fork divergence; upstream has no mistake overlay).
  if (dsFlags & DF_WRONG) {
    drawRectOutline(dr, dx + 1, dy + 1, ts - 1, ts - 1, COL_ERROR);
    drawRectOutline(dr, dx + 2, dy + 2, ts - 3, ts - 3, COL_ERROR);
  }

  if (dsFlags & DF_CURSOR) {
    const coff = Math.floor(ts / 8);
    drawRectOutline(dr, dx + coff, dy + coff, ts - coff * 2, ts - coff * 2, COL_CURSOR);
  }

  dr.drawUpdate({ x: dx, y: dy, w: ts, h: ts });
}

// --- redraw --------------------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: LightupDrawState,
  _prev: LightupState | null,
  state: LightupState,
  _dir: number,
  ui: LightupUi,
  _animTime: number,
  flashTime: number,
  hint?: HintStep<LightupMove, LightupHint>,
  mistakes?: readonly LightupMistake[],
): void {
  const ts = ds.tilesize;
  const { w, h } = state;

  // Per-cell hint-role bits for the displayed step (fork addition).
  const hl = hint?.highlights;
  let hintBits: Map<number, number> | null = null;
  if (hl) {
    hintBits = new Map();
    const add = (cells: readonly { x: number; y: number }[], bit: number): void => {
      for (const c of cells) {
        const i = idx(c.x, c.y, w);
        hintBits?.set(i, (hintBits.get(i) ?? 0) | bit);
      }
    };
    add(hl.targets, DF_HINT_TARGET);
    add(hl.area, DF_HINT_AREA);
    if (hl.dark) add([hl.dark], DF_HINT_DARKREF);
    if (hl.clue) add([hl.clue], DF_HINT_CLUE);
  }

  const flashing = flashTime > 0 && Math.floor((flashTime * 3) / FLASH_TIME) !== 1;

  if (!ds.started) {
    const size = computeSize({ w, h }, ts);
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_BACKGROUND);
    drawRectOutline(
      dr,
      coord(0, ts) - 1,
      coord(0, ts) - 1,
      ts * w + 2,
      ts * h + 2,
      COL_GRID,
    );
    dr.drawUpdate({ x: 0, y: 0, w: size.w, h: size.h });
    ds.started = true;
  }

  const wrong = mistakes?.length
    ? new Set(mistakes.map((m) => idx(m.x, m.y, w)))
    : null;

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const i = idx(x, y, w);
      let df = tileFlags(state, ui, x, y, flashing);
      if (wrong?.has(i)) df |= DF_WRONG;
      if (ui.drawBlobsWhenLit) df |= DF_BLOBS_PREF;
      if (hintBits?.has(i)) df |= hintBits.get(i) ?? 0;
      if (ds.cache[i] !== df) {
        ds.cache[i] = df;
        tileRedraw(dr, ds, state, ui, x, y);
      }
    }
  }
}
