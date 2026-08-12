/**
 * Gated byte-match differential for the Keen port.
 *
 * For each frozen C-reference fixture (each difficulty × the multiplication-only
 * flag), assert the TS generator reproduces the C desc byte-for-byte over the
 * bit-identical RNG, and that the TS solver grades the board at the same minimal
 * difficulty the C solver recorded. Faithful generation + a faithful solver
 * verdict — the strongest available bar (docs/games/testing.md § "Byte-match: fidelity where there is a right answer"/§4.4).
 *
 * The fixture is **frozen and cannot be regenerated**. It was captured by
 * `puzzles/auxiliary/keen-trace.c` against upstream's C, under an
 * Emscripten/CMake build that `retire-c-engine` deleted along with the
 * sources and the harness — see `engine/testing/differential.ts`.
 */

import { describe, expect, it } from "vitest";
import { randomNew } from "../../engine/random/index.ts";
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

    // Both bars run with `upstreamForcingTier`, the *only* place it is set.
    // `audit-guessing-tier-names` moved the forcing rung from Extreme to
    // Unreasonable, which changes every Extreme description and regrades any
    // board whose solution needs a forcing chain; running the fixtures against
    // upstream's rung placement keeps the byte-match oracle over everything
    // else — the generator's draw order, the cage assembly, every cheaper
    // deduction and the codec. See `LatinSolver.forcing`.
    it(`${label}: desc matches C byte-for-byte`, () => {
      const { desc } = newKeenDesc(p, randomNew(f.seed), true);
      expect(desc).toBe(f.desc);
      expect(validateDesc(p, desc)).toBeNull();
    });

    it(`${label}: TS solver grades at the C difficulty`, () => {
      const state = newState(p, f.desc);
      const soln = new Uint8Array(f.w * f.w);
      const ret = solveKeen(f.w, state.clues, soln, f.solverDiff, undefined, true);
      expect(ret).toBe(f.solverDiff);
    });
  }
});
