/**
 * Separate rendering — adapted from Palisade's `game_redraw`.
 *
 * Per-tile diffed loop over an `Int32Array` flag cache (the no-BigInt pattern).
 * Each tile draws its four three-valued border edges (wall / no-wall / unknown /
 * error), its letter, and any cursor box. Live error highlighting is recomputed
 * every frame from two DSFs over the current borders (black = wall-separated
 * regions, yellow = no-wall regions): a region that is over-size, undersize, or
 * has a dangling wall reddens the offending edge, and a cell whose letter repeats
 * within its wall-bounded region reddens the letter. The `findMistakes` overlay
 * (edges contradicting the unique solution) folds into the same edge-error bits.
 */
import type { Colour, Size } from "../../../puzzle/types.ts";
import { correctRegionColour, mkhighlight } from "../../engine/colour-mkhighlight.ts";
import type { GameDrawing } from "../../engine/game.ts";
import {
  BORDER,
  BORDER_D,
  BORDER_R,
  buildDsf,
  DISABLED,
  DX,
  DY,
  outOfBounds,
  type SeparateMistake,
  type SeparateParams,
  type SeparateState,
  type SeparateUi,
} from "./state.ts";

export const PREFERRED_TILE_SIZE = 48;
export const FLASH_TIME = 0.7;

const A = "A".charCodeAt(0);

// --- palette (mirrors Palisade's COL_* enum) ------------------------------

export const COL_BACKGROUND = 0;
export const COL_FLASH = 1;
export const COL_GRID = 2; // == letter colour == wall colour
export const COL_LINE_MAYBE = 3;
export const COL_LINE_NO = 4;
export const COL_ERROR = 5;
export const COL_CORRECT = 6; // a completed, correct region (shared grey shade)

const DARKER = 0.9;

export function colours(defaultBackground: Colour): Colour[] {
  const { background, highlight } = mkhighlight(defaultBackground);
  const out: Colour[] = [];
  out[COL_BACKGROUND] = background;
  out[COL_FLASH] = highlight;
  out[COL_GRID] = [0, 0, 0];
  out[COL_ERROR] = [1, 0, 0];
  out[COL_CORRECT] = correctRegionColour(background);
  out[COL_LINE_MAYBE] = [background[0] * DARKER, background[1] * DARKER, 0];
  out[COL_LINE_NO] = [
    background[0] * DARKER,
    background[1] * DARKER,
    background[2] * DARKER,
  ];
  return out;
}

// --- geometry -------------------------------------------------------------

export const tileWidth = (ts: number): number => Math.max(Math.floor((3 * ts) / 32), 1);
export const margin = (ts: number): number => Math.floor(ts / 2);
const center = (ts: number): number =>
  Math.floor(ts / 2) + Math.floor(tileWidth(ts) / 2);

export function computeSize(p: SeparateParams, ts: number): Size {
  return {
    w: p.w * ts + tileWidth(ts) + 2 * margin(ts),
    h: p.h * ts + tileWidth(ts) + 2 * margin(ts),
  };
}

/** Tile column/row for a pixel coordinate (upstream FROMCOORD). */
export function fromCoord(coord: number, ts: number): number {
  return Math.floor((coord - margin(ts)) / ts);
}

// --- packed flag bits ------------------------------------------------------

const BORDER_ERROR = (border: number): number => border << 8; // bits 8..11
const F_ERROR_LETTER = 1 << 12;
const F_FLASH = 1 << 13;
const CONTAINS_CURSOR = (x: number): number => x << 14; // 9 bits, 14..22
const F_CORRECT = 1 << 23; // a cell in a completed, correct region

// --- draw state ------------------------------------------------------------

export interface SeparateDrawState {
  started: boolean;
  tilesize: number;
  w: number;
  h: number;
  /** w·h cache of last-drawn packed tile flags; -1 forces a draw. */
  cache: Int32Array;
}

export function newDrawState(state: SeparateState): SeparateDrawState {
  return {
    started: false,
    tilesize: 0,
    w: state.w,
    h: state.h,
    cache: new Int32Array(state.w * state.h).fill(-1),
  };
}

// --- tile drawing ----------------------------------------------------------

