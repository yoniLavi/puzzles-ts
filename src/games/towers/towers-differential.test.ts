/**
 * Gated C-vs-TS differential for the Towers port. Reads the committed fixture
 * recorded from upstream towers.c (puzzles/auxiliary/towers-trace.c) and
 * asserts:
 *
 *  1. TS `newTowersDesc` over the same seed reproduces the C desc
 *     byte-for-byte — the whole generation chain (Latin square → clue
 *     derivation → solver-gated removal) is a faithful port and the RNG is
 *     bit-identical, so the streams must agree exactly.
 *  2. The TS solver grades the C-generated board at the C-recorded difficulty
 *     (and does not solve it one level below).
 *
 * The fixture is **frozen and cannot be regenerated**. It was captured by
 * `puzzles/auxiliary/towers-trace.c` against upstream's C, under an
 * Emscripten/CMake build that `retire-c-engine` deleted along with the
 * sources and the harness — see `engine/testing/differential.ts`.
 */
import { describe, expect, it } from "vitest";
import { describeDescDifferential } from "../../engine/testing/differential.ts";
import cReference from "./__fixtures__/towers-c-reference.json" with { type: "json" };
import { newTowersDesc } from "./generator.ts";
import { DIFF_AMBIGUOUS, DIFF_IMPOSSIBLE, solveTowers } from "./solver.ts";
import { diffFromLevel, newState, type TowersParams } from "./state.ts";

interface Fixture {
  w: number;
  diff: number;
  seed: string;
  desc: string;
  solverDiff: number;
}

const data = cReference as { fixtures: Fixture[] };

const params = (f: Fixture): TowersParams => ({ w: f.w, diff: diffFromLevel(f.diff) });
const label = (f: Fixture) => `${f.w}d${f.diff} seed=${f.seed}`;

// Both bars below run with `upstreamForcingTier`, the *only* place it is set.
// `audit-guessing-tier-names` moved the forcing rung from Extreme to
// Unreasonable — it propagates from a hypothesis, and only an `Unreasonable`
// tier may require that — which changes every Extreme description and regrades
// any board whose solution needs a chain. Running the fixtures against
// upstream's rung placement keeps the byte-match oracle over everything else:
// `latinGenerate`'s draw order, the clue read-off, the two removal loops, every
// cheaper deduction and the codec. See `LatinSolver.forcing`.

// 1. Byte-for-byte desc match — the shared faithful-generator bar.
describeDescDifferential<Fixture, TowersParams>({
  title: "Towers C-vs-TS differential — desc byte-match (gated)",
  fixtures: data.fixtures,
  label,
  params,
  newDesc: (p, rng) => newTowersDesc(p, rng, true),
});

// 2. Solver agreement — game-specific (decode + grade), inline.
describe("Towers C-vs-TS differential — solver agreement (gated)", () => {
  for (const f of data.fixtures) {
    const p = params(f);
    it(`${label(f)}: TS solver grades the C board at the recorded difficulty`, () => {
      const s = newState(p, f.desc);
      // Grades exactly at the recorded difficulty.
      const soln = Uint8Array.from(s.immutable);
      expect(solveTowers(f.w, s.clues, soln, f.solverDiff, undefined, true)).toBe(
        f.solverDiff,
      );
      // Not solvable one level below.
      if (f.solverDiff > 0) {
        const below = Uint8Array.from(s.immutable);
        const r = solveTowers(f.w, s.clues, below, f.solverDiff - 1, undefined, true);
        expect(
          r === DIFF_IMPOSSIBLE || r === DIFF_AMBIGUOUS || r > f.solverDiff - 1,
        ).toBe(true);
      }
    });
  }
});
