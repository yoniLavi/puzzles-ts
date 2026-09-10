/*
 * Magnets' two ladders on `runDeductionFixpoint`, certified by equivalence
 * (`certify-the-magnets-ladder`). The harness and the argument for it are
 * `engine/testing/ladder-equivalence.ts`; this file is the declaration.
 *
 * **Why Magnets needed this after the fact.** It was on the runner before the
 * harness existed (`adopt-shared-deduction-fixpoint`, 2026-08-01), so it was
 * never in the population the harness was built for. Its frozen differential
 * proves no board moved, and the harness's header explains why that certifies
 * only the rungs the corpus happens to fire — which, until this file, nobody
 * had measured.
 *
 * **Two runner call sites, so two blocks.** `solve` walks the eight-rung graded
 * ladder over a clued board; `solveUnnumbered` walks `force`/`neither` over a
 * *partially laid* board with no clue counts at all, which is what the
 * generator runs between placements. The second corpus is built the way the
 * generator builds it: a prefix of the solution laid through `set`, in a
 * seeded order, then the unnumbered solve from there.
 */
import { randomNew } from "../../engine/random/index.ts";
import { shuffle } from "../../engine/shuffle.ts";
import { describeLadderEquivalence } from "../../engine/testing/ladder-equivalence.ts";
import { newMagnetsDesc } from "./generator.ts";
import { MagnetsSolver } from "./solver.ts";
import {
  DIFF_EASY,
  DIFF_TRICKY,
  GS_SET,
  type MagnetsParams,
  NEGATIVE,
  NEUTRAL,
  newState,
  POSITIVE,
} from "./state.ts";

/** Both tiers and both clue modes, at the preset sizes: the tier is what gates
 * the last four rungs, and stripped clues are what make the counting rungs
 * work for their living. */
const SHAPES: MagnetsParams[] = [
  { w: 6, h: 5, diff: DIFF_EASY, stripclues: false },
  { w: 6, h: 5, diff: DIFF_TRICKY, stripclues: false },
  { w: 6, h: 5, diff: DIFF_TRICKY, stripclues: true },
  { w: 8, h: 7, diff: DIFF_EASY, stripclues: true },
  { w: 8, h: 7, diff: DIFF_TRICKY, stripclues: false },
  { w: 8, h: 7, diff: DIFF_TRICKY, stripclues: true },
  { w: 10, h: 9, diff: DIFF_TRICKY, stripclues: false },
  { w: 10, h: 9, diff: DIFF_TRICKY, stripclues: true },
];

/** Eight seeds, not three: a mis-tiered `advancedfull` shows only on a Tricky
 * board where it is the first Tricky rung to fire from the Easy stall, and
 * fifteen boards contained none such — the differential caught the plant on
 * one fixture while the ladder stayed green. The corpus is sized so the tier
 * plant is red here too (task 4.2), which the whole cap walk is for. */
const SEEDS = ["lad-a", "lad-b", "lad-c", "lad-d", "lad-e", "lad-f", "lad-g", "lad-h"];

const generated = SHAPES.flatMap((params) =>
  SEEDS.map((seed) => {
    const label = `${params.w}x${params.h} diff=${params.diff}${params.stripclues ? " strip" : ""} ${seed}`;
    // Generated once per case, rebuilt fresh per solve.
    const { desc, aux } = newMagnetsDesc(params, randomNew(`magnets-ladder-${label}`));
    return { label, params, desc, aux };
  }),
);

/** A solver over the board's clues, started empty — what `solve` expects. */
function cluedSolver(params: MagnetsParams, desc: string): MagnetsSolver {
  const s = newState(params, desc);
  return new MagnetsSolver(
    s.w,
    s.h,
    s.common.dominoes,
    s.common.rowcount,
    s.common.colcount,
  );
}

