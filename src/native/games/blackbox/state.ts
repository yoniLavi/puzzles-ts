/**
 * Black Box — state, params, the obfuscated desc codec, the laser
 * ray-tracer, and `checkGuesses` (the reveal/verify logic).
 *
 * Idiomatic rendering of `puzzles/blackbox.c`. The grid representation
 * is kept verbatim (one `Int32Array` overlaying ball flags on arena
 * cells and laser display-values on the surrounding firing-range ring,
 * plus an `exits` array mapping each entry index to its exit) because
 * the laser physics — entry-cell instant-hit/reflect priority, the
 * clockwise/anticlockwise turn rules, the matched-pair numbering — is
 * subtle and there is no corpus to catch a re-derivation slip. State is
 * immutable: `executeMove` clones then mutates the clone (GC, not
 * `dup_game`/`free_game`).
 */

import type { GameStatus } from "../../../puzzle/types.ts";
import { bin2hex, hex2bin, obfuscateBitmap } from "../../engine/obfuscate.ts";
import { parseLeadingInt } from "../../engine/params.ts";
import { type RandomState, randomNew, randomUpto } from "../../random/index.ts";

// --- flag constants (upstream BALL_* / LASER_*) -----------------------

export const BALL_CORRECT = 0x01;
export const BALL_GUESS = 0x02;
export const BALL_LOCK = 0x04;

/** A laser that, when verified, would have demonstrated the guess wrong
 * but was never fired by the player (revealed by the cagey check). */
export const LASER_OMITTED = 0x0800;
export const LASER_REFLECT = 0x1000;
export const LASER_HIT = 0x2000;
/** A fired laser whose recorded result contradicts the player's guess. */
export const LASER_WRONG = 0x4000;
export const LASER_FLASHED = 0x8000;
/** Masks off the cursor + all laser flag bits, leaving the display value
 * (a laser number, or a hit/reflect sentinel) — upstream `LASER_FLAGMASK`. */
export const LASER_FLAGMASK = 0x1f800;
/** `~0` in upstream's `unsigned` exits array; every use is an equality
 * sentinel, so `-1` in a signed `Int32Array` is exactly equivalent. */
export const LASER_EMPTY = -1;

/** Disjoint from both flag sets; an overlay drawn for the cursor tile. */
export const FLAG_CURSOR = 0x10000;

// --- directions (indices must match `OFFSETS`) ------------------------

const DIR_UP = 0;
const DIR_RIGHT = 1;
const DIR_DOWN = 2;
const DIR_LEFT = 3;

const OFFSETS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 0, y: -1 }, // up
  { x: 1, y: 0 }, // right
  { x: 0, y: 1 }, // down
  { x: -1, y: 0 }, // left
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
  curX: number;
  curY: number;
  curVisible: boolean;
  /** 0 = never, 1 = always (until release), 2 = only while animating. */
  flashLaser: number;
}

// --- grid helpers -----------------------------------------------------

function gridIdx(w: number, x: number, y: number): number {
  return y * (w + 2) + x;
}

function gridGet(st: BlackboxState, x: number, y: number): number {
  return st.grid[gridIdx(st.w, x, y)];
}

function gridSet(st: BlackboxState, x: number, y: number, v: number): void {
  st.grid[gridIdx(st.w, x, y)] = v;
}

