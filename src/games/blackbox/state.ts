/**
 * Black Box — state, params, the obfuscated desc codec, the laser
 * ray-tracer, and `checkGuesses` (the reveal/verify logic).
 *
 * The grid representation is upstream's (one `Int32Array` overlaying ball
 * flags on arena cells and laser display-values on the surrounding
 * firing-range ring, plus an `exits` array mapping each entry index to its
 * exit), because the laser physics — entry-cell instant-hit/reflect
 * priority, the clockwise/anticlockwise turn rules, the matched-pair
 * numbering — is subtle and there is no corpus to catch a re-derivation
 * slip.
 */

import { parseLeadingInt } from "../../engine/decimal.ts";
import { bin2hex, hex2bin, obfuscateBitmap } from "../../engine/obfuscate.ts";
import type { GridCursor } from "../../engine/pointer.ts";
import { type RandomState, randomNew, randomUpto } from "../../engine/random/index.ts";
import type { GameStatus, Point } from "../../engine/types.ts";

// --- flag constants (upstream BALL_* / LASER_*) -----------------------

export const BALL_CORRECT = 0x01;
export const BALL_GUESS = 0x02;
export const BALL_LOCK = 0x04;

/** A laser the player never fired that would have shown the guess wrong;
 * the verify fires it for them. */
export const LASER_OMITTED = 0x0800;
export const LASER_REFLECT = 0x1000;
export const LASER_HIT = 0x2000;
/** A fired laser whose recorded result contradicts the player's guess. */
export const LASER_WRONG = 0x4000;
export const LASER_FLASHED = 0x8000;
/** Masks off every flag bit, the cursor's included, leaving a laser's
 * pair number or exit index. */
export const LASER_FLAGMASK = 0x1f800;
/** `~0` in upstream's `unsigned` exits array; every use is an equality
 * sentinel, so `-1` in a signed `Int32Array` is exactly equivalent. */
export const LASER_EMPTY = -1;

/** Disjoint from both flag sets; an overlay drawn for the cursor tile. */
export const FLAG_CURSOR = 0x10000;

// --- directions (indices into `OFFSETS`) ------------------------------

const DIR_UP = 0;
const DIR_RIGHT = 1;
const DIR_DOWN = 2;
const DIR_LEFT = 3;

const OFFSETS: ReadonlyArray<Point> = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

const LOOK_LEFT = 0;
const LOOK_FORWARD = 1;
const LOOK_RIGHT = 2;

// --- types ------------------------------------------------------------

export interface BlackboxParams {
  w: number;
  h: number;
  minballs: number;
  maxballs: number;
}

export interface BlackboxState {
  w: number;
  h: number;
  minballs: number;
  maxballs: number;
  nballs: number;
  nlasers: number;
  /** `(w+2)*(h+2)`: ball flags on arena cells (offset `(1,1)`), laser
   * display-values on the firing-range ring; corners unused. */
  grid: Int32Array;
  /** One per laser entry: its exit index, or `LASER_HIT`/`LASER_REFLECT`,
   * or `LASER_EMPTY`, with `LASER_WRONG`/`LASER_OMITTED` overlay flags. */
  exits: Int32Array;
  laserno: number;
  nguesses: number;
  nright: number;
  nwrong: number;
  nmissed: number;
  reveal: boolean;
  justwrong: boolean;
}

export type BlackboxMove =
  | { type: "toggleBall"; x: number; y: number }
  | { type: "toggleLock"; x: number; y: number }
  | { type: "toggleColumnLock"; x: number }
  | { type: "toggleRowLock"; y: number }
  | { type: "fire"; rangeno: number }
  | { type: "reveal" }
  | { type: "solve" };

export interface BlackboxUi {
  flashLaserno: number;
  errors: number;
  newmove: boolean;
  cursor: GridCursor;
  /** 0 = never, 1 = always (until release), 2 = only while animating. */
  flashLaser: number;
}

// --- grid helpers -----------------------------------------------------

export function gridIdx(w: number, x: number, y: number): number {
  return y * (w + 2) + x;
}

