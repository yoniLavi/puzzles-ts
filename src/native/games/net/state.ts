/**
 * Types, bit vocabulary and pure state helpers for Net.
 *
 * Net is the original of the collection: a `w × h` grid of wire tiles whose
 * solved configuration is a spanning tree rooted at a movable source. The
 * player rotates each tile until every tile is powered from the source. The
 * model — direction algebra, the hex desc codec, the spanning-tree grower, the
 * power flood — is shared with Netslide in `engine/wires.ts`; only the
 * rearrangement (rotate-in-place vs slide-a-line) and the renderer differ.
 */

import { parseLeadingInt } from "../../engine/params.ts";
import {
  addBorderBarriers,
  computeActive as computeActiveWires,
  D,
  L,
  parseWireDesc,
  R,
  U,
  validateWireDesc,
} from "../../engine/wires.ts";
import { type RandomState, randomNew } from "../../random/index.ts";

/* ----------------------------------------------------------------------
 * Bit vocabulary.
 *
 * A tile's low four bits are its wires (`R U L D`); the same four bits name a
 * neighbour direction (all in `engine/wires.ts`). Net owns the two high bits:
 * `LOCKED` (the player has pinned this tile) and `ACTIVE` (computed by the
 * power flood, never stored in the desc).
 */

export { D, L, R, U } from "../../engine/wires.ts";

/** The player has locked this tile; it cannot be rotated. Stored in `tiles`. */
export const LOCKED = 0x10;
/** Powered from the source. Computed by {@link computeActive}, not persisted. */
export const ACTIVE = 0x20;

/* ----------------------------------------------------------------------
 * Params.
 */

export interface NetParams {
  w: number;
  h: number;
  /** Walls wrap around: the grid is a torus with no border barriers. */
  wrapping: boolean;
  /** Generate a puzzle with a guaranteed unique solution (guess-free). */
  unique: boolean;
  /** Fraction of the candidate wall sites that become barriers, in [0, 1]. */
  barrierProbability: number;
}

/** C `atof`: parse a leading float, yielding 0 for garbage — never `NaN`,
 * which would slip past every `<`/`>` bound check in `validateParams`. */
export function atof(s: string): number {
  const value = Number.parseFloat(s);
  return Number.isNaN(value) ? 0 : value;
}

/**
 * Reproduces C's `%g` — six significant digits, trailing zeros stripped,
 * exponential form outside [1e-4, 1e6). `encodeParams` writes the barrier
 * probability with `%g` and `decodeParams` reads it back, and the *board*
 * depends on the value (`floor(p × candidates)` barriers get placed), so a
 * round-trip that rounded differently would silently generate a different game.
 */
export function formatG(value: number): string {
  if (value === 0) return "0";
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  if (exponent < -4 || exponent >= 6) {
    const [mantissa, exp] = value.toExponential(5).split("e");
    return `${stripTrailingZeros(mantissa)}e${exp[0]}${exp.slice(1).padStart(2, "0")}`;
  }
  return stripTrailingZeros(value.toFixed(Math.max(0, 5 - exponent)));
}