function edgeColour(flags: number, dir: number): number {
  const b = BORDER(dir);
  if (flags & BORDER_ERROR(b)) return COL_ERROR;
  if (flags & b) return COL_GRID; // wall
  if (flags & DISABLED(b)) return COL_LINE_NO;
  return COL_LINE_MAYBE;
}

function drawTile(
  dr: GameDrawing,
  ts: number,
  r: number,
  c: number,
  flags: number,
  letter: number,
): void {
  const w = tileWidth(ts);
  const x = margin(ts) + ts * c;
  const y = margin(ts) + ts * r;

  dr.clip({ x, y, w: ts + w, h: ts + w });

  dr.drawRect(
    { x: x + w, y: y + w, w: ts - w, h: ts - w },
    flags & F_FLASH ? COL_FLASH : flags & F_CORRECT ? COL_CORRECT : COL_BACKGROUND,
  );

  dr.drawText(
    { x: x + center(ts), y: y + center(ts) },
    {
      align: "center",
      baseline: "mathematical",
      fontType: "variable",
      size: Math.floor(ts / 2),
    },
    flags & F_ERROR_LETTER ? COL_ERROR : COL_GRID,
    String.fromCharCode(A + letter),
  );

  // Four border edges (U, R, D, L).
  dr.drawRect({ x: x + w, y, w: ts - w, h: w }, edgeColour(flags, 0));
  dr.drawRect({ x: x + ts, y: y + w, w, h: ts - w }, edgeColour(flags, 1));
  dr.drawRect({ x: x + w, y: y + ts, w: ts - w, h: w }, edgeColour(flags, 2));
  dr.drawRect({ x, y: y + w, w, h: ts - w }, edgeColour(flags, 3));

  dr.unclip();
  dr.drawUpdate({ x, y, w: ts + w, h: ts + w });
}

// --- cursor ----------------------------------------------------------------

function drawCursor(dr: GameDrawing, ts: number, curX: number, curY: number): void {
  const offX = curX % 2;
  const offY = curY % 2;
  const x = margin(ts) + ts * Math.floor(curX / 2);
  const y = margin(ts) + ts * Math.floor(curY / 2);
  const w = tileWidth(ts);

  const centerX = x + (offX === 0 ? Math.floor(w / 2) : center(ts));
  const centerY = y + (offY === 0 ? Math.floor(w / 2) : center(ts));

  const third = Math.floor(ts / 3);
  const twoThird = Math.floor((2 * ts) / 3);
  const cw = offX === 0 ? third : twoThird;
  const ch = offY === 0 ? third : twoThird;

  const ox = centerX - Math.floor(cw / 2);
  const oy = centerY - Math.floor(ch / 2);
  dr.drawLine({ x: ox, y: oy }, { x: ox + cw, y: oy }, COL_GRID, 1);
  dr.drawLine({ x: ox + cw, y: oy }, { x: ox + cw, y: oy + ch }, COL_GRID, 1);
  dr.drawLine({ x: ox + cw, y: oy + ch }, { x: ox, y: oy + ch }, COL_GRID, 1);
  dr.drawLine({ x: ox, y: oy + ch }, { x: ox, y: oy }, COL_GRID, 1);
  dr.drawUpdate({ x: ox, y: oy, w: cw + 1, h: ch + 1 });
}

// --- redraw ----------------------------------------------------------------

