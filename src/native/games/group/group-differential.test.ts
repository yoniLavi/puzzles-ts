/**
 * Gated byte-match differential for the Group port.
 *
 * For each frozen C-reference fixture (sizes 4..12, both identity modes, every
 * difficulty each size admits), assert the TS generator reproduces the C desc
 * byte-for-byte over the bit-identical RNG, and that the TS solver grades the
 * board at the same minimal difficulty the C solver recorded. Because the
 * generator is solver-gated, that single byte-match validates the generator,
 * the solver's every deduction, the group data table and the codec together —
 * the strongest available bar (playbook §4.3/§4.4, design D8).
 *
 * Regenerate the fixture from `puzzles/auxiliary/group-trace.c` (pure-C):
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make group-trace)
 *   build/native/auxiliary/group-trace \
 *     > src/native/games/group/__fixtures__/group-c-reference.json
 */

import { describe, expect, it } from "vitest";
import { randomNew } from "../../random/index.ts";
import reference from "./__fixtures__/group-c-reference.json" with { type: "json" };
import { newGameDesc } from "./generator.ts";
import { solveGroup } from "./solver.ts";
import { type GroupParams, newState, validateDesc } from "./state.ts";

interface Fixture {
  w: number;
  diff: number;
  id: boolean;
  seed: string;
  desc: string;
  solverDiff: number;
}

const FIXTURES = reference.fixtures as Fixture[];

const params = (f: Fixture): GroupParams => ({ w: f.w, diff: f.diff, id: f.id });

describe("group differential (byte-match + solver agreement)", () => {
  for (const f of FIXTURES) {
    const label = `${f.w}d${f.diff}${f.id ? "" : "i"} (seed ${f.seed})`;

    it(`${label}: desc matches C byte-for-byte`, () => {
      const { desc } = newGameDesc(params(f), randomNew(f.seed));
      expect(desc).toBe(f.desc);
      expect(validateDesc(params(f), desc)).toBeNull();
    });

    it(`${label}: TS solver grades at the C difficulty`, () => {
      const givens = newState(params(f), f.desc).grid.slice();
      const ret = solveGroup(givens, f.w, f.solverDiff);
      expect(ret).toBe(f.solverDiff);
    });
  }
});
