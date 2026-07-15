/**
 * Gated differential: the TS generator reproduces the C generator's desc **and**
 * `aux` byte for byte for the same seed.
 *
 * This is the strongest bar available (playbook §4.3), and it is the guard that
 * `net_solver`, `perturb`, and the generator's phase order are faithful: the
 * generated desc depends on the solver's verdict on every candidate grid and on
 * every RNG draw perturbation makes, so a subtle divergence in either shows up
 * here as a mismatched desc. `random.ts` is bit-identical to `random.c`, every
 * draw is a `randomUpto`, and the ordered structures indexed into (the sorted
 * candidate set by `xyd_cmp`; the perimeter sort, whose keys are distinct so its
 * order is total) are reproduced exactly.
 *
 * The fixtures were recorded from `puzzles/auxiliary/net-trace.c`. That harness
 * and `puzzles/net.c` are deleted when the port ships at owner-confirmed parity;
 * this frozen snapshot is what survives.
 */

import { describe, expect, it } from "vitest";
import { describeDescDifferential } from "../../engine/testing/differential.ts";
import { randomNew } from "../../random/index.ts";
import reference from "./__fixtures__/net-c-reference.json" with { type: "json" };
import { newDesc } from "./generator.ts";
import { isComplete, type NetParams, newState, validateDesc } from "./state.ts";

interface NetFixture {
  w: number;
  h: number;
  wrapping: boolean;
  unique: boolean;
  barrierProbability: number;
  seed: string;
  desc: string;
  aux: string;
}

const FIXTURES: readonly NetFixture[] = reference.fixtures;

const paramsOf = (f: NetFixture): NetParams => ({
  w: f.w,
  h: f.h,
  wrapping: f.wrapping,
  unique: f.unique,
  barrierProbability: f.barrierProbability,
});

describeDescDifferential<NetFixture, NetParams>({
  title: "net differential (vs C reference)",
  fixtures: FIXTURES,
  params: paramsOf,
  label: (f) =>
    `${f.w}x${f.h}${f.wrapping ? "w" : ""}${f.unique ? "" : "a"} b=${f.barrierProbability}`,
  newDesc,
  extra: (f, p) => {
    expect(validateDesc(p, f.desc)).toBeNull();
  },
});

describe("net differential: the solution grid", () => {
  for (const f of FIXTURES) {
    it(`${f.w}x${f.h} ${f.seed}: TS aux matches C, and solves the board`, () => {
      const p = paramsOf(f);
      const { aux } = newDesc(p, randomNew(f.seed));
      expect(aux).toBe(f.aux);

      // The aux *is* the solution, so this also pins that Solve leaves a
      // genuinely finished board.
      const s = newState(p, f.desc);
      const solved = {
        ...s,
        tiles: Uint8Array.from(f.aux, (c) => Number.parseInt(c, 16)),
      };
      expect(isComplete(solved)).toBe(true);
    });
  }
});