export function gridGet(st: BlackboxState, x: number, y: number): number {
  return st.grid[gridIdx(st.w, x, y)];
}

function gridSet(st: BlackboxState, x: number, y: number, v: number): void {
  st.grid[gridIdx(st.w, x, y)] = v;
}

/** Whether a laser result is an exit index rather than a hit or reflect. */
function isExitIndex(st: BlackboxState, result: number): boolean {
  return result >= 0 && result < st.nlasers;
}

export function cloneState(s: BlackboxState): BlackboxState {
  return { ...s, grid: s.grid.slice(), exits: s.exits.slice() };
}

// --- params -----------------------------------------------------------

export function defaultParams(): BlackboxParams {
  return { w: 8, h: 8, minballs: 5, maxballs: 5 };
}

const PRESETS: ReadonlyArray<BlackboxParams> = [
  { w: 5, h: 5, minballs: 3, maxballs: 3 },
  { w: 8, h: 8, minballs: 5, maxballs: 5 },
  { w: 8, h: 8, minballs: 3, maxballs: 6 },
  { w: 10, h: 10, minballs: 5, maxballs: 5 },
  { w: 10, h: 10, minballs: 4, maxballs: 10 },
];

/** The ball count as the params show it: `N`, or `N-M` for a range. */
export function ballsText(p: BlackboxParams): string {
  return p.minballs === p.maxballs ? String(p.minballs) : `${p.minballs}-${p.maxballs}`;
}

export function presets() {
  return {
    title: "Black Box",
    submenu: PRESETS.map((p) => ({
      title: `${p.w}x${p.h}, ${ballsText(p)} balls`,
      params: { ...p },
    })),
  };
}

export function encodeParams(p: BlackboxParams, _full: boolean): string {
  return `w${p.w}h${p.h}m${p.minballs}M${p.maxballs}`;
}

const PARAM_LETTERS: Record<string, keyof BlackboxParams> = {
  w: "w",
  h: "h",
  m: "minballs",
  M: "maxballs",
};

export function decodeParams(s: string): BlackboxParams {
  const p = defaultParams();
  let i = 0;
  while (i < s.length) {
    const field = PARAM_LETTERS[s[i++]];
    if (!field) continue;
    const r = parseLeadingInt(s, i);
    p[field] = r.value;
    i = r.next;
  }
  return p;
}

export function validateParams(p: BlackboxParams, _full: boolean): string | null {
  if (p.w < 2 || p.h < 2) return "Width and height must both be at least two";
  if (p.w > 255 || p.h > 255)
    return "Widths and heights greater than 255 are not supported";
  if (p.minballs < 0) return "Negative number of balls";
  if (p.minballs < 1) return "Number of balls must be at least one";
  if (p.minballs > p.maxballs)
    return "Minimum number of balls may not be greater than maximum";
  if (p.minballs >= p.w * p.h) return "Too many balls to fit in grid";
  return null;
}

// --- desc codec -------------------------------------------------------

/** Scatter `nballs` balls at distinct arena cells, encode `[w, h,
 * x0, y0, …]` as a byte-per-value bitmap, obfuscate, and hex-encode. */
export function newDesc(p: BlackboxParams, rng: RandomState): { desc: string } {
  let nballs = p.minballs;
  if (p.maxballs > p.minballs) nballs += randomUpto(rng, p.maxballs - p.minballs + 1);

  const taken = new Uint8Array(p.w * p.h);
  const bmp = new Uint8Array(nballs * 2 + 2);
  bmp[0] = p.w;
  bmp[1] = p.h;

  for (let i = 2; i < bmp.length; i += 2) {
    let x: number;
    let y: number;
    do {
      x = randomUpto(rng, p.w);
      y = randomUpto(rng, p.h);
    } while (taken[y * p.w + x]);
    taken[y * p.w + x] = 1;
    bmp[i] = x;
    bmp[i + 1] = y;
  }

  obfuscateBitmap(bmp, bmp.length * 8, false);
  return { desc: bin2hex(bmp) };
}

