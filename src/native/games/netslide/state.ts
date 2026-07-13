/**
 * Types, bit vocabulary and pure state helpers for Netslide.
 *
 * Netslide (Richard Boulton's cross between Net and Sixteen) is a grid of
 * Net wire tiles whose solved configuration is a spanning tree rooted at the
 * centre tile. The player slides whole rows and columns toroidally — every
 * line except the centre row and the centre column — until every tile is
 * connected to, and therefore powered by, the centre.
 */

import { parseLeadingInt } from "../../engine/params.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_UP,
} from "../../engine/pointer.ts";

/* ----------------------------------------------------------------------
 * Bit vocabulary.
 *
 * A tile's wires are a 4-bit mask; the same four bits name a neighbour
 * direction. The barrier grid reuses those low four bits for "there is a wall
 * on this side" and the high four for the corner-joining flags that let
 * barrier junctions be drawn without a notch.
 */

export const R = 0x01;
export const U = 0x02;
export const L = 0x04;
export const D = 0x08;

/** Non-wire tile flags, OR'd into the value handed to the renderer. */
export const FLASHING = 0x10;
export const ACTIVE = 0x20;

/** Barrier corner flags (the wire bits shifted up by four). */
export const RU = 0x10;
export const UL = 0x20;
export const LD = 0x40;
export const DR = 0x80;

/** The four directions in upstream's iteration order (`d = 1; d < 0x10;
 * d <<= 1`). Ports of upstream loops depend on this order. */
export const DIRECTIONS: readonly number[] = [R, U, L, D];

/** Rotate a direction/wire mask one step anticlockwise (upstream `A`). */
export function anticlockwise(x: number): number {
  return ((x & 0x07) << 1) | ((x & 0x08) >> 3);
}

/** Rotate a direction/wire mask one step clockwise (upstream `C`). */
export function clockwise(x: number): number {
  return ((x & 0x0e) >> 1) | ((x & 0x01) << 3);
}

/** Reverse a direction/wire mask (upstream `F`). */
export function opposite(x: number): number {
  return ((x & 0x0c) >> 2) | ((x & 0x03) << 2);
}

/** The x displacement of a single direction bit (upstream `X`). */
export function dirX(dir: number): number {
  return dir === R ? +1 : dir === L ? -1 : 0;
}

/** The y displacement of a single direction bit (upstream `Y`). */
export function dirY(dir: number): number {
  return dir === D ? +1 : dir === U ? -1 : 0;
}

/** Number of wires in a tile mask (upstream `COUNT`). */
export function wireCount(tile: number): number {
  return (
    ((tile & 0x08) >> 3) + ((tile & 0x04) >> 2) + ((tile & 0x02) >> 1) + (tile & 0x01)
  );
}

/** Step one tile in `dir`, wrapping around the torus (upstream's `OFFSET`
 * macro — it wraps unconditionally; a non-wrapping game is fenced in by
 * border barriers instead, not by clamping the arithmetic). */
export function offset(
  x: number,
  y: number,
  dir: number,
  w: number,
  h: number,
): { x: number; y: number } {
  return {
    x: (x + w + dirX(dir)) % w,
    y: (y + h + dirY(dir)) % h,
  };
}

/* ----------------------------------------------------------------------
 * Params.
 */

export interface NetslideParams {
  w: number;
  h: number;
  /** Walls wrap around: the grid is a torus with no border barriers. */
  wrapping: boolean;
  /** Fraction of the candidate wall sites that become barriers, in [0, 1]. */
  barrierProbability: number;
  /** Number of shuffling slides; 0 means the default, `2·(w−1)·(h−1)`. */
  movetarget: number;
}

/**
 * Reproduces C's `%g` — six significant digits, trailing zeros stripped,
 * exponential form outside [1e-4, 1e6).
 *
 * `encodeParams` writes the barrier probability with `%g` and `decodeParams`
 * reads it back, and the *board* depends on the value (`floor(p × candidates)`
 * barriers get placed), so a round-trip that rounded differently would silently
 * generate a different game. `String(x)` is not `%g`: it renders 1/3 as
 * `0.3333333333333333`, which C would then read back as a slightly different
 * number than it wrote.
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

/** C `atof`: parse a leading float, yielding 0 for garbage — never `NaN`,
 * which would slip past every `<`/`>` bound check in `validateParams`. */
export function atof(s: string): number {
  const value = Number.parseFloat(s);
  return Number.isNaN(value) ? 0 : value;
}

export function defaultParams(): NetslideParams {
  return { w: 3, h: 3, wrapping: false, barrierProbability: 1, movetarget: 0 };
}