function stripTrailingZeros(s: string): string {
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

export function defaultParams(): NetParams {
  return { w: 5, h: 5, wrapping: false, unique: true, barrierProbability: 0 };
}

export function encodeParams(p: NetParams, full: boolean): string {
  let s = `${p.w}x${p.h}`;
  if (p.wrapping) s += "w";
  if (full && p.barrierProbability) s += `b${formatG(p.barrierProbability)}`;
  if (full && !p.unique) s += "a";
  return s;
}

export function decodeParams(s: string): NetParams {
  // Start from the struct defaults, exactly as the midend (default_params then
  // decode_params): a suffix that's absent leaves the default in place.
  const p = defaultParams();

  const width = parseLeadingInt(s, 0);
  p.w = width.value;
  let i = width.next;

  if (s[i] === "x") {
    const height = parseLeadingInt(s, i + 1);
    p.h = height.value;
    i = height.next;
  } else {
    p.h = p.w;
  }

  while (i < s.length) {
    if (s[i] === "w") {
      p.wrapping = true;
      i++;
    } else if (s[i] === "b") {
      i++;
      const start = i;
      while (i < s.length && (/[0-9]/.test(s[i]) || s[i] === ".")) i++;
      // The C stores this as a `float`, so round to single precision now.
      p.barrierProbability = Math.fround(atof(s.slice(start, i)));
    } else if (s[i] === "a") {
      p.unique = false;
      i++;
    } else {
      i++; // skip any other gunk, as upstream
    }
  }
  return p;
}

export function validateParams(p: NetParams, full: boolean): string | null {
  if (p.w <= 0 || p.h <= 0) return "Width and height must both be greater than zero";
  if (p.w <= 1 && p.h <= 1)
    return "At least one of width and height must be greater than one";
  if (p.w * p.h > 1_000_000)
    return "Width times height must not be unreasonably large";
  if (p.barrierProbability < 0) return "Barrier probability may not be negative";
  if (p.barrierProbability > 1) return "Barrier probability may not be greater than 1";
  // A wrapping grid with a dimension of 2 provably cannot have a unique
  // solution (net.c carries the 40-line proof); reject it up front.
  if (full && p.unique && p.wrapping && (p.w === 2 || p.h === 2))
    return "No wrapping puzzle with a width or height of 2 can have a unique solution";
  return null;
}

/* ----------------------------------------------------------------------
 * Moves.
 *
 * Upstream's move grammar is `;`-separated `A|C|F|L` + `x,y` tokens, with a
 * `J`/`S` prefix on jumble/solve batches. Rendered here as a discriminated
 * union of the four shapes the game can actually produce.
 */

/** One tile operation inside a jumble/solve batch. */
export type NetOp = { op: "A" | "C" | "F" | "L"; x: number; y: number };

export type NetMove =
  /** A single rotation of one tile — animates. `A` = anticlockwise,
   * `C` = clockwise, `F` = 180°. */
  | { type: "rotate"; op: "A" | "C" | "F"; x: number; y: number }
  /** Toggle the lock on one tile — no animation. */
  | { type: "lock"; x: number; y: number }
  /** Jumble: rotate every unlocked tile a random amount, expanded to an
   * explicit op list so replay is deterministic (design D4). No animation. */
  | { type: "jumble"; ops: NetOp[] }
  /** Solve: transform the current grid into the solution. No animation, and
   * sets `usedSolve`. */
  | { type: "solve"; ops: NetOp[] };

/* ----------------------------------------------------------------------
 * State.
 */

export interface NetState {
  readonly w: number;
  readonly h: number;
  /** Re-derived from the barriers: a wrapping grid whose every border edge
   * carries a wall is de-facto non-wrapping (net.c:1712), which disables
   * origin-shifting. */
  readonly wrapping: boolean;

  /** Wire masks with the `LOCKED` bit, row-major. The only part of the state a
   * move changes. */
  readonly tiles: Uint8Array;
  /** Walls, row-major (low four bits only; Net derives corner-join flags per
   * frame in the renderer). Fixed for the whole game, so every state shares the
   * one array by reference and a move copies only `tiles`. Nothing after
   * `newState` writes to it (`Object.freeze` is not available on a populated
   * typed array, so the `readonly` type is the guarantee). */
  readonly barriers: Uint8Array;

  readonly completed: boolean;
  readonly usedSolve: boolean;

  /** The tile last rotated and which way, for the rotation animation. `dir` is
   * 0 (no animation — a lock, jumble or solve), +1 (`A`), −1 (`C`) or +2 (`F`).
   */
  readonly lastRotateX: number;
  readonly lastRotateY: number;
  readonly lastRotateDir: number;
}

export function cloneState(s: NetState): NetState {
  return { ...s, tiles: new Uint8Array(s.tiles) };
}

export function validateDesc(p: NetParams, desc: string): string | null {
  return validateWireDesc(p.w, p.h, desc);
}

/**
 * Parse a desc into the initial state: the wire grid, the barriers named by the
 * desc's `v`/`h` markers, and the border wall a non-wrapping game is fenced in
 * by. A *wrapping* game whose every border edge already carries a wall is
 * re-derived as non-wrapping, matching upstream so a bounded grid handed a
 * wrapping desc still disables origin-shifting.
 */
export function newState(p: NetParams, desc: string): NetState {
  const { w, h } = p;
  const { tiles, barriers } = parseWireDesc(w, h, desc);

  let wrapping = p.wrapping;
  if (!p.wrapping) {
    addBorderBarriers(barriers, w, h);
  } else {
    wrapping = false;
    for (let x = 0; x < w; x++) {
      if (!(barriers[x] & U) || !(barriers[(h - 1) * w + x] & D)) wrapping = true;
    }
    for (let y = 0; y < h; y++) {
      if (!(barriers[y * w] & L) || !(barriers[y * w + (w - 1)] & R)) wrapping = true;
    }
  }

  return {
    w,
    h,
    wrapping,
    tiles,
    barriers,
    completed: false,
    usedSolve: false,
    lastRotateX: 0,
    lastRotateY: 0,
    lastRotateDir: 0,
  };
}

/* ----------------------------------------------------------------------
 * Powering + completion.
 */

/** Flood outward from `(cx, cy)`, marking the tiles powered from there. */
export function computeActive(s: NetState, cx: number, cy: number): Uint8Array {
  return computeActiveWires(s.w, s.h, s.tiles, s.barriers, cx, cy, ACTIVE);
}

/**
 * Is the whole grid connected? Upstream starts the flood from the *first
 * non-empty tile* (not the ui source), because connectedness is independent of
 * where you start; the game is complete when every non-empty tile is powered.
 */
export function isComplete(s: NetState): boolean {
  const n = s.w * s.h;
  let pos = 0;
  while (pos < n && !(s.tiles[pos] & 0xf)) pos++;
  if (pos >= n) return true; // an all-empty grid is trivially "complete"

  const active = computeActiveWires(
    s.w,
    s.h,
    s.tiles,
    s.barriers,
    pos % s.w,
    Math.floor(pos / s.w),
    ACTIVE,
  );
  for (let i = 0; i < n; i++) {
    if (s.tiles[i] & 0xf && !active[i]) return false;
  }
  return true;
}

/* ----------------------------------------------------------------------
 * UI.
 */

export interface NetUi {
  /** Origin: the physical top-left of a wrapping grid, shifted by Shift+arrow.
   * Always `(0, 0)` on a non-wrapping grid. */
  orgX: number;
  orgY: number;
  /** The source (the black box power flows from), moved by Ctrl+arrow. */
  cx: number;
  cy: number;
  /** The keyboard cursor. */
  curX: number;
  curY: number;
  curVisible: boolean;
  /** Highlight loops that involve unlocked squares (the one preference). */
  unlockedLoops: boolean;
  /** The jumble RNG — seeded fresh from entropy, never serialised. The
   * *expanded* jumble move (an explicit op list) is what replay depends on, so
   * this producing different rotations each session is fine (design D4). */
  rs: RandomState;
}

/** 16 bytes of entropy for the jumble RNG. */
function entropySeed(): Uint8Array {
  const bytes = new Uint8Array(16);
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

export function newUi(s: NetState): NetUi {
  return {
    orgX: 0,
    orgY: 0,
    cx: Math.floor(s.w / 2),
    cy: Math.floor(s.h / 2),
    curX: Math.floor(s.w / 2),
    curY: Math.floor(s.h / 2),
    curVisible: false,
    unlockedLoops: true,
    rs: randomNew(entropySeed()),
  };
}
