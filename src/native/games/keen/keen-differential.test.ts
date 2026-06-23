/**
 * Gated byte-match differential for the Keen port.
 *
 * For each frozen C-reference fixture (each difficulty × the multiplication-only
 * flag), assert the TS generator reproduces the C desc byte-for-byte over the
 * bit-identical RNG, and that the TS solver grades the board at the same minimal
 * difficulty the C solver recorded. Faithful generation + a faithful solver
 * verdict — the strongest available bar (playbook §4.3/§4.4).
 *
 * Regenerate the fixture from `puzzles/auxiliary/keen-trace.c` (pure-C):
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make keen-trace)
 *   build/native/auxiliary/keen-trace > __fixtures__/keen-c-reference.json
 */

import { describe, expect, it } from "vitest";
import { randomNew } from "../../random/index.ts";
import reference from "./__fixtures__/keen-c-reference.json" with { type: "json" };
import { newKeenDesc } from "./generator.ts";
import { solveKeen } from "./solver.ts";
import { diffFromLevel, type KeenParams, newState, validateDesc } from "./state.ts";

interface Fixture {
  w: number;
  diff: number;
  mult: boolean;
  seed: string;
  desc: string;
  solverDiff: number;
}

const FIXTURES = reference.fixtures as Fixture[];

function fixtureParams(f: Fixture): KeenParams {
  return { w: f.w, diff: diffFromLevel(f.diff), multiplicationOnly: f.mult };
}

describe("keen differential (byte-match + solver agreement)", () => {
  for (const f of FIXTURES) {
    const p = fixtureParams(f);
    const label = `${f.w}d${f.diff}${f.mult ? "m" : ""} (seed ${f.seed})`;

    it(`${label}: desc matches C byte-for-byte`, () => {
      const { desc } = newKeenDesc(p, randomNew(f.seed));
      expect(desc).toBe(f.desc);
      expect(validateDesc(p, desc)).toBeNull();
    });

    it(`${label}: TS solver grades at the C difficulty`, () => {
      const state = newState(p, f.desc);
      const soln = new Uint8Array(f.w * f.w);
      const ret = solveKeen(f.w, state.clues, soln, f.solverDiff);
      expect(ret).toBe(f.solverDiff);
    });
  }
});
