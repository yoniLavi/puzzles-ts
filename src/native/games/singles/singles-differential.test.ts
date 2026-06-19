/**
 * Gated C-vs-TS differential for the Singles (Hitori) port. Reads the
 * committed fixture recorded from upstream singles.c
 * (puzzles/auxiliary/singles-trace.c) and asserts:
 *
 *  1. TS `newSinglesDesc` over the same seed reproduces the C desc
 *     byte-for-byte — the whole generation chain (matching → Latin →
 *     blacks → numbers → difficulty gate) is a faithful port and the RNG
 *     is bit-identical, so the streams must agree exactly.
 *  2. The TS solver solves the C-generated board at the C-recorded
 *     difficulty (and, for Tricky, fails one level below).
 *
 * Regenerate the fixture (while singles.c still exists):
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make singles-trace)
 *   build/native/auxiliary/singles-trace \
 *     > src/native/games/singles/__fixtures__/singles-c-reference.json
 */
import { describe, expect, it } from "vitest";
import { describeDescDifferential } from "../../engine/testing/differential.ts";
import cReference from "./__fixtures__/singles-c-reference.json" with { type: "json" };
import { newSinglesDesc } from "./generator.ts";
import { solveSpecific } from "./solver.ts";
import { DIFF_TRICKY, diffFromLevel, newState, type SinglesParams } from "./state.ts";

interface Fixture {
  seed: string;
  w: number;
  h: number;
  diff: number;
  desc: string;
  solverDiff: number;
}

const data = cReference as { fixtures: Fixture[] };

const params = (f: Fixture): SinglesParams => ({
  w: f.w,
  h: f.h,
  diff: diffFromLevel(f.diff),
});
const label = (f: Fixture) => `${f.w}x${f.h}/d${f.diff} seed=${f.seed}`;

// 1. Byte-for-byte desc match — the shared faithful-generator bar.
describeDescDifferential<Fixture, SinglesParams>({
  title: "Singles C-vs-TS differential — desc byte-match (gated)",
  fixtures: data.fixtures,
  label,
  params,
  newDesc: (p, rng) => newSinglesDesc(p, rng),
});

// 2. Solver agreement — game-specific (decode + solve + difficulty), inline.
describe("Singles C-vs-TS differential — solver agreement (gated)", () => {
  for (const f of data.fixtures) {
    const p = params(f);
    it(`${label(f)}: TS solver solves the C board at the recorded difficulty`, () => {
      const s = newState(p, f.desc);
      expect(solveSpecific(s, f.solverDiff, false)).toBe(1);
      if (f.solverDiff >= DIFF_TRICKY) {
        const s2 = newState(p, f.desc);
        // One level below (Easy), with the sneaky step, it should NOT solve.
        expect(solveSpecific(s2, f.solverDiff - 1, true)).not.toBe(1);
      }
    });
  }
});