/** A desc's de-obfuscated `[w, h, x0, y0, …]` bytes. */
function descBytes(desc: string): Uint8Array {
  const bmp = hex2bin(desc, desc.length / 2);
  obfuscateBitmap(bmp, bmp.length * 8, true);
  return bmp;
}

export function validateDesc(p: BlackboxParams, desc: string): string | null {
  const dlen = desc.length;
  const nballs = (dlen / 2 - 2) / 2;
  if (dlen < 4 || dlen % 4 || nballs < p.minballs || nballs > p.maxballs)
    return "Game description is wrong length";

  const bmp = descBytes(desc);
  if (bmp[0] !== p.w || bmp[1] !== p.h) return "Game description is corrupted";
  for (let i = 2; i < bmp.length; i += 2) {
    if (bmp[i] >= p.w || bmp[i + 1] >= p.h) return "Game description is corrupted";
  }
  return null;
}

export function newState(p: BlackboxParams, desc: string): BlackboxState {
  const bmp = descBytes(desc);
  const w = bmp[0];
  const h = bmp[1];
  const nlasers = 2 * (w + h);
  const grid = new Int32Array((w + 2) * (h + 2));
  for (let i = 2; i < bmp.length; i += 2) {
    grid[gridIdx(w, bmp[i] + 1, bmp[i + 1] + 1)] = BALL_CORRECT;
  }

  return {
    w,
    h,
    minballs: p.minballs,
    maxballs: p.maxballs,
    nballs: bmp.length / 2 - 1,
    nlasers,
    grid,
    exits: new Int32Array(nlasers).fill(LASER_EMPTY),
    laserno: 1,
    nguesses: 0,
    nright: 0,
    nwrong: 0,
    nmissed: 0,
    reveal: false,
    justwrong: false,
  };
}

// --- range <-> grid mapping -------------------------------------------

interface RangeCell extends Point {
  direction: number;
}

/** Map a firing-range index (0..2(w+h)−1, clockwise from the top-left)
 * to its grid cell + the direction a laser fired there travels. */
export function range2grid(w: number, h: number, rangeno: number): RangeCell | null {
  if (rangeno < 0) return null;
  if (rangeno < w) return { x: rangeno + 1, y: 0, direction: DIR_DOWN };
  rangeno -= w;
  if (rangeno < h) return { x: w + 1, y: rangeno + 1, direction: DIR_LEFT };
  rangeno -= h;
  if (rangeno < w) return { x: w - rangeno, y: h + 1, direction: DIR_UP };
  rangeno -= w;
  if (rangeno < h) return { x: 0, y: h - rangeno, direction: DIR_RIGHT };
  return null;
}

/** Inverse of {@link range2grid}: a range cell's grid coords → its index,
 * or `null` if the cell is in the arena, outside the grid, or a corner. */
export function grid2range(w: number, h: number, x: number, y: number): number | null {
  const x1 = w + 1;
  const y1 = h + 1;
  if (x > 0 && x < x1 && y > 0 && y < y1) return null; // in arena
  if (x < 0 || x > x1 || y < 0 || y > y1) return null; // outside grid
  if ((x === 0 || x === x1) && (y === 0 || y === y1)) return null; // corner

  if (y === 0) return x - 1; // top
  if (x === x1) return y - 1 + w; // RHS
  if (y === y1) return w - x + w + h; // bottom (counts backwards)
  return h - y + w + w + h; // LHS (counts backwards)
}

// --- laser ray-tracer -------------------------------------------------

function offset(x: number, y: number, dir: number): Point {
  const d = OFFSETS[(dir + 4) % 4];
  return { x: x + d.x, y: y + d.y };
}

/** Is there a ball forward (and, for LEFT/RIGHT, diagonally) of `(gx,gy)`
 * facing `direction`? Off the arena (into the range) there is never one. */
