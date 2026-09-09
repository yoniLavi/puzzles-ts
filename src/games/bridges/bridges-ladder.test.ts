/*
 * Bridges' adoption of `runDeductionFixpoint`, proved by equivalence
 * (`adopt-the-deduction-runner-where-it-rewires`). The harness and the argument
 * for it are `engine/testing/ladder-equivalence.ts`; this file is the
 * declaration.
 *
 * **Bridges is the adopter whose rungs sweep before they report.** Each of its
 * three stages walks every island and only then says whether anything happened.
 * That is the runner's contract at the *ladder* level rather than a violation of
 * it — the runner restarts the ladder when a rung reports progress, and a rung
 * may do as much work as it likes first. The shape that genuinely breaks the
 * runner is a pass that must sweep the whole *ladder* before restarting, which
 * is Lightup's and is why Lightup stays out.
 */
import { randomNew } from "../../engine/random/index.ts";
import { describeLadderEquivalence } from "../../engine/testing/ladder-equivalence.ts";
import { newBridgesDesc } from "./generator.ts";
import { solveFromScratch, solveFromScratchLegacy } from "./solver.ts";
import {
  BRIDGES_PRESETS,
  type BridgesParams,
  type BridgesState,
  newStateFromDesc,
} from "./state.ts";

/** One preset per difficulty, plus a larger board so the connectivity stage has
 * something to chew on. */
const SHAPES: BridgesParams[] = [
  BRIDGES_PRESETS[0],
  BRIDGES_PRESETS[1],
  BRIDGES_PRESETS[2],
  BRIDGES_PRESETS[BRIDGES_PRESETS.length - 1],
];

const SEEDS = ["lad-a", "lad-b", "lad-c"];

const cases = SHAPES.flatMap((params) =>
  SEEDS.map((seed) => {
    const label = `${params.w}x${params.h} d${params.difficulty} ${seed}`;
    const { desc } = newBridgesDesc(params, randomNew(`bridges-ladder-${label}`));
    return { label, board: () => newStateFromDesc(params, desc) };
  }),
);

describeLadderEquivalence<BridgesState>({
  game: "bridges",
  rungs: ["stage1-arithmetic", "stage2-counting", "stage3-connectivity"],
  unreached: {},
  // The stages' own tiers; `difficulty` caps them. The fourth gate the old loop
  // carried (`difficulty < 3`) guarded a stage that does not exist.
  caps: [0, 1, 2, 3],
  cases,
  viaRunner: (s, cap, firings) => solveFromScratch(s, cap, firings),
  viaLegacy: (s, cap) => solveFromScratchLegacy(s, cap),
  // Everything the stages write: the bridge/mark bits per cell, the line counts,
  // and the per-direction possibility masks the counting stage narrows.
  key: (s) =>
    [
      Array.from(s.grid).join(","),
      Array.from(s.lines).join(","),
      Array.from(s.possv).join(","),
      Array.from(s.possh).join(","),
    ].join("|"),
});
