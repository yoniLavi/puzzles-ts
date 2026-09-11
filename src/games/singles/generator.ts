/**
 * Singles (Hitori) generator, a port of `new_game_desc` from `singles.c`. The
 * Latin-square machinery lives in the shared `engine/latin.ts` and stays
 * RNG-faithful, so over the bit-identical `random.ts` the whole chain still
 * reproduces the C desc byte-for-byte for the same seed (see
 * `singles-differential.test.ts`).
 */

import { latinGenerateRect } from "../../engine/latin.ts";
import type { RandomState } from "../../engine/random/index.ts";
import { retryLimit } from "../../engine/retry-limit.ts";
import { shuffle } from "../../engine/shuffle.ts";
import {
  newSolverState,
  OP_BLACK,
  solveAllblackbutone,
  solveRemovesplits,
  solverOpAdd,
  solverOpsDo,
  solveSpecific,
} from "./solver.ts";
import {
  DIFF_EASY,
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
 * `rownums`/`colnums` count the white copies at `line * o + number - 1`;
 * the chosen number is added to them. */
function bestBlackCol(
  s: SinglesState,
  rs: RandomState,
  i: number,
  rownums: Int32Array,
  colnums: Int32Array,
): number {
  const o = s.o;
  const row = ((i / s.w) | 0) * o;
  const col = (i % s.w) * o;

  /* Randomize the order to try the numbers in (o RNG draws, as in C). */
  const order: number[] = [];
  for (let k = 0; k < o; k++) order[k] = k;
  shuffle(order, rs);

  /* Prefer numbers that only occur once in their row AND column, otherwise
   * the first number that is not unique in its row/column. */
  let v = -1;
  for (let k = 0; k < o && v < 0; k++) {
    if (rownums[row + order[k]] === 1 && colnums[col + order[k]] === 1) v = order[k];
  }
  for (let k = 0; k < o && v < 0; k++) {
    if (rownums[row + order[k]] !== 0 || colnums[col + order[k]] !== 0) v = order[k];
  }
  if (v < 0) throw new Error("singles: unable to place number under black cell");

  rownums[row + v] += 1;
  colnums[col + v] += 1;
  return v + 1;
}

// --- difficulty gate (new_game_is_good) ------------------------------------

const MAXTRIES = 20;

/** True iff the board is solvable at `diffLevel` and (above Easy) NOT
 * solvable at the level below with the sneaky generation-artifact step. */
function newGameIsGood(diffLevel: number, state: SinglesState): boolean {
  const blank = () => makeState(state.w, state.h, state.nums);
  if (solveSpecific(blank(), diffLevel, false) <= 0) return false;
  return diffLevel === DIFF_EASY || solveSpecific(blank(), diffLevel - 1, true) <= 0;
}

// --- new_game_desc ---------------------------------------------------------

/** Upstream has no cap here: it relies on `solveAllblackbutone` locking a
 * white's last escape before it can be boxed in, so generation never makes the
 * board impossible. The guard below only fires if a porting discrepancy breaks
 * that invariant (see engine/retry-limit.ts). */
export function newSinglesDesc(p: SinglesParams, rs: RandomState): { desc: string } {
  const { w, h } = p;
  const o = Math.max(w, h);
  const n = w * h;

  /* A board under 4 in either dimension can't be generated at Tricky. */
  const diffLevel = w < 4 || h < 4 ? DIFF_EASY : diffToLevel(p.diff);

  const state = makeState(w, h, new Int8Array(n));
  const ss = newSolverState(state);

  const cells: number[] = [];
  const rownums = new Int32Array(h * o);
  const colnums = new Int32Array(w * o);

  const attempt = retryLimit("singles: generation");
  generate: while (true) {
    attempt();

    ss.ops = [];
    state.flags.fill(0);
    state.nums.set(latinGenerateRect(w, h, rs));

    /* Add black squares at random, laying forced whites between placements. */
    for (let i = 0; i < n; i++) cells[i] = i;
    shuffle(cells, rs);
    for (const i of cells) {
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
      const v = state.nums[i] - 1;
      rownums[((i / w) | 0) * o + v] += 1;
      colnums[(i % w) * o + v] += 1;
    }

    for (let tries = 0; ; tries++) {
      for (let i = 0; i < n; i++) {
        if (state.flags[i] & F_BLACK)
          state.nums[i] = bestBlackCol(state, rs, i, rownums, colnums);
      }
      if (newGameIsGood(diffLevel, state)) return { desc: encodeDesc(state) };
      if (tries >= MAXTRIES) continue generate;
    }
  }
}
