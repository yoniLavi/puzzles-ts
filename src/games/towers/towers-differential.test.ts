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
 * Regenerate the fixture (while towers.c still exists):
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make towers-trace)
 *   build/native/auxiliary/towers-trace \
 *     > src/native/games/towers/__fixtures__/towers-c-reference.json
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

// 1. Byte-for-byte desc match — the shared faithful-generator bar.
describeDescDifferential<Fixture, TowersParams>({
  title: "Towers C-vs-TS differential — desc byte-match (gated)",
  fixtures: data.fixtures,
  label,
  params,
  newDesc: (p, rng) => newTowersDesc(p, rng),
});

// 2. Solver agreement — game-specific (decode + grade), inline.
describe("Towers C-vs-TS differential — solver agreement (gated)", () => {
  for (const f of data.fixtures) {
    const p = params(f);
    it(`${label(f)}: TS solver grades the C board at the recorded difficulty`, () => {
      const s = newState(p, f.desc);
      // Grades exactly at the recorded difficulty.
      const soln = Uint8Array.from(s.immutable);
      expect(solveTowers(f.w, s.clues, soln, f.solverDiff)).toBe(f.solverDiff);
      // Not solvable one level below.
      if (f.solverDiff > 0) {
        const below = Uint8Array.from(s.immutable);
        const r = solveTowers(f.w, s.clues, below, f.solverDiff - 1);
        expect(
          r === DIFF_IMPOSSIBLE || r === DIFF_AMBIGUOUS || r > f.solverDiff - 1,
        ).toBe(true);
      }
    });
  }
});