function isball(
  st: BlackboxState,
  gx: number,
  gy: number,
  direction: number,
  lookwhere: number,
): boolean {
  let p = offset(gx, gy, direction);
  if (lookwhere === LOOK_LEFT) p = offset(p.x, p.y, direction - 1);
  else if (lookwhere === LOOK_RIGHT) p = offset(p.x, p.y, direction + 1);

  if (p.x < 1 || p.y < 1 || p.x > st.w || p.y > st.h) return false;
  return (gridGet(st, p.x, p.y) & BALL_CORRECT) !== 0;
}

/** Trace a laser fired from range cell `entryno` without recording it;
 * returns `LASER_HIT`, `LASER_REFLECT`, or the exit range index. */
function laserExit(st: BlackboxState, entryno: number): number {
  const { x: x0, y: y0, direction } = range2grid(st.w, st.h, entryno) as RangeCell;

  // Entry-cell special cases: hit prioritized over reflection.
  if (isball(st, x0, y0, direction, LOOK_FORWARD)) return LASER_HIT;
  if (
    isball(st, x0, y0, direction, LOOK_LEFT) ||
    isball(st, x0, y0, direction, LOOK_RIGHT)
  )
    return LASER_REFLECT;

  let { x, y } = offset(x0, y0, direction);
  let dir = direction;
  for (;;) {
    const exitno = grid2range(st.w, st.h, x, y);
    if (exitno !== null) return exitno === entryno ? LASER_REFLECT : exitno;

    if (isball(st, x, y, dir, LOOK_FORWARD)) return LASER_HIT;
    if (isball(st, x, y, dir, LOOK_LEFT)) {
      dir = (dir + 1) % 4; // ball to our left: turn clockwise
      continue;
    }
    if (isball(st, x, y, dir, LOOK_RIGHT)) {
      dir = (dir + 3) % 4; // ball to our right: turn anti-clockwise
      continue;
    }
    ({ x, y } = offset(x, y, dir));
  }
}

/** Show a laser's result on the range: `H`/`R` on its entry cell, or the
 * next pair number on both its entry and exit cells. */
function paintLaser(st: BlackboxState, entryno: number, exitno: number): void {
  const entry = range2grid(st.w, st.h, entryno) as RangeCell;
  if (exitno === LASER_HIT || exitno === LASER_REFLECT) {
    gridSet(st, entry.x, entry.y, exitno);
  } else {
    const newno = st.laserno++;
    const end = range2grid(st.w, st.h, exitno) as RangeCell;
    gridSet(st, entry.x, entry.y, newno);
    gridSet(st, end.x, end.y, newno);
  }
}

/** Fire a laser and record its result in `grid` + `exits` (mutates). */
export function fireLaser(st: BlackboxState, entryno: number): void {
  const exitno = laserExit(st, entryno);
  paintLaser(st, entryno, exitno);
  st.exits[entryno] = exitno;
  if (isExitIndex(st, exitno)) st.exits[exitno] = entryno;
}

// --- guess verification (upstream check_guesses) ----------------------

/** A `random_state` seeded from the grid bytes, so re-marking the same
 * wrong guess highlights the same laser deterministically. */
function gridSeededRandom(st: BlackboxState): RandomState {
  const bytes = new Uint8Array(st.grid.buffer, st.grid.byteOffset, st.grid.byteLength);
  return randomNew(bytes);
}

/** Recompute nright/nwrong/nmissed from the arena's guess/correct flags. */
function fillCounts(st: BlackboxState): void {
  st.nright = 0;
  st.nwrong = 0;
  st.nmissed = 0;
  for (let x = 1; x <= st.w; x++) {
    for (let y = 1; y <= st.h; y++) {
      const bs = gridGet(st, x, y) & (BALL_GUESS | BALL_CORRECT);
      if (bs === (BALL_GUESS | BALL_CORRECT)) st.nright++;
      else if (bs === BALL_GUESS) st.nwrong++;
      else if (bs === BALL_CORRECT) st.nmissed++;
    }
  }
}

/** Make the guessed balls the real ones: `BALL_CORRECT` set exactly where
 * `BALL_GUESS` is. */
