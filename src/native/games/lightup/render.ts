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
 * The palette stays index-for-index with the upstream colour enum —
 * the app's dark-mode `paletteOverrides` for lightup target indices 2
 * (black) and 3 (light).
 */
import type { Colour, Size } from "../../../puzzle/types.ts";
import { drawRectOutline } from "../../engine/draw.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
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
// Fork hint colours, appended past the C enum (lightup's dark-mode
// paletteOverrides touch only indices 2/3, so these are safe). The digit
// of a driving clue recolours COL_HINT (the Pattern clue↔move tie).
export const COL_HINT = 7; // forced cell(s), blue fill (highlight only)
export const COL_HINT_CELL = 8; // evidence: light-blue shade / digit on black
export const COL_HINT_LITREF = 9; // cited lit/bulb premise (teal ring)
export const COL_HINT_DARKREF = 10; // the unlit square a deduction is about (amber ring)

export function colours(defaultBackground: Colour): Colour[] {
  const bg = defaultBackground;
  const out: Colour[] = [];
  out[COL_BACKGROUND] = bg;
  out[COL_GRID] = [bg[0] / 1.5, bg[1] / 1.5, bg[2] / 1.5];
  out[COL_BLACK] = [0, 0, 0];
  out[COL_LIGHT] = [1, 1, 1];
  out[COL_LIT] = [1, 1, 0];
  out[COL_ERROR] = [1, 0.25, 0.25];
  out[COL_CURSOR] = [bg[0] / 2, bg[1] / 2, bg[2] / 2];
  out[COL_HINT] = [0.13, 0.5, 0.85];
  out[COL_HINT_CELL] = [0.82, 0.9, 0.99];
  out[COL_HINT_LITREF] = [0.0, 0.78, 0.55];
  out[COL_HINT_DARKREF] = [0.98, 0.78, 0.42];
  return out;
}

// --- geometry -----------------------------------------------------------------

export const border = (ts: number): number => Math.floor(ts / 2);
export const coord = (v: number, ts: number): number => v * ts + border(ts);
/** Pixel → cell, upstream FROMCOORD (safe for coords just left of the
 * border thanks to the +TILE_SIZE shift). */
export const fromCoord = (v: number, ts: number): number =>
  Math.floor((v - border(ts) + ts) / ts) - 1;

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
const DF_HINT_AREA = 4096; // evidence — shade when dark, teal ring when lit
const DF_HINT_DARKREF = 8192; // the unlit square the deduction is about — amber ring
const DF_HINT_CLUE = 16384; // driving clue — digit recoloured

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
  if (ui.cursorShow && x === ui.x && y === ui.y) ret |= DF_CURSOR;

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
      // A hint's driving clue recolours its digit COL_HINT (the Pattern
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
    // Hint roles (fork): a target square fills COL_HINT (it is never lit —
    // targets are always placeable squares); a dark evidence square shades
    // COL_HINT_CELL (its blob, if any, draws on top); a *lit* evidence
    // square keeps its yellow (the fill would hide the "already lit"
    // premise) and gets a teal ring below instead.
    const fill =
      dsFlags & DF_HINT_TARGET
        ? COL_HINT
        : dsFlags & DF_HINT_AREA && !(dsFlags & DF_LIT)
          ? COL_HINT_CELL
          : dsFlags & DF_LIT
            ? lit
            : COL_BACKGROUND;
    dr.drawRect({ x: dx, y: dy, w: ts, h: ts }, fill);
    drawRectOutline(dr, dx, dy, ts, ts, COL_GRID);
    if (dsFlags & DF_HINT_AREA && dsFlags & DF_LIT) {
      drawRectOutline(dr, dx + 1, dy + 1, ts - 1, ts - 1, COL_HINT_LITREF);
      drawRectOutline(dr, dx + 2, dy + 2, ts - 3, ts - 3, COL_HINT_LITREF);
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
  ds: LightupDrawState | null,
  _prev: LightupState | null,
  state: LightupState,
  _dir: number,
  ui: LightupUi,
  _animTime: number,
  flashTime: number,
  hint?: HintStep<LightupMove, LightupHint>,
  mistakes?: readonly LightupMistake[],
): void {
  if (!ds) return;
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
