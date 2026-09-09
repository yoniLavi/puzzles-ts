/*
 * Galaxies' adoption of `runDeductionFixpoint`, proved by equivalence
 * (`adopt-the-deduction-runner-where-it-rewires`). The harness and the argument
 * for it are `engine/testing/ladder-equivalence.ts`; this file is the
 * declaration.
 *
 * **Galaxies was the adoption allowed to fail.** It is the only adopter that
 * already threads a `SolverRecorder` through its rungs — the recorder its
 * explained hint narrates from — and the task said in terms that if the shared
 * runner could not carry that, Galaxies stays out. It carries it without
 * touching it: `runDeductionFixpoint` is oblivious to a rung's side effects, so
 * each rung still takes `rec` and still records the same firings. The proof that
 * no word moved is `galaxies-hint.test.ts`, which asserts the narration strings
 * and is unchanged; this file proves the deductions themselves are identical.
 *
 * **The comparison stops at the ladder**, where `galaxiesLadderLegacy` stops.
 * `solverRecurse` sits above it and was not re-plumbed, so running it here would
 * compare two identical code paths at considerable expense.
 */
import { randomNew } from "../../engine/random/index.ts";
import { describeLadderEquivalence } from "../../engine/testing/ladder-equivalence.ts";
import { galaxiesGame } from "./index.ts";
import {
  clearForSolve,
  GalaxiesDiff,
  galaxiesLadderLegacy,
  galaxiesLadderOnly,
} from "./solver.ts";
import { cloneState, type GalaxiesState } from "./state.ts";

interface Shape {
  w: number;
  h: number;
  diff: GalaxiesDiff;
}

const SHAPES: Shape[] = [
  { w: 5, h: 5, diff: GalaxiesDiff.Normal },
  { w: 7, h: 7, diff: GalaxiesDiff.Normal },
  { w: 7, h: 7, diff: GalaxiesDiff.Unreasonable },
  { w: 9, h: 9, diff: GalaxiesDiff.Normal },
];

const SEEDS = ["lad-a", "lad-b", "lad-c"];

const cases = SHAPES.flatMap((p) =>
  SEEDS.map((seed) => {
    const label = `${p.w}x${p.h} diff=${p.diff} ${seed}`;
    const { desc } = galaxiesGame.newDesc(p, randomNew(`galaxies-ladder-${label}`));
    const base = galaxiesGame.newState(p, desc);
    return {
      label,
      board: (): GalaxiesState => {
        // Clear the player-side associations so the ladder starts from the dots
        // alone, exactly as the generator and `solve` do.
        const s = cloneState(base);
        clearForSolve(s);
        return s;
      },
    };
  }),
);

describeLadderEquivalence<GalaxiesState>({
  game: "galaxies",
  rungs: ["lines-opposite", "spaces-oneposs", "expand-dots", "extend-exclaves"],
  unreached: {},
  // Every rung is `GalaxiesDiff.Normal` and `maxDiff` gates only the recursion
  // above the ladder, so there is a single cap to walk. The enum's other values
  // are verdict sentinels, not harder tiers.
  caps: [GalaxiesDiff.Normal],
  cases,
  viaRunner: (s, _cap, onFiring) => galaxiesLadderOnly(s, onFiring),
  viaLegacy: (s) => galaxiesLadderLegacy(s),
  // Everything the rungs write: the wall/edge flag word per space, and the
  // per-tile association (which dot owns it) with its count.
  key: (s) =>
    [
      Array.from(s.flags).join(","),
      Array.from(s.dotx).join(","),
      Array.from(s.doty).join(","),
      Array.from(s.nassoc).join(","),
    ].join("|"),
});