function guessesAsCorrect(st: BlackboxState): void {
  for (let x = 1; x <= st.w; x++) {
    for (let y = 1; y <= st.h; y++) {
      let v = gridGet(st, x, y) & ~BALL_CORRECT;
      if (v & BALL_GUESS) v |= BALL_CORRECT;
      gridSet(st, x, y, v);
    }
  }
}

/** Flag laser `i`, and its exit if it has one, as the verify's evidence. */
function markEvidence(st: BlackboxState, i: number, flag: number): void {
  st.exits[i] |= flag;
  const exit = laserExit(st, i);
  if (isExitIndex(st, exit)) st.exits[exit] |= flag;
  st.justwrong = true;
}

/**
 * Verify the player's guessed balls against the real layout by firing
 * every laser on both and comparing. Mutates `state` (run on the already
 * cloned `executeMove` result).
 *
 * `cagey` (the player's explicit verify) first shows at most one piece
 * of evidence the guess is wrong — a fired laser that contradicts it, or
 * an unfired laser that would have — and reveals nothing else; only when
 * the guess survives both checks does it run the full reveal.
 */
export function checkGuesses(state: BlackboxState, cagey: boolean): void {
  if (cagey) {
    const guesses = cloneState(state);
    guessesAsCorrect(guesses);
    const contradicted: number[] = [];
    const telling: number[] = []; // unfired, and would tell the layouts apart
    for (let i = 0; i < state.nlasers; i++) {
      if (guesses.exits[i] !== LASER_EMPTY) {
        if (guesses.exits[i] !== laserExit(guesses, i)) contradicted.push(i);
      } else if (laserExit(state, i) !== laserExit(guesses, i)) {
        telling.push(i);
      }
    }
    const pick = (lasers: number[]) =>
      lasers[randomUpto(gridSeededRandom(guesses), lasers.length)];

    if (contradicted.length) {
      markEvidence(state, pick(contradicted), LASER_WRONG);
      return;
    }
    if (telling.length) {
      const i = pick(telling);
      fireLaser(state, i);
      markEvidence(state, i, LASER_OMITTED);
      return;
    }
  }

  // Full reveal: a real-layout copy and a guess-layout copy, both with
  // their lasers cleared then fully fired, compared laser by laser.
  const solution = cloneState(state);
  solution.exits.fill(LASER_EMPTY);
  const guesses = cloneState(solution);
  guessesAsCorrect(guesses);
  for (let i = 0; i < state.nlasers; i++) {
    if (solution.exits[i] === LASER_EMPTY) fireLaser(solution, i);
    if (guesses.exits[i] === LASER_EMPTY) fireLaser(guesses, i);
  }

  let equivalent = true;
  for (let i = 0; i < state.nlasers; i++) {
    if (solution.exits[i] === guesses.exits[i]) continue;
    equivalent = false;
    if (state.exits[i] === LASER_EMPTY) {
      // The player never fired this distinguishing laser: add it.
      paintLaser(state, i, solution.exits[i]);
      state.exits[i] = solution.exits[i] | LASER_OMITTED;
    } else {
      state.exits[i] |= LASER_WRONG;
    }
  }

  // Proven equivalent: make the real balls match the guesses.
  if (
    equivalent &&
    state.nguesses >= state.minballs &&
    state.nguesses <= state.maxballs
  )
    guessesAsCorrect(state);
  fillCounts(state);
  state.reveal = true;
}

// --- predicates -------------------------------------------------------

/** Upstream `CAN_REVEAL`: the verify button is live only with an
 * in-range guess count and no reveal/justwrong already showing. */
export function canReveal(s: BlackboxState): boolean {
  return (
    s.nguesses >= s.minballs && s.nguesses <= s.maxballs && !s.reveal && !s.justwrong
  );
}

// --- status -----------------------------------------------------------

export function status(s: BlackboxState): GameStatus {
  if (s.reveal) {
    if (s.nwrong === 0 && s.nmissed === 0 && s.nright >= s.minballs) return "solved";
    return "lost";
  }
  return "ongoing";
}