export function encodeParams(p: NetslideParams, full: boolean): string {
  let s = `${p.w}x${p.h}`;
  if (p.wrapping) s += "w";
  if (full && p.barrierProbability) s += `b${formatG(p.barrierProbability)}`;
  // The shuffle limit is part of the *limited* parameters too: a game id has
  // to carry the target move count, since the status bar reports against it.
  if (p.movetarget) s += `m${p.movetarget}`;
  return s;
}

export function decodeParams(s: string): NetslideParams {
  const p = defaultParams();
  p.wrapping = false;
  p.barrierProbability = 0;
  p.movetarget = 0;

  const width = parseLeadingInt(s, 0);
  p.w = width.value;
  let i = width.next;

  if (s[i] !== "x") {
    // A bare `{n}` is a square grid and — faithful to upstream — carries no
    // wrapping/barrier/movetarget suffixes at all.
    p.h = p.w;
    return p;
  }

  const height = parseLeadingInt(s, i + 1);
  p.h = height.value;
  i = height.next;

  if (s[i] === "w") {
    p.wrapping = true;
    i++;
  }
  if (s[i] === "b") {
    i++;
    const start = i;
    while (i < s.length && (/[0-9]/.test(s[i]) || s[i] === ".")) i++;
    p.barrierProbability = atof(s.slice(start, i));
  }
  if (s[i] === "m") {
    p.movetarget = parseLeadingInt(s, i + 1).value;
  }
  return p;
}

export function validateParams(p: NetslideParams, _full: boolean): string | null {
  if (p.w <= 1 || p.h <= 1) return "Width and height must both be greater than one";
  if (p.w * p.h > 1_000_000) return "Width times height must not be unreasonably large";
  if (p.barrierProbability < 0) return "Barrier probability may not be negative";
  if (p.barrierProbability > 1) return "Barrier probability may not be greater than 1";
  if (p.movetarget < 0) return "Number of shuffling moves may not be negative";
  return null;
}

/* ----------------------------------------------------------------------
 * Moves.
 */

/**
 * A single-step toroidal slide of one row or one column, or the solve move.
 *
 * `dir`'s sign reads backwards and is worth stating: `+1` shifts a line's
 * contents toward *lower* coordinates (a row slides left, a column slides up),
 * which is the direction the border arrow the player clicked points. Upstream's
 * move string permits any distance up to the line's length, but `interpretMove`
 * can only ever emit ±1, so the type is narrowed to what the game can produce.
 */
export type NetslideMove =
  | { type: "slide"; axis: "row" | "col"; index: number; dir: 1 | -1 }
  | { type: "solve"; tiles: readonly number[] };

/* ----------------------------------------------------------------------
 * State.
 */

export interface NetslideState {
  readonly w: number;
  readonly h: number;
  /** The centre tile. Its row and its column cannot be slid — that
   * restriction is what makes Netslide a puzzle rather than a shuffle. */
  readonly cx: number;
  readonly cy: number;
  readonly wrapping: boolean;
  readonly movetarget: number;

  /** Wire masks, row-major. The only part of the state a move changes. */
  readonly tiles: Uint8Array;
  /** Walls + corner flags, row-major. Fixed for the whole game, so every state
   * shares the one array by reference and a move copies only `tiles`. Nothing
   * after `newState` writes to it (`Object.freeze` is not available on a
   * populated typed array, so the `readonly` type is the guarantee). */
  readonly barriers: Uint8Array;

  /** Move count at which the game was completed; 0 while unsolved. */
  readonly completed: number;
  readonly usedSolve: boolean;
  readonly moveCount: number;

  /** The line last slid, for the slide animation: at most one of these is a
   * real index, the other is −1. Both are −1 before the first slide. */
  readonly lastMoveRow: number;
  readonly lastMoveCol: number;
  readonly lastMoveDir: number;
}

export function cloneState(s: NetslideState): NetslideState {
  return { ...s, tiles: new Uint8Array(s.tiles) };
}

/* ----------------------------------------------------------------------
 * Sliding.
 *
 * Upstream slides in place with a rotating walk over the array. Written here
 * as "each cell of the new line reads from the old line, `dir` places along,
 * modulo its length" — provably the same permutation, and immune to the
 * read-back-what-the-shuffle-vacated class of bug that in-place C array
 * surgery invites (playbook §3.1).
 */

export function slideRow(w: number, tiles: Uint8Array, dir: number, row: number): void {
  const old = tiles.slice(row * w, row * w + w);
  for (let x = 0; x < w; x++) {
    tiles[row * w + x] = old[(x + dir + w) % w];
  }
}

export function slideCol(
  w: number,
  h: number,
  tiles: Uint8Array,
  dir: number,
  col: number,
): void {
  const old = new Uint8Array(h);
  for (let y = 0; y < h; y++) old[y] = tiles[y * w + col];
  for (let y = 0; y < h; y++) {
    tiles[y * w + col] = old[(y + dir + h) % h];
  }
}