export function redraw(
  dr: GameDrawing,
  ds: SeparateDrawState | null,
  _prev: SeparateState | null,
  state: SeparateState,
  _dir: number,
  ui: SeparateUi,
  _animTime: number,
  flashTime: number,
  _hint?: unknown,
  mistakes?: readonly SeparateMistake[],
): void {
  if (!ds) return;
  const ts = ds.tilesize;
  const { w, h, k, letters, borders } = state;
  const wh = w * h;
  const flash = Math.floor((flashTime * 5) / FLASH_TIME) % 2;

  if (!ds.started) {
    const size = computeSize({ w, h, k }, ts);
    dr.drawRect({ x: 0, y: 0, w: size.w, h: size.h }, COL_BACKGROUND);
    const tw = tileWidth(ts);
    for (let r = 0; r <= h; r++) {
      for (let c = 0; c <= w; c++) {
        dr.drawRect(
          { x: margin(ts) + ts * c, y: margin(ts) + ts * r, w: tw, h: tw },
          COL_GRID,
        );
      }
    }
    dr.drawUpdate({ x: 0, y: 0, w: size.w, h: size.h });
    ds.started = true;
  }

  const blackDsf = buildDsf(w, h, borders, true);
  const yellowDsf = buildDsf(w, h, borders, false);

  // Per black region: which letters appear, and how many times. A letter that
  // repeats within a *completed* (size-k) wall-bounded region reddens every cell
  // that carries it — the "you closed this region but it has two of the same
  // letter" signal. We gate on size === k so the untouched board (one big region
  // holding every letter k times) stays clean, mirroring Palisade's philosophy
  // of only flagging provably-wrong state.
  const regionCounts = new Map<number, Int32Array>();
  for (let i = 0; i < wh; i++) {
    const root = blackDsf.canonify(i);
    let counts = regionCounts.get(root);
    if (!counts) {
      counts = new Int32Array(k);
      regionCounts.set(root, counts);
    }
    counts[letters[i]]++;
  }

  // Completed-and-correct regions: a wall-bounded (black) component of exactly
  // `k` cells holding one of each letter (no duplicate) with no wall interior to
  // it. These shade with the shared completed-region colour (Rect's convention)
  // to signal validity — the same local-correctness feedback Galaxies/Rect give.
  // Start each right-sized component valid, then invalidate on a duplicate letter
  // or an interior (dangling) wall.
  const validRoot = new Map<number, boolean>();
  for (let i = 0; i < wh; i++) {
    const r = blackDsf.canonify(i);
    if (validRoot.has(r)) continue;
    let ok = blackDsf.size(r) === k;
    const counts = regionCounts.get(r);
    if (ok && counts) for (let n = 0; n < k; n++) if (counts[n] > 1) ok = false;
    validRoot.set(r, ok);
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x + 1 < w && borders[i] & BORDER_R && blackDsf.equivalent(i, i + 1))
        validRoot.set(blackDsf.canonify(i), false);
      if (y + 1 < h && borders[i] & BORDER_D && blackDsf.equivalent(i, i + w))
        validRoot.set(blackDsf.canonify(i), false);
    }
  }

  // Fold the findMistakes overlay into per-edge error bits.
  const mistakeMask = new Int32Array(wh);
  if (mistakes) {
    for (const m of mistakes) mistakeMask[m.y * w + m.x] |= BORDER_ERROR(BORDER(m.dir));
  }

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const i = r * w + c;
      let flags = borders[i] | mistakeMask[i];

      if (flash) flags |= F_FLASH;

      const counts = regionCounts.get(blackDsf.canonify(i));
      if (counts && blackDsf.size(i) === k && counts[letters[i]] > 1)
        flags |= F_ERROR_LETTER;

      if (validRoot.get(blackDsf.canonify(i))) flags |= F_CORRECT;

      if (ui.show) {
        for (let u = 0; u < 3; u++) {
          for (let v = 0; v < 3; v++) {
            if (ui.x === 2 * c + u && ui.y === 2 * r + v)
              flags |= CONTAINS_CURSOR(1 << (3 * u + v));
          }
        }
      }

      for (let dir = 0; dir < 4; dir++) {
        const cc = c + DX[dir];
        const rr = r + DY[dir];
        if (outOfBounds(cc, rr, w, h)) continue;
        const ii = rr * w + cc;
        const tooLarge =
          (yellowDsf.size(i) > k || yellowDsf.size(ii) > k) &&
          !yellowDsf.equivalent(i, ii);
        const tooSmall =
          (blackDsf.size(i) < k || blackDsf.size(ii) < k) &&
          !blackDsf.equivalent(i, ii);
        const dangling =
          borders[i] & BORDER(dir) &&
          (yellowDsf.equivalent(i, ii) ||
            (blackDsf.size(i) <= k && blackDsf.equivalent(i, ii)));
        if (tooLarge || tooSmall || dangling) flags |= BORDER_ERROR(BORDER(dir));
      }

      if (ds.cache[i] !== flags) {
        ds.cache[i] = flags;
        drawTile(dr, ts, r, c, flags, letters[i]);
      }
    }
  }

  if (ui.show) drawCursor(dr, ts, ui.x, ui.y);
}
