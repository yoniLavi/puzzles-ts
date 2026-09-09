/*
 * **The adoption of `runDeductionFixpoint`, proved by equivalence.**
 *
 * `adopt-the-deduction-runner-where-it-rewires` re-plumbed `tracksSolve`'s
 * hand-written eight-rung loop onto the shared runner. The obvious proof was the
 * byte-match differential — eleven C-recorded fixtures across all three tiers,
 * asserting the desc byte-for-byte and the grade — and it passed. Then it was
 * asked to fail, which is where this file came from.
 *
 * **What the differential can see**: mis-declare a rung's tier and eight of its
 * cases go red at once. It guards seven of the eight rungs properly.
 *
 * **What it cannot**: delete `check-single` entirely — from the new ladder *or*
 * from the old loop — and all 39 Tracks tests stay green. Not because the
 * differential is weak, but because **that rung fires nowhere**: measured over
 * 324 solves across 36 shape/tier/mode combinations, every other rung fires and
 * it fires zero times. No corpus can guard a rung nothing reaches, and nothing
 * in the tree said so.
 *
 * So this file does three things the fixtures do not:
 *
 *  1. **Equivalence, not agreement with a recording.** The old loop is kept as
 *     `tracksSolveLegacy` and the two must agree on verdict, grade **and final
 *     board state** — so a ladder reaching the same answer by different
 *     deductions fails, which a desc comparison cannot see.
 *  2. **Every cap for every board.** The cap is what selects rungs, so a capped
 *     solve is a different walk down the same ladder.
 *  3. **A firing census**, which is what made the blindness visible in the first
 *     place and is asserted here so it stays visible. A rung this corpus never
 *     fires is named in `UNREACHED` with its reason — a live shortfall, not an
 *     exemption.
 */
import { describe, expect, it } from "vitest";
import { randomNew } from "../../engine/random/index.ts";
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

/** A structural key for the whole solved board, so "the two agree" means the
 * same *deductions* and not merely the same verdict — a ladder that reached the
 * same answer down a different path fails here.
 *
 * `sflags` is the whole of it: Tracks packs a square's four TRACK and four
 * NOTRACK **edge** bits into the same word as its square flags
 * (`sESet`/`sEFlags` shift by `S_TRACK_SHIFT` / `S_NOTRACK_SHIFT`), so there is
 * no second array to compare. */
function boardKey(b: { sflags: ArrayLike<number>; impossible: boolean }): string {
  return `${b.impossible ? "X" : "-"}|${Array.from(b.sflags).join(",")}`;
}

/**
 * Rungs this corpus never fires, each with the reason it cannot.
 *
 * **Empty is the goal and is not yet reached.** An entry here is a rung whose
 * behavior nothing in this file certifies, so it is a live shortfall rather
 * than an exemption — the `NO_KEYBOARD` shape (`docs/games/testing.md`
 * § "How a cross-game guard finds its population").
 */
const UNREACHED: Record<string, string> = {
  "check-single":
    "Never fires. Measured over 324 solves — 36 shape/tier/single-ones " +
    "combinations, every other rung firing (the next-rarest, check-bridge-parity, " +
    "fires 20 times) — and it fired zero. **Not a port defect**: checked against " +
    "`tracks.c`'s `solve_check_single_sub` and the port is line for line, " +
    "including both guards (`ctrack != target-1`, `nperp > 0 || n1edge != 1`). " +
    "It is upstream's narrowest rule — a line with one square left to fill and " +
    "nowhere perpendicular to run — and the boards this generator produces do " +
    "not reach it. Retire this entry by building a board that does; until then " +
    "nothing certifies that rung, which is exactly why deleting it left all 39 " +
    "Tracks tests green.",
};

describe("the shared runner drives Tracks' ladder exactly as the hand-written loop did", () => {
  const fired = new Set<string>();
  let compared = 0;

  for (const params of SHAPES) {
    for (const seed of SEEDS) {
      const label = `${params.w}x${params.h} diff=${params.diff} ${seed}`;
      it(`${label}: same verdict, same grade, same board`, () => {
        const { desc } = newDesc(params, randomNew(`tracks-ladder-${label}`));

        // Every tier, not just the board's own: the cap is what selects rungs,
        // so a capped solve is a different walk down the same ladder and is
        // exactly where a mis-declared `tier` would show.
        for (const cap of [DIFF_EASY, DIFF_TRICKY, DIFF_HARD]) {
          const viaRunner = decodeDesc(params, desc);
          const viaLegacy = decodeDesc(params, desc);

          const got = tracksSolve(viaRunner, cap, (id) => fired.add(id));
          const want = tracksSolveLegacy(viaLegacy, cap);
          compared++;

          expect(got, `${label} cap=${cap}: verdict/grade differ`).toEqual(want);
          expect(
            boardKey(viaRunner),
            `${label} cap=${cap}: same verdict but a different board — the two ` +
              "ladders made different deductions",
          ).toBe(boardKey(viaLegacy));
        }
      });
    }
  }

  it("compared a real corpus, and fired every rung it names", () => {
    // Vacuity: agreement over nothing is agreement.
    expect(compared, "no board was compared").toBeGreaterThanOrEqual(
      SHAPES.length * SEEDS.length * 3,
    );

    const all = [
      "update-flags",
      "count-clues",
      "check-loop",
      "check-single",
      "check-loose-ends",
      "check-neighbors",
      "check-neighbors-both-ways",
      "check-bridge-parity",
    ];
    const missing = all.filter((id) => !fired.has(id)).sort();
    expect(
      missing,
      "a rung this corpus never fires is a rung this file does not certify; " +
        "widen SHAPES/SEEDS until it does, or record it in UNREACHED with why",
    ).toEqual(Object.keys(UNREACHED).sort());
  });
});