/* ----------------------------------------------------------------------
 * Desc codec + state construction.
 */

export function validateDesc(p: NetslideParams, desc: string): string | null {
  let i = 0;
  for (let n = 0; n < p.w * p.h; n++) {
    const c = desc[i];
    if (c === undefined) return "Game description shorter than expected";
    if (!/[0-9a-fA-F]/.test(c))
      return "Game description contained unexpected character";
    i++;
    while (desc[i] === "h" || desc[i] === "v") i++;
  }
  if (i < desc.length) return "Game description longer than expected";
  return null;
}

/**
 * Parse a desc into the initial state: the wire grid, the barriers named by
 * the desc's `v`/`h` markers, the border wall a non-wrapping game is fenced in
 * by, and the barrier corner flags.
 */
export function newState(p: NetslideParams, desc: string): NetslideState {
  const { w, h } = p;
  const tiles = new Uint8Array(w * h);
  const barriers = new Uint8Array(w * h);

  let i = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      tiles[y * w + x] = Number.parseInt(desc[i], 16);
      i++;
      while (desc[i] === "h" || desc[i] === "v") {
        const d1 = desc[i] === "v" ? R : D;
        const n = offset(x, y, d1, w, h);
        barriers[y * w + x] |= d1;
        barriers[n.y * w + n.x] |= opposite(d1);
        i++;
      }
    }
  }

  if (!p.wrapping) {
    for (let x = 0; x < w; x++) {
      barriers[x] |= U;
      barriers[(h - 1) * w + x] |= D;
    }
    for (let y = 0; y < h; y++) {
      barriers[y * w] |= L;
      barriers[y * w + (w - 1)] |= R;
    }
  }

  addBarrierCorners(barriers, w, h);

  return {
    w,
    h,
    cx: Math.floor(w / 2),
    cy: Math.floor(h / 2),
    wrapping: p.wrapping,
    movetarget: p.movetarget,
    tiles,
    barriers,
    completed: 0,
    usedSolve: false,
    moveCount: 0,
    lastMoveRow: -1,
    lastMoveCol: -1,
    lastMoveDir: 0,
  };
}

/**
 * Flag the barriers that meet, so a barrier junction draws as a solid corner
 * rather than as two walls with a notch between them. A wall on side `dir` of
 * a tile turns the `dir`/`anticlockwise(dir)` junction into a corner if this
 * tile, or either of the two tiles sharing that junction, carries the wall
 * that completes it — and when it does, all four tiles around the junction are
 * flagged so each one draws its quarter.
 */
function addBarrierCorners(barriers: Uint8Array, w: number, h: number): void {
  const inGrid = (x: number, y: number) => x >= 0 && x < w && y >= 0 && y < h;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (const dir of DIRECTIONS) {
        if (!(barriers[y * w + x] & dir)) continue;
        const dir2 = anticlockwise(dir);

        const x1 = x + dirX(dir);
        const y1 = y + dirY(dir);
        const x2 = x + dirX(dir2);
        const y2 = y + dirY(dir2);

        const corner =
          (barriers[y * w + x] & dir2) !== 0 ||
          (inGrid(x1, y1) && (barriers[y1 * w + x1] & dir2) !== 0) ||
          (inGrid(x2, y2) && (barriers[y2 * w + x2] & dir) !== 0);
        if (!corner) continue;

        barriers[y * w + x] |= dir << 4;
        if (inGrid(x1, y1)) barriers[y1 * w + x1] |= anticlockwise(dir) << 4;
        if (inGrid(x2, y2)) barriers[y2 * w + x2] |= clockwise(dir) << 4;

        const x3 = x1 + dirX(dir2);
        const y3 = y1 + dirY(dir2);
        if (inGrid(x3, y3)) barriers[y3 * w + x3] |= opposite(dir) << 4;
      }
    }
  }
}

/* ----------------------------------------------------------------------
 * Powering.
 */

/**
 * Flood outward from the centre tile: a tile is *active* (powered) when it is
 * reachable from the centre through wires that connect in both directions and
 * are not separated by a barrier. This is both the "how close am I?" visual aid
 * and the win condition — the game is complete when every tile is active.
 *
 * `movingRow` / `movingCol` blank out a line that is mid-slide, so the powered
 * highlight does not appear to leap across a line that is currently in motion.
 * (Upstream tests only the *destination* tile against them, not the source;
 * kept verbatim.)
 *
 * Upstream drains its worklist in sorted order via a `tree234`. That is
 * incidental — a flood fill's reachable set does not depend on visit order, and
 * this never feeds the desc — so a plain stack is used.
 */