/**
 * `neither` never fires, and cannot — in either ladder, and in the C.
 *
 * Its test is "both ends of a domino are NOT-positive (or both NOT-negative)".
 * But the only writer of a NOT bit is `unflag`, which always writes the pair:
 * NOT-`which` on one end and NOT-*opposite* on the other, because a domino's
 * ends are opposite poles (`magnets.c` `solve_unflag`, reproduced line for
 * line). So an end that is NOT-positive has a partner that is NOT-negative,
 * and a partner that is *also* NOT-positive carries both bits — which is
 * exactly `force`'s test, one rung earlier. Every board on which `neither`
 * would deduce, `force` has already deduced on and restarted the ladder.
 *
 * What `neither` can still do is return −1 on an end carrying all three NOT
 * bits, which `force` matches nothing against; that is a contradiction report,
 * not a firing, and whether the generator ever reaches it is unmeasured — which
 * is why the rung stays rather than being deleted as dead. Measured over 60
 * clued solves at two caps and 45 unnumbered solves: zero firings, every other
 * rung firing. Checked against `magnets.c`'s `solve_neither` and
 * `solve_unflag`: the C has the same rung, the same primitive, and the same
 * dead deduction.
 */
const NEITHER_IS_SUBSUMED_BY_FORCE =
  "Structurally unreachable as a deduction: `unflag` mirrors every NOT bit " +
  "across the domino, so both ends NOT-positive means one end is also " +
  "NOT-negative, and `force` fires on it first. Same in `magnets.c`. See the " +
  "comment above.";

/** Everything a rung writes: the scratch grid and the flag word per cell (SET,
 * the three NOT bits, ERROR). The dominoes and the counts are inputs. */
const key = (s: MagnetsSolver): string =>
  `${Array.from(s.grid).join(",")}|${Array.from(s.flags).join(",")}`;

describeLadderEquivalence({
  game: "magnets",
  rungs: [
    "force",
    "neither",
    "checkfull",
    "oddlength",
    "advancedfull",
    "nonneutral",
    "count-dominoes-neutral",
    "count-dominoes-nonneutral",
  ],
  unreached: { neither: NEITHER_IS_SUBSUMED_BY_FORCE },
  caps: [DIFF_EASY, DIFF_TRICKY],
  cases: generated.map((g) => ({
    label: g.label,
    board: () => cluedSolver(g.params, g.desc),
  })),
  viaRunner: (b, cap, firings) => b.solve(cap, firings),
  viaLegacy: (b, cap) => b.solveLegacy(cap),
  key,
});

/** The generator's shape: no counts, a seeded prefix of the solution laid
 * through `set` (which already propagates the NOT bits across each domino and
 * its neighbors), then the unnumbered solve. Three prefix lengths per board so
 * the corpus reaches both "more to deduce" and "nothing left". */
const unnumbered = generated.flatMap((g) =>
  [0.2, 0.5, 0.8].map((fraction) => ({
    label: `${g.label} laid=${fraction}`,
    board: () => {
      const s = newState(g.params, g.desc);
      const solver = new MagnetsSolver(
        s.w,
        s.h,
        s.common.dominoes,
        new Int32Array(3 * s.h),
        new Int32Array(3 * s.w),
      );
      const order = Array.from({ length: s.wh }, (_, i) => i);
      shuffle(order, randomNew(`magnets-ladder-lay-${g.label}`));
      for (const i of order.slice(0, Math.floor(s.wh * fraction))) {
        if (solver.flags[i] & GS_SET) continue;
        const which =
          g.aux[i] === "+" ? POSITIVE : g.aux[i] === "-" ? NEGATIVE : NEUTRAL;
        solver.set(i, which);
      }
      return solver;
    },
  })),
);

describeLadderEquivalence({
  game: "magnets (unnumbered)",
  rungs: ["force", "neither"],
  unreached: { neither: NEITHER_IS_SUBSUMED_BY_FORCE },
  // The unnumbered solve has no cap; one walk per board.
  caps: [DIFF_EASY],
  cases: unnumbered,
  viaRunner: (b, _cap, firings) => b.solveUnnumbered(firings),
  viaLegacy: (b) => b.solveUnnumberedLegacy(),
  key,
});
