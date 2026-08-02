/**
 * Gated C-vs-TS differential for the Unruly port. Reads the committed
 * fixture recorded from upstream unruly.c (puzzles/auxiliary/unruly-trace.c)
 * and asserts:
 *
 *  1. TS `newDesc` over the same seed reproduces the C desc **byte-for-byte**
 *     — the generator is a faithful port and the RNG is bit-identical, so
 *     the streams must agree exactly (the strongest possible check, like
 *     Flip's CROSSES path).
 *  2. The TS solver solves the C-generated board at the C-recorded
 *     difficulty (no harder, and it completes).
 *
 * Regenerate the fixture (when unruly.c still exists) with:
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make unruly-trace)
 *   build/native/auxiliary/unruly-trace > <this dir>/__fixtures__/unruly-c-reference.json
 */
import { describe, expect, it } from "vitest";
import { describeDescDifferential } from "../../engine/testing/differential.ts";
import cReference from "./__fixtures__/unruly-c-reference.json" with { type: "json" };
import { newDesc } from "./generator.ts";
import { newScratch, solveGame, validateCounts, validateRows } from "./solver.ts";
import { newState, type UnrulyParams } from "./state.ts";

interface Fixture {
  w2: number;
  h2: number;
  unique: boolean;
  diff: number;
  seed: string;
  desc: string;
  solverDiff: number;
}

const data = cReference as { fixtures: Fixture[] };

const params = (f: Fixture): UnrulyParams => ({
  w2: f.w2,
  h2: f.h2,
  unique: f.unique,
  diff: f.diff,
});
const label = (f: Fixture) =>
  `${f.w2}x${f.h2}${f.unique ? "u" : ""}/d${f.diff} seed=${f.seed}`;

// 1. Byte-for-byte desc match — the shared faithful-generator bar.
describeDescDifferential<Fixture, UnrulyParams>({
  title: "Unruly C-vs-TS differential — desc byte-match (gated)",
  fixtures: data.fixtures,
  label,
  params,
  newDesc,
});

// 2. Solver agreement — game-specific (decode + solve + difficulty), inline.
describe("Unruly C-vs-TS differential — solver agreement (gated)", () => {
  for (const f of data.fixtures) {
    const p = params(f);
    it(`${label(f)}: TS solver solves the C board at the recorded difficulty`, () => {
      const state = newState(p, f.desc);
      const grid = Uint8Array.from(state.grid);
      const work = { w2: f.w2, h2: f.h2, unique: f.unique, grid };
      const scratch = newScratch(work);
      const maxdiff = solveGame(work, scratch, f.diff);
      expect(validateCounts(work, null)).toBe(0);
      expect(validateRows(work, null)).toBe(0);
      // The solver should need no technique harder than the recorded one.
      expect(maxdiff).toBeLessThanOrEqual(f.solverDiff);
    });
  }
});
