/**
 * Gated C-vs-TS differential for the Bridges port. Reads the committed fixture
 * recorded from upstream bridges.c (puzzles/auxiliary/bridges-trace.c) and
 * asserts:
 *
 *  1. TS `newDesc` over the same seed reproduces the C desc **byte-for-byte** —
 *     the generator is a faithful port, its accept/reject decisions are made by
 *     identical solver verdicts, and the RNG is bit-identical.
 *  2. The TS solver solves each C-generated board at the recorded difficulty
 *     and (for a Medium/Hard board with enough islands) does NOT solve it one
 *     level down — the same "too easy" gate the generator applied.
 *
 * Regenerate the fixture (while bridges.c still exists) with:
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make bridges-trace)
 *   build/native/auxiliary/bridges-trace \
 *     > src/native/games/bridges/__fixtures__/bridges-c-reference.json
 */
import { describe, expect, it } from "vitest";
import { describeDescDifferential } from "../../engine/testing/differential.ts";
import cReference from "./__fixtures__/bridges-c-reference.json" with { type: "json" };
import { newBridgesDesc } from "./generator.ts";
import { solveFromScratch } from "./solver.ts";
import { type BridgesParams, newStateFromDesc, validateDesc } from "./state.ts";

interface Fixture {
  w: number;
  h: number;
  maxb: number;
  islands: number;
  expansion: number;
  allowloops: boolean;
  difficulty: number;
  seed: string;
  desc: string;
}

const data = cReference as { fixtures: Fixture[] };

const MIN_SENSIBLE_ISLANDS = 3;

const params = (f: Fixture): BridgesParams => ({
  w: f.w,
  h: f.h,
  maxb: f.maxb,
  islands: f.islands,
  expansion: f.expansion,
  allowloops: f.allowloops,
  difficulty: f.difficulty,
});

const label = (f: Fixture) =>
  `${f.w}x${f.h} m${f.maxb}${f.allowloops ? "" : "L"} d${f.difficulty} seed=${f.seed}`;

// 1. Byte-for-byte desc match (plus the desc validating, for free).
describeDescDifferential<Fixture, BridgesParams>({
  title: "Bridges C-vs-TS differential — desc byte-match (gated)",
  fixtures: data.fixtures,
  label,
  params,
  newDesc: newBridgesDesc,
  extra: (f, p) => {
    expect(validateDesc(p, f.desc)).toBeNull();
  },
});

// 2. Solver agreement — the TS solver grades every C board like C did.
describe("Bridges C-vs-TS differential — solver agreement (gated)", () => {
  for (const f of data.fixtures) {
    const p = params(f);
    it(`${label(f)}: TS solver solves at difficulty ${f.difficulty}`, () => {
      const state = newStateFromDesc(p, f.desc);
      expect(solveFromScratch(state.workingCopy(), f.difficulty)).toBe(1);

      // The "too easy" gate: a Medium/Hard board with more than the sensible
      // minimum of islands must not solve one difficulty down.
      if (f.difficulty > 0 && state.islands.length > MIN_SENSIBLE_ISLANDS) {
        expect(solveFromScratch(state.workingCopy(), f.difficulty - 1)).toBe(0);
      }
    });
  }
});
