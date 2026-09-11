/**
 * Gated differential against a frozen C-reference snapshot
 * (`__fixtures__/mathrax-c-reference.json`, recorded from
 * `puzzles/auxiliary/mathrax-trace.c` before `mathrax.c` was deleted).
 *
 * Two bars, because the port deliberately diverges on exactly one tier:
 *
 * 1. **Byte-for-byte descriptions on Easy / Normal / Tricky.** Mathrax's
 *    generator is solver-gated — both clue-stripping loops keep a removal only
 *    while the graded solver still copes — so the published description depends
 *    on the solver's verdict on every intermediate board. One byte-match
 *    therefore validates `latinGenerate`'s RNG draw order, the two `shuffle`s,
 *    every deduction the tiered solver makes (including the shared
 *    `engine/latin.ts` framework), the candidate-clue precedence cascade and the
 *    run-length codec, all at once
 *    (docs/games/testing.md § "Byte-match: fidelity where there is a right answer").
 *
 *    **`upstreamLooseGate` is set here and nowhere else.** The shipped
 *    generator additionally rejects a board the tier below already solves,
 *    which upstream never checks (see
 *    `MathraxGenerateOptions.upstreamLooseGate`; 3 of these very fixtures are
 *    misgraded that way). That correction changes every description above Easy,
 *    so the byte-match is preserved by running the fixtures against upstream's
 *    original gate — the shape `spokes` established.
 *
 * 2. **Solver-verdict agreement on every fixture, including Recursive.** The
 *    port requires a *unique* solution when stripping (see `generator.ts`'s
 *    divergence note), so its Recursive boards are not upstream's and cannot be
 *    byte-matched. The frozen C descriptions for that tier are still checked the
 *    order-independent way (docs/games/testing.md § "Order-independent verdicts"): the TS solver must reach C's
 *    recorded verdict on each — which for those three is `2`, *ambiguous*, the
 *    very defect the divergence fixes.
 */

import { describe, expect, it } from "vitest";
import { describeDescDifferential } from "../../engine/testing/differential.ts";
import cReference from "./__fixtures__/mathrax-c-reference.json" with { type: "json" };
import { newMathraxDesc } from "./generator.ts";
import { mathraxSolve } from "./solver.ts";
import {
  DIFF_RECURSIVE,
  diffFromLevel,
  encodeParams,
  type MathraxParams,
  newState,
  validateDesc,
} from "./state.ts";

interface MathraxFixture {
  o: number;
  diff: number;
  options: number;
  seed: string;
  desc: string;
  /** C's `mathrax_solve(board, DIFF_RECURSIVE)` verdict on the finished board. */
  verdict: number;
}

const fixtures = (cReference as { fixtures: MathraxFixture[] }).fixtures;
/** The tiers the port reproduces bit-for-bit (everything below Recursive). */
const faithful = fixtures.filter((f) => f.diff < DIFF_RECURSIVE);

const paramsOf = (f: MathraxFixture): MathraxParams => ({
  o: f.o,
  diff: diffFromLevel(f.diff),
  options: f.options,
});

describe("mathrax fixture corpus", () => {
  it("covers every size, difficulty tier and a clue-option sweep", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(28);
    expect(new Set(fixtures.map((f) => f.o))).toEqual(new Set([3, 4, 5, 6, 7, 8, 9]));
    expect(new Set(fixtures.map((f) => f.diff))).toEqual(new Set([0, 1, 2, 3]));
    expect(faithful.length).toBe(fixtures.length - 3);
  });
});

describeDescDifferential<MathraxFixture, MathraxParams>({
  title: "mathrax differential (byte-for-byte vs C, Easy/Normal/Tricky)",
  label: (f) => `${encodeParams(paramsOf(f), true)} seed=${f.seed}`,
  fixtures: faithful,
  params: paramsOf,
  newDesc: (p, rng) => newMathraxDesc(p, rng, { upstreamLooseGate: true }),
  // The C description must also survive our own decoder unchanged.
  extra: (f, p) => {
    expect(validateDesc(p, f.desc)).toBeNull();
  },
});

describe("mathrax differential (solver verdicts vs C, every tier)", () => {
  for (const f of fixtures) {
    it(`${encodeParams(paramsOf(f), true)} seed=${f.seed}: TS solver agrees with C`, () => {
      const p = paramsOf(f);
      expect(validateDesc(p, f.desc)).toBeNull();
      const st = newState(p, f.desc);
      expect(
        mathraxSolve(p.o, Uint8Array.from(st.grid), st.clues, DIFF_RECURSIVE),
      ).toBe(f.verdict);
    });
  }

  it("records upstream's Recursive tier as ambiguous — the divergence's premise", () => {
    const recursive = fixtures.filter((f) => f.diff === DIFF_RECURSIVE);
    expect(recursive).not.toHaveLength(0);
    // Every upstream Recursive board has more than one solution (indeed these
    // three are stripped to a completely blank grid).
    expect(recursive.every((f) => f.verdict === 2)).toBe(true);
  });
});
