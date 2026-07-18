/**
 * Gated byte-match differential: the TS generator reproduces the C generator's
 * `desc` **and** `aux` byte for byte for the same seed and params.
 *
 * This is the strongest bar available (playbook §4.3) and the guard that the
 * generator's RNG draw order *and* the souped-up `rect_solver` (the only
 * data-dependent branch of the generation loop, via the uniqueness gate) are
 * faithful: the produced desc depends on the solver's verdict on every
 * candidate layout and on every winnowing draw, so a subtle divergence in
 * either shows up here as a mismatched desc. `random.ts` is bit-identical to
 * `random.c`, and every generation draw is a `randomUpto`.
 *
 * Fixtures were recorded from `puzzles/auxiliary/rect-trace.c`; that harness and
 * `puzzles/rect.c` are deleted when the port ships at owner-confirmed parity,
 * and this frozen snapshot is what survives.
 */

import { describe, expect, it } from "vitest";
import { randomNew } from "../../random/index.ts";
import reference from "./__fixtures__/rect-c-reference.json" with { type: "json" };
import { newDesc } from "./generator.ts";
import { type RectParams, validateDesc } from "./state.ts";

interface RectFixture {
  w: number;
  h: number;
  expandfactor: number;
  unique: boolean;
  seed: string;
  desc: string;
  aux: string;
}

const FIXTURES: readonly RectFixture[] = reference.fixtures;

const paramsOf = (f: RectFixture): RectParams => ({
  w: f.w,
  h: f.h,
  expandfactor: f.expandfactor,
  unique: f.unique,
});

describe("rect differential (vs C reference)", () => {
  for (const f of FIXTURES) {
    const label = `${f.w}x${f.h}${f.expandfactor ? `e${f.expandfactor}` : ""}${
      f.unique ? "" : "a"
    } seed=${f.seed}`;
    it(`reproduces the C desc + aux byte for byte — ${label}`, () => {
      const p = paramsOf(f);
      const { desc, aux } = newDesc(p, randomNew(f.seed));
      expect(desc).toBe(f.desc);
      expect(aux).toBe(f.aux);
      expect(validateDesc(p, desc)).toBeNull();
    });
  }
});