function rangecheck(st: BlackboxState, x: number): boolean {
  return x >= 0 && x < st.nlasers;
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

function presetName(p: BlackboxParams): string {
  return p.minballs === p.maxballs
    ? `${p.w}x${p.h}, ${p.minballs} balls`
    : `${p.w}x${p.h}, ${p.minballs}-${p.maxballs} balls`;
}

export function presets() {
  return {
    title: "Black Box",
    submenu: PRESETS.map((p) => ({ title: presetName(p), params: { ...p } })),
  };
}

export function encodeParams(p: BlackboxParams, _full: boolean): string {
  return `w${p.w}h${p.h}m${p.minballs}M${p.maxballs}`;
}

export function decodeParams(s: string): BlackboxParams {
  const p = defaultParams();
  let i = 0;
  while (i < s.length) {
    const c = s[i++];
    if (c === "w") {
      const r = parseLeadingInt(s, i);
      p.w = r.value;
      i = r.next;
    } else if (c === "h") {
      const r = parseLeadingInt(s, i);
      p.h = r.value;
      i = r.next;
    } else if (c === "m") {
      const r = parseLeadingInt(s, i);
      p.minballs = r.value;
      i = r.next;
    } else if (c === "M") {
      const r = parseLeadingInt(s, i);
      p.maxballs = r.value;
      i = r.next;
    }
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
  if (p.maxballs > p.minballs)
    nballs += randomUpto(rng, p.maxballs - p.minballs + 1);

  const grid = new Uint8Array(p.w * p.h);
  const bmp = new Uint8Array(nballs * 2 + 2);
  bmp[0] = p.w;
  bmp[1] = p.h;

  for (let i = 0; i < nballs; i++) {
    let x: number;
    let y: number;
    do {
      x = randomUpto(rng, p.w);
      y = randomUpto(rng, p.h);
    } while (grid[y * p.w + x]);
    grid[y * p.w + x] = 1;
    bmp[(i + 1) * 2] = x;
    bmp[(i + 1) * 2 + 1] = y;
  }

  obfuscateBitmap(bmp, (nballs * 2 + 2) * 8, false);
  return { desc: bin2hex(bmp) };
}

export function validateDesc(p: BlackboxParams, desc: string): string | null {
  const dlen = desc.length;
  const nballs = (dlen / 2 - 2) / 2;
  if (dlen < 4 || dlen % 4 || nballs < p.minballs || nballs > p.maxballs)
    return "Game description is wrong length";

  const bmp = hex2bin(desc, nballs * 2 + 2);
  obfuscateBitmap(bmp, (nballs * 2 + 2) * 8, true);
  if (bmp[0] !== p.w || bmp[1] !== p.h) return "Game description is corrupted";
  for (let i = 0; i < nballs; i++) {
    const x = bmp[(i + 1) * 2];
    const y = bmp[(i + 1) * 2 + 1];
    if (x < 0 || y < 0 || x >= p.w || y >= p.h)
      return "Game description is corrupted";
  }
  return null;
}

export function newState(p: BlackboxParams, desc: string): BlackboxState {
  const dlen = desc.length;
  const nballs = (dlen / 2 - 2) / 2;
  const bmp = hex2bin(desc, nballs * 2 + 2);
  obfuscateBitmap(bmp, (nballs * 2 + 2) * 8, true);

  const w = bmp[0];
  const h = bmp[1];
  const nlasers = 2 * (w + h);
  const grid = new Int32Array((w + 2) * (h + 2));
  const exits = new Int32Array(nlasers).fill(LASER_EMPTY);

  for (let i = 0; i < nballs; i++) {
    const bx = bmp[(i + 1) * 2] + 1;
    const by = bmp[(i + 1) * 2 + 1] + 1;
    grid[by * (w + 2) + bx] = BALL_CORRECT;
  }

  return {
    w,
    h,
    minballs: p.minballs,
    maxballs: p.maxballs,
    nballs,
    nlasers,
    grid,
    exits,
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

interface RangeCell {
  x: number;
  y: number;
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

function offset(x: number, y: number, o: number): { x: number; y: number } {
  const off = (4 + (o % 4)) % 4;
  return { x: x + OFFSETS[off].x, y: y + OFFSETS[off].y };
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

/** Trace a beam entering at range cell `(x0,y0)` facing `direction`;
 * returns `LASER_HIT`, `LASER_REFLECT`, or the exit range index. */
function fireLaserInternal(
  st: BlackboxState,
  x0: number,
  y0: number,
  direction: number,
): number {
  const lno = grid2range(st.w, st.h, x0, y0) as number;

  // Entry-cell special cases: hit prioritised over reflection.
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
    if (exitno !== null) return lno === exitno ? LASER_REFLECT : exitno;

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

/** Read-only: the result code a laser fired at `entryno` would produce. */
function laserExit(st: BlackboxState, entryno: number): number {
  const rc = range2grid(st.w, st.h, entryno) as RangeCell;
  return fireLaserInternal(st, rc.x, rc.y, rc.direction);
}

/** Fire a laser and record its result in `grid` + `exits` (mutates). */
function fireLaser(st: BlackboxState, entryno: number): void {
  const rc = range2grid(st.w, st.h, entryno) as RangeCell;
  const exitno = fireLaserInternal(st, rc.x, rc.y, rc.direction);

  if (exitno === LASER_HIT || exitno === LASER_REFLECT) {
    gridSet(st, rc.x, rc.y, exitno);
    st.exits[entryno] = exitno;
  } else {
    const newno = st.laserno++;
    const end = range2grid(st.w, st.h, exitno) as RangeCell;
    gridSet(st, rc.x, rc.y, newno);
    gridSet(st, end.x, end.y, newno);
    st.exits[entryno] = exitno;
    st.exits[exitno] = entryno;
  }
}

/** Fire `entryno` on `st` if not already fired (used by `executeMove`). */
export function fireLaserMove(st: BlackboxState, entryno: number): void {
  fireLaser(st, entryno);
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

/** Turn a copy's guessed balls into its "correct" balls (clear real,
 * promote `BALL_GUESS` → `BALL_CORRECT`). */
function guessesAsCorrect(st: BlackboxState): void {
  for (let x = 1; x <= st.w; x++) {
    for (let y = 1; y <= st.h; y++) {
      let v = gridGet(st, x, y) & ~BALL_CORRECT;
      if (v & BALL_GUESS) v |= BALL_CORRECT;
      gridSet(st, x, y, v);
    }
  }
}

/**
 * Verify the player's guessed balls against the real layout by firing
 * every laser on both and comparing. Mutates `state` (run on the already
 * cloned `executeMove` result). Returns 1 if the layouts are equivalent
 * (a correct solve), else 0.
 *
 * `cagey` (the player's explicit verify) first shows at most one piece
 * of evidence the guess is wrong — a fired laser that contradicts it, or
 * an unfired laser that would have — and reveals nothing else; only when
 * the guess survives both checks does it run the full reveal.
 */
export function checkGuesses(state: BlackboxState, cagey: boolean): number {
  if (cagey) {
    const guesses = cloneState(state);
    guessesAsCorrect(guesses);

    // (1) A fired laser whose recorded result contradicts the guess.
    let n = 0;
    for (let i = 0; i < guesses.nlasers; i++) {
      if (guesses.exits[i] !== LASER_EMPTY && guesses.exits[i] !== laserExit(guesses, i))
        n++;
    }
    if (n) {
      n = randomUpto(gridSeededRandom(guesses), n);
      for (let i = 0; i < guesses.nlasers; i++) {
        if (
          guesses.exits[i] !== LASER_EMPTY &&
          guesses.exits[i] !== laserExit(guesses, i) &&
          n-- === 0
        ) {
          state.exits[i] |= LASER_WRONG;
          const tmp = laserExit(state, i);
          if (rangecheck(state, tmp)) state.exits[tmp] |= LASER_WRONG;
          state.justwrong = true;
          return 0;
        }
      }
    }

    // (2) An unfired laser that would have distinguished guess from real.
    n = 0;
    for (let i = 0; i < guesses.nlasers; i++) {
      if (guesses.exits[i] === LASER_EMPTY && laserExit(state, i) !== laserExit(guesses, i))
        n++;
    }
    if (n) {
      n = randomUpto(gridSeededRandom(guesses), n);
      for (let i = 0; i < guesses.nlasers; i++) {
        if (
          guesses.exits[i] === LASER_EMPTY &&
          laserExit(state, i) !== laserExit(guesses, i) &&
          n-- === 0
        ) {
          fireLaser(state, i);
          state.exits[i] |= LASER_OMITTED;
          const tmp = laserExit(state, i);
          if (rangecheck(state, tmp)) state.exits[tmp] |= LASER_OMITTED;
          state.justwrong = true;
          return 0;
        }
      }
    }
  }

  // Full reveal: a real-layout copy and a guess-layout copy, both with
  // their lasers cleared then fully fired, compared laser by laser.
  const solution = cloneState(state);
  for (let i = 0; i < solution.nlasers; i++) {
    const rc = range2grid(solution.w, solution.h, i) as RangeCell;
    gridSet(solution, rc.x, rc.y, 0);
    solution.exits[i] = LASER_EMPTY;
  }
  const guesses = cloneState(solution);
  guessesAsCorrect(guesses);

  for (let i = 0; i < solution.nlasers; i++) {
    if (solution.exits[i] === LASER_EMPTY) fireLaser(solution, i);
    if (guesses.exits[i] === LASER_EMPTY) fireLaser(guesses, i);
  }

  let ret = 1;
  for (let i = 0; i < solution.nlasers; i++) {
    const rc = range2grid(solution.w, solution.h, i) as RangeCell;
    if (solution.exits[i] !== guesses.exits[i]) {
      if (state.exits[i] === LASER_EMPTY) {
        // The player never fired this distinguishing laser: add it.
        state.exits[i] = solution.exits[i];
        if (state.exits[i] === LASER_REFLECT || state.exits[i] === LASER_HIT) {
          gridSet(state, rc.x, rc.y, state.exits[i]);
        } else {
          const newno = state.laserno++;
          const end = range2grid(state.w, state.h, state.exits[i]) as RangeCell;
          gridSet(state, rc.x, rc.y, newno);
          gridSet(state, end.x, end.y, newno);
        }
        state.exits[i] |= LASER_OMITTED;
      } else {
        state.exits[i] |= LASER_WRONG;
      }
      ret = 0;
    }
  }

  if (ret === 0 || state.nguesses < state.minballs || state.nguesses > state.maxballs) {
    fillCounts(state);
    state.reveal = true;
    return ret;
  }

  // Proven equivalent: make the real balls match the guesses.
  for (let x = 1; x <= state.w; x++) {
    for (let y = 1; y <= state.h; y++) {
      let v = gridGet(state, x, y);
      if (v & BALL_GUESS) v |= BALL_CORRECT;
      else v &= ~BALL_CORRECT;
      gridSet(state, x, y, v);
    }
  }
  fillCounts(state);
  state.reveal = true;
  return ret;
}

// --- predicates -------------------------------------------------------

/** Upstream `CAN_REVEAL`: the verify button is live only with an
 * in-range guess count and no reveal/justwrong already showing. */
export function canReveal(s: BlackboxState): boolean {
  return (
    s.nguesses >= s.minballs &&
    s.nguesses <= s.maxballs &&
    !s.reveal &&
    !s.justwrong
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

// --- shared read helpers for index.ts / render.ts ---------------------

export { gridGet };
