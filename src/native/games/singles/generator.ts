/**
 * Singles (Hitori) generator — port of `new_game_desc` from `singles.c`. The
 * Latin-square machinery (`latin_generate`/`latin_generate_rect` and the
 * bipartite `matching` it rests on) lives in the shared `engine/latin.ts`
 * (promoted there when Towers became the second consumer); it stays
 * RNG-faithful, so over the bit-identical `random.ts` the whole chain still
 * reproduces the C desc byte-for-byte for the same seed (see
 * `singles-differential.test.ts`).
 */

import { latinGenerateRect } from "../../engine/latin.ts";
import { shuffle } from "../../engine/shuffle.ts";
import type { RandomState } from "../../random/index.ts";
import {
  newSolverState,
  OP_BLACK,
  type SolverState,
  solveAllblackbutone,
  solveRemovesplits,
  solverOpAdd,
  solverOpsDo,
  solveSpecific,
} from "./solver.ts";
import {
  DIFF_ANY,
  DIFF_EASY,
  type Difficulty,
  diffToLevel,
  encodeDesc,
  F_BLACK,
  F_CIRCLE,
  makeState,
  type SinglesParams,
  type SinglesState,
} from "./state.ts";

// --- numbers under black squares (best_black_col) --------------------------

/** Choose the number to lay under the black cell at index `i`, preferring
 * a number that erases a Latin-square uniqueness, then any non-unique one.
 * Updates `rownums`/`colnums` for the chosen number. */
function bestBlackCol(
  s: SinglesState,
  rs: RandomState,
  i: number,
  rownums: Int32Array,
  colnums: Int32Array,
): number {
  const w = s.w;
  const o = s.o;
  const x = i % w;
  const y = (i / w) | 0;

  /* Randomise the list of numbers to try (o RNG draws, as in C). */
  const scratch: number[] = [];
  for (let k = 0; k < o; k++) scratch[k] = k;
  shuffle(scratch, rs);

  let j = 0;
  let found = false;
  /* Prefer numbers that only occur once in their row AND column. */
  for (let k = 0; k < o && !found; k++) {
    j = scratch[k] + 1;
    if (rownums[y * o + j - 1] === 1 && colnums[x * o + j - 1] === 1) found = true;
  }
  /* Otherwise the first number that is not unique in its row/column. */
  for (let k = 0; k < o && !found; k++) {
    j = scratch[k] + 1;
    if (rownums[y * o + j - 1] !== 0 || colnums[x * o + j - 1] !== 0) found = true;
  }
  if (!found) throw new Error("singles: unable to place number under black cell");

  rownums[y * o + j - 1] += 1;
  colnums[x * o + j - 1] += 1;
  return j;
}

// --- difficulty gate (new_game_is_good) ------------------------------------

const MAXTRIES = 20;

/** True iff the board is solvable at `diff` and (for diff > Easy) NOT
 * solvable at the level below with the sneaky generation-artefact step. */
function newGameIsGood(
  diffLevel: number,
  state: SinglesState,
  tosolve: SinglesState,
): boolean {
  tosolve.nums = state.nums; // share immutable numbers
  tosolve.flags.fill(0);
  tosolve.completed = false;
  tosolve.impossible = false;

  const sret = solveSpecific(tosolve, diffLevel, false);
  let sretEasy = 0;
  if (diffLevel > DIFF_EASY) {
    tosolve.flags.fill(0);
    tosolve.completed = false;
    tosolve.impossible = false;
    sretEasy = solveSpecific(tosolve, diffLevel - 1, true);
  }

  return !(sret <= 0 || sretEasy > 0);
}

// --- new_game_desc ---------------------------------------------------------

/** Defensive cap on the outer regenerate loop. Upstream has no cap (it
 * relies on `solveAllblackbutone` locking a white's last escape before it
 * can be boxed in, so generation never makes the board impossible); this
 * only fires if a porting discrepancy would otherwise hang the worker. */
const MAX_REGENERATE = 10000;

export function newSinglesDesc(
  paramsOrig: SinglesParams,
  rs: RandomState,
): { desc: string } {
  let diff: Difficulty = paramsOrig.diff;
  const w = paramsOrig.w;
  const h = paramsOrig.h;
  const o = Math.max(w, h);
  const n = w * h;

  /* Tiny boards (no dimension ≥ 4) can't be generated at Tricky. */
  if ((w < 4 || h < 4) && diffToLevel(diff) > DIFF_EASY) diff = "easy";
  const diffLevel = diffToLevel(diff);

  const nums = new Int8Array(n);
  const state = makeState(w, h, nums);
  const tosolve = makeState(w, h, nums);
  const ss: SolverState = newSolverState(state);

  const scratch = new Int32Array(n);
  const rownums = new Int32Array(h * o);
  const colnums = new Int32Array(w * o);

  let regenerations = 0;
  generate: while (true) {
    if (++regenerations > MAX_REGENERATE) {
      throw new Error("singles generator: exceeded regenerate cap");
    }
    ss.ops = [];
    state.flags.fill(0);

    /* Latin rectangle. */
    const latin = latinGenerateRect(w, h, rs);
    for (let i = 0; i < n; i++) state.nums[i] = latin[i];

    /* Add black squares at random, laying forced whites between placements. */
    for (let i = 0; i < n; i++) scratch[i] = i;
    shuffle(scratch as unknown as number[], rs);
    for (let k = 0; k < n; k++) {
      const i = scratch[k];
      if (state.flags[i] & (F_CIRCLE | F_BLACK)) continue;

      solverOpAdd(ss, i % w, (i / w) | 0, OP_BLACK);
      solverOpsDo(state, ss);

      solveAllblackbutone(state, ss);
      solverOpsDo(state, ss);

      solveRemovesplits(state, ss);
      solverOpsDo(state, ss);

      if (state.impossible) continue generate;
    }

    /* Count white numbers per row/column. */
    rownums.fill(0);
    colnums.fill(0);
    for (let i = 0; i < n; i++) {
      if (state.flags[i] & F_BLACK) continue;
      const j = state.nums[i];
      const x = i % w;
      const y = (i / w) | 0;
      rownums[y * o + j - 1] += 1;
      colnums[x * o + j - 1] += 1;
    }

    let ntries = 0;
    while (true) {
      for (let i = 0; i < n; i++) {
        if (!(state.flags[i] & F_BLACK)) continue;
        state.nums[i] = bestBlackCol(state, rs, i, rownums, colnums);
      }

      if (diffLevel !== DIFF_ANY && !newGameIsGood(diffLevel, state, tosolve)) {
        ntries++;
        if (ntries > MAXTRIES) continue generate;
        continue;
      }
      break;
    }

    return { desc: encodeDesc(state) };
  }
}
