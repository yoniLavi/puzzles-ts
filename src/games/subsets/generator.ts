/**
 * Subsets generator — port of `new_game_desc` in
 * `puzzles/unreleased/subsets.c`.
 *
 * This is the byte-match surface (see subsets-differential.test.ts). The
 * RNG draw order is upstream's exactly: one `shuffle` of the `2^n`
 * set-values over the cells (the entire board assignment), then one
 * `shuffle` of the cell indices for the blanking order. Every arrow clue is
 * derived deterministically from the ⊆ relation, and each cell is blanked
 * only while the deterministic solver still reaches a complete solution —
 * so the desc is a pure function of the seed, and one byte-match validates
 * the generator, the solver's exact strength, and the codec together.
 */

import type { RandomState } from "../../engine/random/index.ts";
import { shuffle } from "../../engine/shuffle.ts";
import { subsetsSolveGame } from "./solver.ts";
import {
  ADJTHAN,
  blankState,
  cloneState,
  encodeDesc,
  type SubsetsParams,
} from "./state.ts";

export function newSubsetsDesc(p: SubsetsParams, rng: RandomState): { desc: string } {
  const state = blankState(p);
  const { w, h, n } = p;
  const n2 = 1 << n;

  // Assign every set-value to a cell by one shuffle. (At the only legal
  // params n2 === w·h, so this covers the whole grid — as upstream, which
  // seeds and shuffles exactly the first n2 cells.)
  const values = Array.from({ length: n2 }, (_, i) => i);
  shuffle(values, rng);
  for (let i = 0; i < n2; i++) {
    state.known[i] = values[i];
    state.mask[i] = values[i];
    state.immutable[i] = 1;
  }

  // Derive every arrow clue from the subset relation.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let d = 0; d < 4; d++) {
        if (
          x + ADJTHAN[d].dx < 0 ||
          x + ADJTHAN[d].dx >= w ||
          y + ADJTHAN[d].dy < 0 ||
          y + ADJTHAN[d].dy >= h
        )
          continue;
        const i = y * w + x;
        const i2 = i + ADJTHAN[d].dy * w + ADJTHAN[d].dx;
        if ((state.known[i] & state.known[i2]) === state.known[i2])
          state.clues[i] |= ADJTHAN[d].f;
      }
    }
  }

  // Blank cells in a shuffled order, keeping each blank only while the
  // solver still completes (the uniqueness gate).
  const spaces = Array.from({ length: w * h }, (_, i) => i);
  shuffle(spaces, rng);
  for (const i of spaces) {
    state.immutable[i] = 0;
    const solved = cloneState(state);
    if (subsetsSolveGame(solved) !== "complete") state.immutable[i] = 1;
  }

  return { desc: encodeDesc(state) };
}
