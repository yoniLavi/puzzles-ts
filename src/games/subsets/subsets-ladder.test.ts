/*
 * Subsets' adoption of `runDeductionFixpoint`, proved by equivalence. The
 * harness and the argument for it are `engine/testing/ladder-equivalence.ts`;
 * this file is the declaration.
 *
 * **Two things about Subsets that no other adopter has**, both recorded on
 * `subsetsSolveGameLegacy`: its per-iteration prologue moved into `settled`
 * rather than becoming a never-firing rung, and its difficulty is a boolean
 * handed to one rung rather than a cap over the ladder — so `maxTier` and the
 * grade are both unused here. The `caps` below are still both tiers, because the
 * boolean changes what `arrows-advanced` does and that is exactly what has to
 * agree.
 */
import { randomNew } from "../../engine/random/index.ts";
import { describeLadderEquivalence } from "../../engine/testing/ladder-equivalence.ts";
import { newSubsetsDesc } from "./generator.ts";
import { subsetsSolveGame, subsetsSolveGameLegacy } from "./solver.ts";
import { DIFF_EASY, DIFF_TRICKY, newState, type SubsetsParams } from "./state.ts";

/** Subsets has one board shape; the tier is its only axis. */
const SHAPES: SubsetsParams[] = [
  { w: 4, h: 4, n: 4, diff: DIFF_EASY },
  { w: 4, h: 4, n: 4, diff: DIFF_TRICKY },
];

const SEEDS = ["lad-a", "lad-b", "lad-c", "lad-d", "lad-e"];

const cases = SHAPES.flatMap((params) =>
  SEEDS.map((seed) => {
    const label = `diff=${params.diff} ${seed}`;
    const { desc } = newSubsetsDesc(params, randomNew(`subsets-ladder-${label}`));
    return { label, board: () => newState(params, desc) };
  }),
);

describeLadderEquivalence({
  game: "subsets",
  rungs: ["arrows", "disjoint", "bits-from-cube", "single-position", "arrows-advanced"],
  unreached: {},
  caps: [DIFF_EASY, DIFF_TRICKY],
  cases,
  viaRunner: subsetsSolveGame,
  viaLegacy: subsetsSolveGameLegacy,
  // Everything the rungs write. `clues` and `immutable` are fixed puzzle data.
  key: (b) =>
    `${Array.from(b.known).join(",")}|${Array.from(b.mask).join(",")}|${b.completed ? "C" : "-"}`,
});
