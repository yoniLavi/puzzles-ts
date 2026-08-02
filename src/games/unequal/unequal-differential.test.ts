/**
 * Gated byte-match differential for the Unequal port.
 *
 * For each frozen C-reference fixture (both modes × several difficulties),
 * assert the TS generator reproduces the C desc byte-for-byte over the
 * bit-identical RNG, and that the TS solver grades the board at the same minimal
 * difficulty the C solver recorded. Faithful generation + a faithful solver
 * verdict — the strongest available bar (playbook §4.3/§4.4).
 *
 * The fixture is **frozen and cannot be regenerated**. It was captured by
 * `puzzles/auxiliary/unequal-trace.c` against upstream's C, under an
 * Emscripten/CMake build that `retire-c-engine` deleted along with the
 * sources and the harness — see `engine/testing/differential.ts`.
 */

import { describe, expect, it } from "vitest";
import { randomNew } from "../../engine/random/index.ts";
import reference from "./__fixtures__/unequal-c-reference.json" with { type: "json" };
import { newUnequalDesc } from "./generator.ts";
import { solveUnequal } from "./solver.ts";
import {
  diffFromLevel,
  type Mode,
  newState,
  type UnequalParams,
  validateDesc,
} from "./state.ts";

interface Fixture {
  order: number;
  diff: number;
  mode: number; // 0 = unequal, 1 = adjacent
  seed: string;
  desc: string;
  solverDiff: number;
}

const FIXTURES = reference.fixtures as Fixture[];

function fixtureParams(f: Fixture): UnequalParams {
  const mode: Mode = f.mode === 1 ? "adjacent" : "unequal";
  return { order: f.order, mode, diff: diffFromLevel(f.diff) };
}

describe("unequal differential (byte-match + solver agreement)", () => {
  for (const f of FIXTURES) {
    const p = fixtureParams(f);
    it(`${p.mode} ${f.order} d${f.diff} (seed ${f.seed}): desc matches C byte-for-byte`, () => {
      const { desc } = newUnequalDesc(p, randomNew(f.seed));
      expect(desc).toBe(f.desc);
      expect(validateDesc(p, desc)).toBeNull();
    });

    it(`${p.mode} ${f.order} d${f.diff} (seed ${f.seed}): TS solver grades at the C difficulty`, () => {
      const state = newState(p, f.desc);
      const soln = Uint8Array.from(state.immutable);
      const ret = solveUnequal(
        state.order,
        state.mode,
        state.clueFlags,
        soln,
        f.solverDiff,
      );
      expect(ret).toBe(f.solverDiff);
    });
  }
});
