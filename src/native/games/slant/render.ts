/**
 * Slant rendering — faithful port of `game_redraw` / `draw_tile` /
 * `draw_clue` in slant.c. The drawstate diffs a `(w+2)×(h+2)` packed
 * `Int32Array` covering tiles −1…w × −1…h (the border ring draws border
 * clue circles and the grid's outer corner dots); every overlay — errors,
 * cursor, flash, grounded fade, the findMistakes outline — lives in the
 * packed word, so the diff key covers it by construction.
 *
 * Geometry note: the web C build defines `NARROW_BORDERS`
 * (cmake/platforms/webapp.cmake), so the border is `CLUE_RADIUS + 1`, not a
 * full tile — parity is with what the browser actually showed.
 */
import type { Colour, Size } from "../../../puzzle/types.ts";
import { mkhighlight } from "../../engine/colour-mkhighlight.ts";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import type { SlantHint } from "./index.ts";
import type {
  SlantMistake,
  SlantMove,
  SlantParams,
  SlantState,
  SlantUi,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 32;
export const FLASH_TIME = 0.3;

// --- palette (mirrors the slant.c colour enum index-for-index) -----------
export const COL_BACKGROUND = 0;
export const COL_GRID = 1;
export const COL_INK = 2;
export const COL_SLANT1 = 3;
export const COL_SLANT2 = 4;
export const COL_ERROR = 5;
export const COL_CURSOR = 6;
export const COL_FILLEDSQUARE = 7;
export const COL_GROUNDED = 8;
// Fork hint palette, appended past the upstream enum so slant's dark-mode
// overrides (indices 1/8) never touch these.
export const COL_HINT = 9; // forced square(s), blue fill (highlight only)
export const COL_HINT_CELL = 10; // evidence area, light-blue shade
export const COL_HINT_REF = 11; // a cited filled anchor (teal ring)

export function colours(defaultBackground: Colour): Colour[] {
  const { background, highlight } = mkhighlight(defaultBackground);
  const scale = (c: Colour, f: number): Colour => [c[0] * f, c[1] * f, c[2] * f];
  const out: Colour[] = [];
  out[COL_BACKGROUND] = background;
  out[COL_GRID] = scale(background, 0.7);
  out[COL_INK] = [0, 0, 0];
  out[COL_SLANT1] = [0, 0, 0];
  out[COL_SLANT2] = [0, 0, 0];
  out[COL_ERROR] = [1, 0, 0];
  out[COL_CURSOR] = highlight; // a background highlight, per game_mkhighlight
  out[COL_FILLEDSQUARE] = background;
  out[COL_GROUNDED] = scale(background, 0.8);
  out[COL_HINT] = [0.13, 0.5, 0.85];
  out[COL_HINT_CELL] = [0.82, 0.9, 0.99];
  out[COL_HINT_REF] = [0.0, 0.78, 0.55];
  return out;
}

// --- packed tile bits (upstream's drawstate flags; also the cache key) ----
const BACKSLASH = 0x00000001;
const FORWSLASH = 0x00000002;
const L_T = 0x00000004;
const ERR_L_T = 0x00000008;
const L_B = 0x00000010;
const ERR_L_B = 0x00000020;
const T_L = 0x00000040;
const ERR_T_L = 0x00000080;
const T_R = 0x00000100;
const ERR_T_R = 0x00000200;
const C_TL = 0x00000400;
const ERR_C_TL = 0x00000800;
const FLASH = 0x00001000;
const ERRSLASH = 0x00002000;
const ERR_TL = 0x00004000;
const ERR_TR = 0x00008000;
const ERR_BL = 0x00010000;
const ERR_BR = 0x00020000;
const CURSOR = 0x00040000;
const GROUNDED = 0x00080000;
// Our findMistakes overlay bit (no upstream analogue): an inset red outline.
const MISTAKE = 0x00100000;
// Fork hint overlay bits (no upstream analogue). Target/evidence/ring are
// per-square; the four HINT_* corner bits recolour a driving clue's digit in
// the four tiles that draw it (mirroring the ERR_TL/TR/BL/BR clue pattern).
const HINT_TARGET = 0x00200000;
const HINT_EVID = 0x00400000;
const HINT_REF = 0x00800000;
const HINT_TL = 0x01000000;
const HINT_TR = 0x02000000;
const HINT_BL = 0x04000000;
const HINT_BR = 0x08000000;

// --- geometry -------------------------------------------------------------
const clueRadius = (ts: number) => Math.floor(ts / 3);
const clueTextSize = (ts: number) => Math.floor(ts / 2);
const border = (ts: number) => clueRadius(ts) + 1; // NARROW_BORDERS
const coord = (n: number, ts: number) => n * ts + border(ts);

export function computeSize(p: SlantParams, ts: number): Size {
  return { w: 2 * border(ts) + p.w * ts + 1, h: 2 * border(ts) + p.h * ts + 1 };
}

// --- draw state -----------------------------------------------------------

export interface SlantDrawState {
  started: boolean;
  tilesize: number;
  w: number;
  h: number;
  /** Last-drawn packed word per tile of the (w+2)×(h+2) ring-extended grid;
   * −1 forces a draw. */
  grid: Int32Array;
  /** Scratch for the frame being built (upstream `todraw`). */
  todraw: Int32Array;
}

export function newDrawState(state: SlantState): SlantDrawState {
  const n = (state.w + 2) * (state.h + 2);
  return {
    started: false,
    tilesize: 0,
    w: state.w,
    h: state.h,
    grid: new Int32Array(n).fill(-1),
    todraw: new Int32Array(n).fill(-1),
  };
}

// --- tile drawing ----------------------------------------------------------

function drawClue(
  dr: GameDrawing,
  ts: number,
  x: number,
  y: number,
  v: number,
  err: boolean,
  hint: boolean,
): void {
  if (v < 0) return;
  const ccol = (x ^ y) & 1 ? COL_SLANT1 : COL_SLANT2;
  const tcol = err ? COL_ERROR : hint ? COL_HINT : COL_INK;
  dr.drawCircle(
    { x: coord(x, ts), y: coord(y, ts) },
    clueRadius(ts),
    COL_BACKGROUND,
    ccol,
  );
  dr.drawText(
    { x: coord(x, ts), y: coord(y, ts) },
    {
      align: "center",
      baseline: "mathematical",
      fontType: "variable",
      size: clueTextSize(ts),
    },
    tcol,
    String.fromCharCode(48 + v),
  );
}

function drawTile(
  dr: GameDrawing,
  ts: number,
  w: number,
  h: number,
  clues: Int8Array,
  x: number,
  y: number,
  v: number,
): void {
  const W = w + 1;
  const chess = (x ^ y) & 1;
  const fscol = chess ? COL_SLANT2 : COL_SLANT1;
  const bscol = chess ? COL_SLANT1 : COL_SLANT2;

  dr.clip({ x: coord(x, ts), y: coord(y, ts), w: ts, h: ts });

  dr.drawRect(
    { x: coord(x, ts), y: coord(y, ts), w: ts, h: ts },
    v & HINT_TARGET
      ? COL_HINT
      : v & FLASH
        ? COL_GRID
        : v & HINT_EVID
          ? COL_HINT_CELL
          : v & CURSOR
            ? COL_CURSOR
            : v & (BACKSLASH | FORWSLASH)
              ? COL_FILLEDSQUARE
              : COL_BACKGROUND,
  );

  // Grid lines.
  if (x >= 0 && x < w && y >= 0) {
    dr.drawRect({ x: coord(x, ts), y: coord(y, ts), w: ts + 1, h: 1 }, COL_GRID);
  }
  if (x >= 0 && x < w && y < h) {
    dr.drawRect({ x: coord(x, ts), y: coord(y + 1, ts), w: ts + 1, h: 1 }, COL_GRID);
  }
  if (y >= 0 && y < h && x >= 0) {
    dr.drawRect({ x: coord(x, ts), y: coord(y, ts), w: 1, h: ts + 1 }, COL_GRID);
  }
  if (y >= 0 && y < h && x < w) {
    dr.drawRect({ x: coord(x + 1, ts), y: coord(y, ts), w: 1, h: ts + 1 }, COL_GRID);
  }
  // The grid's four outer corner dots, drawn by the ring tiles.
  if (x === -1 && y === -1) {
    dr.drawRect({ x: coord(x + 1, ts), y: coord(y + 1, ts), w: 1, h: 1 }, COL_GRID);
  }
  if (x === -1 && y === h) {
    dr.drawRect({ x: coord(x + 1, ts), y: coord(y, ts), w: 1, h: 1 }, COL_GRID);
  }
  if (x === w && y === -1) {
    dr.drawRect({ x: coord(x, ts), y: coord(y + 1, ts), w: 1, h: 1 }, COL_GRID);
  }
  if (x === w && y === h) {
    dr.drawRect({ x: coord(x, ts), y: coord(y, ts), w: 1, h: 1 }, COL_GRID);
  }

  // The slash itself: three parallel 1px lines for thickness.
  if (v & BACKSLASH) {
    const scol = v & ERRSLASH ? COL_ERROR : v & GROUNDED ? COL_GROUNDED : bscol;
    const x0 = coord(x, ts);
    const y0 = coord(y, ts);
    const x1 = coord(x + 1, ts);
    const y1 = coord(y + 1, ts);
    dr.drawLine({ x: x0, y: y0 }, { x: x1, y: y1 }, scol, 1);
    dr.drawLine({ x: x0 + 1, y: y0 }, { x: x1, y: y1 - 1 }, scol, 1);
    dr.drawLine({ x: x0, y: y0 + 1 }, { x: x1 - 1, y: y1 }, scol, 1);
  } else if (v & FORWSLASH) {
    const scol = v & ERRSLASH ? COL_ERROR : v & GROUNDED ? COL_GROUNDED : fscol;
    const x0 = coord(x + 1, ts);
    const y0 = coord(y, ts);
    const x1 = coord(x, ts);
    const y1 = coord(y + 1, ts);
    dr.drawLine({ x: x0, y: y0 }, { x: x1, y: y1 }, scol, 1);
    dr.drawLine({ x: x0 - 1, y: y0 }, { x: x1, y: y1 - 1 }, scol, 1);
    dr.drawLine({ x: x0, y: y0 + 1 }, { x: x1 + 1, y: y1 }, scol, 1);
  }

  // Dots on grid corners that appear when a slash is in a neighbouring cell.
  if (v & (L_T | BACKSLASH)) {
    dr.drawRect(
      { x: coord(x, ts), y: coord(y, ts) + 1, w: 1, h: 1 },
      v & ERR_L_T ? COL_ERROR : bscol,
    );
  }
  if (v & (L_B | FORWSLASH)) {
    dr.drawRect(
      { x: coord(x, ts), y: coord(y + 1, ts) - 1, w: 1, h: 1 },
      v & ERR_L_B ? COL_ERROR : fscol,
    );
  }
  if (v & (T_L | BACKSLASH)) {
    dr.drawRect(
      { x: coord(x, ts) + 1, y: coord(y, ts), w: 1, h: 1 },
      v & ERR_T_L ? COL_ERROR : bscol,
    );
  }
  if (v & (T_R | FORWSLASH)) {
    dr.drawRect(
      { x: coord(x + 1, ts) - 1, y: coord(y, ts), w: 1, h: 1 },
      v & ERR_T_R ? COL_ERROR : fscol,
    );
  }
  if (v & (C_TL | BACKSLASH)) {
    dr.drawRect(
      { x: coord(x, ts), y: coord(y, ts), w: 1, h: 1 },
      v & ERR_C_TL ? COL_ERROR : bscol,
    );
  }

  // Hint anchor: a doubled teal ring on a cited already-filled square (the
  // "share a fate" premise of an equivalence firing), drawn over its slash.
  if (v & HINT_REF) {
    const inset = Math.max(1, Math.floor(ts / 12));
    const sx = coord(x, ts) + inset;
    const sy = coord(y, ts) + inset;
    const span = ts - 2 * inset;
    dr.drawRect({ x: sx, y: sy, w: span, h: 1 }, COL_HINT_REF);
    dr.drawRect({ x: sx, y: sy + span - 1, w: span, h: 1 }, COL_HINT_REF);
    dr.drawRect({ x: sx, y: sy, w: 1, h: span }, COL_HINT_REF);
    dr.drawRect({ x: sx + span - 1, y: sy, w: 1, h: span }, COL_HINT_REF);
    dr.drawRect({ x: sx + 1, y: sy + 1, w: span - 2, h: 1 }, COL_HINT_REF);
    dr.drawRect({ x: sx + 1, y: sy + span - 2, w: span - 2, h: 1 }, COL_HINT_REF);
    dr.drawRect({ x: sx + 1, y: sy + 1, w: 1, h: span - 2 }, COL_HINT_REF);
    dr.drawRect({ x: sx + span - 2, y: sy + 1, w: 1, h: span - 2 }, COL_HINT_REF);
  }

  // findMistakes overlay: an inset red outline (the fork's cross-game
  // mistake styling), distinct from the live loop-error red slash.
  if (v & MISTAKE) {
    const t = Math.max(1, Math.floor(ts / 16));
    const inset = Math.max(2, Math.floor(ts / 8));
    const sx = coord(x, ts) + inset;
    const sy = coord(y, ts) + inset;
    const span = ts - 2 * inset;
    dr.drawRect({ x: sx, y: sy, w: span, h: t }, COL_ERROR);
    dr.drawRect({ x: sx, y: sy + span - t, w: span, h: t }, COL_ERROR);
    dr.drawRect({ x: sx, y: sy, w: t, h: span }, COL_ERROR);
    dr.drawRect({ x: sx + span - t, y: sy, w: t, h: span }, COL_ERROR);
  }

  // And finally the clues at the tile's corners.
  if (x >= 0 && y >= 0) {
    drawClue(dr, ts, x, y, clues[y * W + x], (v & ERR_TL) !== 0, (v & HINT_TL) !== 0);
  }
  if (x < w && y >= 0) {
    drawClue(
      dr,
      ts,
      x + 1,
      y,
      clues[y * W + (x + 1)],
      (v & ERR_TR) !== 0,
      (v & HINT_TR) !== 0,
    );
  }
  if (x >= 0 && y < h) {
    drawClue(
      dr,
      ts,
      x,
      y + 1,
      clues[(y + 1) * W + x],
      (v & ERR_BL) !== 0,
      (v & HINT_BL) !== 0,
    );
  }
  if (x < w && y < h) {
    drawClue(
      dr,
      ts,
      x + 1,
      y + 1,
      clues[(y + 1) * W + (x + 1)],
      (v & ERR_BR) !== 0,
      (v & HINT_BR) !== 0,
    );
  }

  dr.unclip();
  dr.drawUpdate({ x: coord(x, ts), y: coord(y, ts), w: ts, h: ts });
}

// --- redraw -----------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: SlantDrawState | null,
  _prev: SlantState | null,
  state: SlantState,
  _dir: number,
  ui: SlantUi,
  _animTime: number,
  flashTime: number,
  hint?: HintStep<SlantMove, SlantHint>,
  mistakes?: readonly SlantMistake[],
): void {
  if (!ds) return;
  const ts = ds.tilesize;
  const { w, h, clues, soln } = state;
  const W = w + 1;
  const H = h + 1;
  const stride = w + 2;
  const ti = (x: number, y: number) => (y + 1) * stride + (x + 1);
  const todraw = ds.todraw;

  if (!ds.started) {
    // The engine paints no pixels of its own: fill the whole background.
    const size = computeSize({ w, h, diff: 0 }, ts);
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_BACKGROUND);
    dr.drawUpdate({ x: 0, y: 0, w: size.w, h: size.h });
    ds.started = true;
  }

  // The upstream 3-phase flash: on for the first and last thirds.
  const flashing = flashTime > 0 && Math.floor((flashTime * 3) / FLASH_TIME) !== 1;

  // Work out where all the slashes are — a slash in one square affects the
  // drawing of its neighbours (corner dots), hence the two-phase build.
  for (let y = -1; y <= h; y++) {
    for (let x = -1; x <= w; x++) {
      todraw[ti(x, y)] = x >= 0 && x < w && y >= 0 && y < h && flashing ? FLASH : 0;
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const err = state.loopErrors[y * w + x] !== 0;
      if (soln[y * w + x] < 0) {
        todraw[ti(x, y)] |= BACKSLASH;
        todraw[ti(x, y + 1)] |= T_R;
        todraw[ti(x + 1, y)] |= L_B;
        todraw[ti(x + 1, y + 1)] |= C_TL;
        if (err) {
          todraw[ti(x, y)] |= ERRSLASH | ERR_T_L | ERR_L_T | ERR_C_TL;
          todraw[ti(x, y + 1)] |= ERR_T_R;
          todraw[ti(x + 1, y)] |= ERR_L_B;
          todraw[ti(x + 1, y + 1)] |= ERR_C_TL;
        }
      } else if (soln[y * w + x] > 0) {
        todraw[ti(x, y)] |= FORWSLASH;
        todraw[ti(x + 1, y)] |= L_T | C_TL;
        todraw[ti(x, y + 1)] |= T_L | C_TL;
        if (err) {
          todraw[ti(x, y)] |= ERRSLASH | ERR_L_B | ERR_T_R;
          todraw[ti(x + 1, y)] |= ERR_L_T | ERR_C_TL;
          todraw[ti(x, y + 1)] |= ERR_T_L | ERR_C_TL;
        }
      }
      if (ui.cursorVisible && ui.cx === x && ui.cy === y) {
        todraw[ti(x, y)] |= CURSOR;
      }
    }
  }

  // Clue-vertex errors light the clue circle red in all four tiles that
  // draw it.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (state.vertexErrors[y * W + x]) {
        todraw[y * stride + x] |= ERR_BR;
        todraw[y * stride + (x + 1)] |= ERR_BL;
        todraw[(y + 1) * stride + x] |= ERR_TR;
        todraw[(y + 1) * stride + (x + 1)] |= ERR_TL;
      }
    }
  }

  // Grounded fade (pref): a border-connected diagonal can never loop.
  if (ui.fadeGrounded) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (state.grounded[y * w + x]) todraw[ti(x, y)] |= GROUNDED;
      }
    }
  }

  // findMistakes overlay.
  if (mistakes) {
    for (const m of mistakes) todraw[ti(m.x, m.y)] |= MISTAKE;
  }

  // Hint overlay: target square(s) blue, evidence shaded, anchor ringed, the
  // driving clue's digit recoloured in the four tiles that draw it.
  const hl = hint?.highlights;
  if (hl) {
    todraw[ti(hl.target.x, hl.target.y)] |= HINT_TARGET;
    if (hl.siblings) for (const s of hl.siblings) todraw[ti(s.x, s.y)] |= HINT_TARGET;
    if (hl.area) for (const a of hl.area) todraw[ti(a.x, a.y)] |= HINT_EVID;
    if (hl.ref) todraw[ti(hl.ref.x, hl.ref.y)] |= HINT_REF;
    if (hl.clue) {
      const { x: cx, y: cy } = hl.clue;
      todraw[cy * stride + cx] |= HINT_BR;
      todraw[cy * stride + (cx + 1)] |= HINT_BL;
      todraw[(cy + 1) * stride + cx] |= HINT_TR;
      todraw[(cy + 1) * stride + (cx + 1)] |= HINT_TL;
    }
  }

  // Draw the tiles whose packed word changed.
  for (let y = -1; y <= h; y++) {
    for (let x = -1; x <= w; x++) {
      const i = ti(x, y);
      if (todraw[i] !== ds.grid[i]) {
        drawTile(dr, ts, w, h, clues, x, y, todraw[i]);
        ds.grid[i] = todraw[i];
      }
    }
  }
}
