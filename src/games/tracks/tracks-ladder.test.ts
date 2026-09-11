/*
 * Tracks' adoption of `runDeductionFixpoint`, proved by equivalence. The
 * harness and the argument for it are `engine/testing/ladder-equivalence.ts`;
 * this file is the declaration.
 *
 * **The byte-match differential cannot certify the ladder on its own.**
 * Mis-declare a rung's *tier* and it goes red, but delete `check-single`
 * entirely, from the new ladder or the old loop, and it stays green: that rung
 * fires on no board this generator produces (measured: 324 solves, every other
 * rung firing, that one zero), and no corpus can guard what nothing reaches.
 */

import { randomNew } from "../../engine/random/index.ts";
import { describeLadderEquivalence } from "../../engine/testing/ladder-equivalence.ts";
import { newDesc } from "./generator.ts";
import { tracksSolve, tracksSolveLegacy } from "./solver.ts";
import {
  DIFF_EASY,
  DIFF_HARD,
  DIFF_TRICKY,
  decodeDesc,
  type TracksParams,
} from "./state.ts";

/** Board shapes wide enough to need the harder rungs, small enough to generate
 * quickly. One params set per tier, since the tier is what gates the ladder. */
const SHAPES: TracksParams[] = [
  { w: 8, h: 8, diff: DIFF_EASY, singleOnes: true },
  { w: 8, h: 8, diff: DIFF_TRICKY, singleOnes: true },
  { w: 10, h: 8, diff: DIFF_TRICKY, singleOnes: true },
  { w: 10, h: 10, diff: DIFF_HARD, singleOnes: true },
];

const SEEDS = ["lad-a", "lad-b", "lad-c", "lad-d", "lad-e"];

const cases = SHAPES.flatMap((params) =>
  SEEDS.map((seed) => {
    const label = `${params.w}x${params.h} diff=${params.diff} ${seed}`;
    // Generated once per case, decoded fresh per solve.
    const { desc } = newDesc(params, randomNew(`tracks-ladder-${label}`));
    return { label, board: () => decodeDesc(params, desc) };
  }),
);

describeLadderEquivalence({
  game: "tracks",
  rungs: [
    "update-flags",
    "count-clues",
    "check-loop",
    "check-single",
    "check-loose-ends",
    "check-neighbors",
    "check-neighbors-both-ways",
    "check-bridge-parity",
  ],
  unreached: {
    "check-single":
      "Never fires. Measured over 324 solves — 36 shape/tier/single-ones " +
      "combinations, every other rung firing (the next-rarest, " +
      "check-bridge-parity, fires 20 times) — and it fired zero. **Not a port " +
      "defect**: checked against `tracks.c`'s `solve_check_single_sub` and the " +
      "port is line for line, including both guards (`ctrack != target-1`, " +
      "`nperp > 0 || n1edge != 1`). It is upstream's narrowest rule — a line " +
      "with one square left to fill and nowhere perpendicular to run — and the " +
      "boards this generator produces do not reach it. Retire this entry by " +
      "building a board that does.",
  },
  caps: [DIFF_EASY, DIFF_TRICKY, DIFF_HARD],
  cases,
  viaRunner: tracksSolve,
  viaLegacy: tracksSolveLegacy,
  // `sflags` is the whole board state: Tracks packs a square's four TRACK and
  // four NOTRACK *edge* bits into the same word as its square flags
  // (`sESet`/`sEFlags` shift by `S_TRACK_SHIFT` / `S_NOTRACK_SHIFT`).
  key: (b) => `${b.impossible ? "X" : "-"}|${Array.from(b.sflags).join(",")}`,
});
