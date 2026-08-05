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

import { type CappedSolve, solvableAtExactlyTier } from "../../engine/difficulty.ts";
import type { RandomState } from "../../engine/random/index.ts";
import { retryLimit } from "../../engine/retry-limit.ts";
import { shuffle } from "../../engine/shuffle.ts";
import { subsetsSolveGame } from "./solver.ts";
import {
  ADJTHAN,
  blankState,
  cloneState,
  DIFF_EASY,
  encodeDesc,
  type SubsetsParams,
  type SubsetsState,
} from "./state.ts";

/**
 * One candidate board at `p.diff`: upstream's generation exactly, with the
 * solver capped at the requested tier.
 *
 * **The Easy tier is upstream byte-for-byte.** `DIFF_EASY` is upstream's
 * shipped solver strength, the RNG draw order is untouched, and tier 0 needs
 * no "and not easier" gate — so the differential fixtures still bind (design
 * D3). Only Tricky is new.
 */
export function generateCandidate(p: SubsetsParams, rng: RandomState): SubsetsState {
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
    if (subsetsSolveGame(solved, p.diff) !== "complete") state.immutable[i] = 1;
  }

  return state;
}

/**
 * Generate a board at exactly `p.diff`.
 *
 * Unlike Clusters', this generator has **no state carried between attempts**:
 * every candidate redraws both shuffles, so the whole board is fresh
 * randomness and a plain retry cannot re-derive the board it just rejected
 * (the hazard `add-clusters-difficulty-tiers` hit — see the proposal). That is
 * why the tier gate is a bare loop rather than a perturbation.
 *
 * Easy takes the first candidate: tier 0 has no tier below to be too easy for,
 * so its acceptance rule is upstream's unchanged and its descs are unchanged
 * with it.
 */
export function newSubsetsDesc(p: SubsetsParams, rng: RandomState): { desc: string } {
  const attempt = retryLimit("subsets generation");
  for (;;) {
    attempt();
    const state = generateCandidate(p, rng);
    if (p.diff === DIFF_EASY) return { desc: encodeDesc(state) };

    // `solvableAtExactlyTier` asks the *cheap* question first — "does the tier
    // below already finish it?" — so a too-easy candidate is rejected without
    // ever paying for the deeper solve.
    const solve: CappedSolve = (cap) =>
      subsetsSolveGame(cloneState(state), cap) === "complete" ? "solved" : "unsolved";
    if (solvableAtExactlyTier(solve, p.diff)) return { desc: encodeDesc(state) };
  }
}
