/*
 * Seismic's `runDeductionFixpoint` ladder, proved equivalent to the hand-written
 * `solveGameLegacy`. The harness and the argument for it are
 * `engine/testing/ladder-equivalence.ts`; this file is the declaration.
 *
 * **Seismic is the game the "same grade?" check was written for**: its
 * hand-written loop bumps the grade on *reaching* the second tier, not on firing
 * it. `solveGameLegacy`'s doc comment argues the two coincide here; this file
 * checks that they do, on real boards, at every cap.
 */
import { randomNew } from "../../engine/random/index.ts";
import { describeLadderEquivalence } from "../../engine/testing/ladder-equivalence.ts";
import { newSeismicDesc } from "./generator.ts";
import { solveGame, solveGameLegacy } from "./solver.ts";
import {
  DIFF_EASY,
  DIFF_NORMAL,
  MODE_SEISMIC,
  MODE_TECTONIC,
  newState,
  type SeismicParams,
} from "./state.ts";

/** Both modes at both tiers: the mode changes the region shapes the rungs reason
 * over, and the tier is what gates the Hard rung. */
const SHAPES: SeismicParams[] = [
  { w: 4, h: 4, diff: DIFF_EASY, mode: MODE_SEISMIC },
  { w: 4, h: 4, diff: DIFF_NORMAL, mode: MODE_TECTONIC },
  { w: 6, h: 6, diff: DIFF_EASY, mode: MODE_TECTONIC },
  { w: 6, h: 6, diff: DIFF_NORMAL, mode: MODE_SEISMIC },
  { w: 7, h: 7, diff: DIFF_NORMAL, mode: MODE_TECTONIC },
];

const SEEDS = ["lad-a", "lad-b", "lad-c"];

const cases = SHAPES.flatMap((params) =>
  SEEDS.map((seed) => {
    const label = `${params.w}x${params.h} mode=${params.mode} diff=${params.diff} ${seed}`;
    const { desc } = newSeismicDesc(params, randomNew(`seismic-ladder-${label}`));
    return { label, board: () => newState(params, desc) };
  }),
);

describeLadderEquivalence({
  game: "seismic",
  rungs: ["marks", "areas", "attempt"],
  unreached: {},
  caps: [DIFF_EASY, DIFF_NORMAL],
  cases,
  viaRunner: solveGame,
  viaLegacy: solveGameLegacy,
  // Everything a rung writes: the placements, the candidate masks and the error
  // flags. The dsf is the region partition and is never mutated while solving.
  key: (b) =>
    `${Array.from(b.grid).join(",")}|${Array.from(b.pencil).join(",")}|${Array.from(b.flags).join(",")}`,
});
