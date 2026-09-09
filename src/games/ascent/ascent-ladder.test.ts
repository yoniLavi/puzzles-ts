/*
 * Ascent's adoption of `runDeductionFixpoint`, proved by equivalence
 * (`adopt-the-deduction-runner-where-it-rewires`). The harness and the argument
 * for it are `engine/testing/ladder-equivalence.ts`; this file is the
 * declaration.
 *
 * **Ascent is the adopter that proves the runner needs no `when` predicate.**
 * Two of its nine rungs have availability no `tier` can express — `overlap` runs
 * at Hard *or* in Edges mode at any difficulty, and `single-number-simple` runs
 * at Tricky and **not** at Hard, which is non-monotone in the cap. Both guard
 * themselves and return `0`, the convention `re-derive-the-fixpoint-no-gos`
 * settled; `ascentLadder`'s doc comment carries the argument. This file is the
 * check, and it walks **all four caps** because that non-monotone rung is
 * visible only by comparing Tricky against Hard.
 *
 * **Each case builds a fresh `SolverScratch` per solve, deliberately.**
 * `foundEndpoints` persists across solves on one scratch — a documented upstream
 * quirk that is byte-match critical — so sharing a scratch between the two sides
 * would make them diverge for a reason that has nothing to do with the ladder.
 */
import { randomNew } from "../../engine/random/index.ts";
import { describeLadderEquivalence } from "../../engine/testing/ladder-equivalence.ts";
import { newAscentDesc } from "./generator.ts";
import { ascentSolve, ascentSolveLegacy, SolverScratch } from "./solver.ts";
import {
  type AscentParams,
  DIFF_EASY,
  DIFF_HARD,
  DIFF_NORMAL,
  DIFF_TRICKY,
  MODE_EDGES,
  MODE_HEXAGON,
  MODE_ORTHOGONAL,
  MODE_RECT,
  newAscentState,
} from "./state.ts";

const mk = (
  w: number,
  h: number,
  diff: number,
  mode: number,
  removeends = false,
): AscentParams => ({ w, h, diff, mode, removeends, symmetrical: false });

/** Every mode, because `overlap`'s self-guard reads `sc.mode`, and Edges is the
 * arm that makes it run below Hard. */
const SHAPES: [string, AscentParams][] = [
  ["5x5 rect normal", mk(5, 5, DIFF_NORMAL, MODE_RECT)],
  ["5x5 rect hard", mk(5, 5, DIFF_HARD, MODE_RECT)],
  ["6x5 orthogonal tricky", mk(6, 5, DIFF_TRICKY, MODE_ORTHOGONAL)],
  ["7x7 hexagon normal", mk(7, 7, DIFF_NORMAL, MODE_HEXAGON)],
  ["5x5 edges tricky", mk(5, 5, DIFF_TRICKY, MODE_EDGES, true)],
];

const SEEDS = ["lad-a", "lad-b", "lad-c"];

interface AscentCase {
  grid: Int16Array;
  sc: SolverScratch;
}

const cases = SHAPES.flatMap(([name, params]) =>
  SEEDS.map((seed) => {
    const label = `${name} ${seed}`;
    const { desc } = newAscentDesc(params, randomNew(`ascent-ladder-${label}`));
    return {
      label,
      board: (): AscentCase => {
        const state = newAscentState(params, desc);
        return {
          grid: state.grid,
          sc: new SolverScratch(state.w, state.h, state.mode, state.last),
        };
      },
    };
  }),
);

describeLadderEquivalence<AscentCase>({
  game: "ascent",
  rungs: [
    "single-position",
    "proximity-simple",
    "update-path",
    "adjacent-path",
    "remove-endpoints",
    "remove-path",
    "proximity-full",
    "overlap",
    "single-number-simple",
    "single-number-full",
  ],
  unreached: {},
  caps: [DIFF_EASY, DIFF_NORMAL, DIFF_TRICKY, DIFF_HARD],
  cases,
  viaRunner: (b, cap, onFiring) => ascentSolve(b.grid, cap, b.sc, onFiring),
  viaLegacy: (b, cap) => ascentSolveLegacy(b.grid, cap, b.sc),
  // Every array the rungs write: the working grid, the candidate bitmap, the
  // path segments, and the endpoint latch whose persistence is the quirk above.
  key: (b) =>
    [
      Array.from(b.sc.grid).join(","),
      Array.from(b.sc.marks).join(","),
      Array.from(b.sc.path).join(","),
      b.sc.foundEndpoints ? "E" : "-",
    ].join("|"),
});
