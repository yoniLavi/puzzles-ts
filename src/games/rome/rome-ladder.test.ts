/*
 * Rome's adoption of `runDeductionFixpoint`, proved by equivalence
 * (`adopt-the-deduction-runner-where-it-rewires`). The harness and the argument
 * for it are `engine/testing/ladder-equivalence.ts`; this file is the
 * declaration.
 *
 * **Rome is the adopter whose tier gates were mid-ladder `break`s**, and the
 * runner *skips* over-cap rungs instead. The two agree only because Rome's
 * ladder is tier-sorted, which `romeSolve` says at the `maxTier` line — this
 * file is the check on real boards at all three caps.
 */
import { randomNew } from "../../engine/random/index.ts";
import { describeLadderEquivalence } from "../../engine/testing/ladder-equivalence.ts";
import { newRomeDesc } from "./generator.ts";
import { romeSolve, romeSolveLegacy } from "./solver.ts";
import {
  DIFF_EASY,
  DIFF_NORMAL,
  DIFF_TRICKY,
  type RomeParams,
  readDesc,
} from "./state.ts";

const SHAPES: RomeParams[] = [
  { w: 4, h: 4, diff: DIFF_EASY },
  { w: 6, h: 6, diff: DIFF_NORMAL },
  { w: 6, h: 6, diff: DIFF_TRICKY },
  { w: 8, h: 8, diff: DIFF_NORMAL },
  { w: 8, h: 8, diff: DIFF_TRICKY },
  { w: 10, h: 10, diff: DIFF_TRICKY },
];

// Five rather than three: `naked-pairs` fired on none of the first twelve
// boards, and widening is what the census is for — a rung goes in `unreached`
// only after the corpus has genuinely been given a chance to reach it.
const SEEDS = ["lad-a", "lad-b", "lad-c", "lad-d", "lad-e"];

const cases = SHAPES.flatMap((params) =>
  SEEDS.map((seed) => {
    const label = `${params.w}x${params.h} diff=${params.diff} ${seed}`;
    const { desc } = newRomeDesc(params, randomNew(`rome-ladder-${label}`));
    return { label, board: () => readDesc(params, desc).board };
  }),
);

describeLadderEquivalence({
  game: "rome",
  rungs: [
    "single",
    "doubles",
    "loops",
    "find-4-position",
    "naked-pairs",
    "expand",
    "opposites",
  ],
  unreached: {
    "naked-pairs":
      "Never fires — and not only on finished boards. Instrumented inside the " +
      "rung itself and run through *generation*: **2,896 calls across 36 board " +
      "generations, zero firings**, so it is dead on the clue-stripping path too, " +
      "which is the path that decides which puzzles exist. " +
      "**Why that is not a port defect, argued rather than assumed**: `rome.c` " +
      "is puzzles-unreleased and is not in the sibling clone, so the C could not " +
      "be read — but Rome's differential is a *byte-match* against recorded C " +
      "descs and it passes. A rung wrongly dead here while live in C would change " +
      "this solver's verdict on intermediate clue sets and the generated descs " +
      "would diverge. They do not. So either the rule is equally dead in C, or " +
      "its firings never alter an outcome on this corpus. " +
      "**One live consequence**: the rung's own comment claims its faithfully " +
      "reproduced scan-order quirk (`k < c`, the union-by-size root rather than " +
      "the minimum) 'changes which puzzles exist'. On this evidence it changes " +
      "nothing, because the rung never reaches the loop that quirk is in. Retire " +
      "this entry by building a board that fires it — or, if none exists, that " +
      "comment is the thing to correct.",
  },
  caps: [DIFF_EASY, DIFF_NORMAL, DIFF_TRICKY],
  cases,
  viaRunner: romeSolve,
  viaLegacy: romeSolveLegacy,
  // `grid` is the placed arrows, `pencil` the solver's live candidate set;
  // `regions` is the static layout and is never merged while solving.
  key: (b) => `${Array.from(b.grid).join(",")}|${Array.from(b.pencil).join(",")}`,
});