export function computeActive(
  s: NetslideState,
  movingRow: number,
  movingCol: number,
): Uint8Array {
  const { w, h, tiles, barriers } = s;
  const active = new Uint8Array(w * h);

  active[s.cy * w + s.cx] = ACTIVE;
  const todo: number[] = [s.cy * w + s.cx];

  while (todo.length > 0) {
    const cur = todo.pop() as number;
    const x1 = cur % w;
    const y1 = (cur - x1) / w;

    for (const d1 of DIRECTIONS) {
      const { x: x2, y: y2 } = offset(x1, y1, d1, w, h);
      if (x2 === movingCol || y2 === movingRow) continue;
      if (!(tiles[y1 * w + x1] & d1)) continue;
      if (!(tiles[y2 * w + x2] & opposite(d1))) continue;
      if (barriers[y1 * w + x1] & d1) continue;
      if (active[y2 * w + x2]) continue;

      active[y2 * w + x2] = ACTIVE;
      todo.push(y2 * w + x2);
    }
  }

  return active;
}

/** Is every tile powered from the centre? */
export function isComplete(s: NetslideState): boolean {
  return computeActive(s, -1, -1).every((a) => a !== 0);
}

/* ----------------------------------------------------------------------
 * The border-arrow ring cursor.
 *
 * Upstream's `c2pos` / `c2diff` / `pos2c` live in misc.c, but netslide is their
 * only consumer in the whole collection, so they live here rather than in
 * `engine/` (promote them if Net, which has a similar border cursor, is ported
 * and wants them).
 *
 * The arrow positions form a ring around the grid, addressed by a single cyclic
 * coordinate of length 2(w + h): the top row left-to-right, then the right
 * column downwards, then the bottom row right-to-left, then the left column
 * upwards.
 */

/** Ring position of a border-arrow cell. */
export function c2pos(w: number, h: number, cx: number, cy: number): number {
  if (cy === -1) return cx; // top row, left to right
  if (cx === w) return w + cy; // right column, downwards
  if (cy === h) return w + h + (w - cx - 1); // bottom row, right to left
  if (cx === -1) return w + h + w + (h - cy - 1); // left column, upwards
  throw new Error(`(${cx}, ${cy}) is not a border-arrow position`);
}

/** Border-arrow cell at a ring position (wrapping, so a walk never falls off
 * the end). */
export function pos2c(w: number, h: number, pos: number): { cx: number; cy: number } {
  const max = 2 * (w + h);
  let p = ((pos % max) + max) % max;

  if (p < w) return { cx: p, cy: -1 };
  p -= w;
  if (p < h) return { cx: w, cy: p };
  p -= h;
  if (p < w) return { cx: w - p - 1, cy: h };
  p -= w;
  return { cx: -1, cy: h - p - 1 };
}

/**
 * Which way along the ring an arrow key moves from a border-arrow cell: the
 * obvious direction along the edge you are on, plus the corner turns — at the
 * end of an edge, the key that would walk off the grid instead rounds the
 * corner onto the adjacent edge.
 */
export function c2diff(
  w: number,
  h: number,
  cx: number,
  cy: number,
  button: number,
): number {
  let diff = 0;

  if (cy === -1)
    diff = button === CURSOR_RIGHT ? +1 : button === CURSOR_LEFT ? -1 : diff;
  if (cy === h)
    diff = button === CURSOR_RIGHT ? -1 : button === CURSOR_LEFT ? +1 : diff;
  if (cx === -1) diff = button === CURSOR_UP ? +1 : button === CURSOR_DOWN ? -1 : diff;
  if (cx === w) diff = button === CURSOR_UP ? -1 : button === CURSOR_DOWN ? +1 : diff;

  if (button === CURSOR_LEFT && cx === w && (cy === 0 || cy === h - 1))
    diff = cy === 0 ? -1 : +1;
  if (button === CURSOR_RIGHT && cx === -1 && (cy === 0 || cy === h - 1))
    diff = cy === 0 ? +1 : -1;
  if (button === CURSOR_DOWN && cy === -1 && (cx === 0 || cx === w - 1))
    diff = cx === 0 ? -1 : +1;
  if (button === CURSOR_UP && cy === h && (cx === 0 || cx === w - 1))
    diff = cx === 0 ? +1 : -1;

  return diff;
}

/* ----------------------------------------------------------------------
 * UI.
 */

export interface NetslideUi {
  /** The border-arrow cell the keyboard cursor is on — always a ring
   * position, never a grid cell. */
  curX: number;
  curY: number;
  curVisible: boolean;
}

export function newUi(_s: NetslideState): NetslideUi {
  return { curX: 0, curY: -1, curVisible: false };
}
