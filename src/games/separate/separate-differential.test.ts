/**
 * Gated C-vs-TS differential for Separate.
 *
 * The generator runs over the bit-identical `random.ts`, so `newDesc`
 * reproduces the C desc byte-for-byte for a given seed (docs/games/testing.md §
 * "Byte-match: fidelity where there is a right answer"). It is *solver-gated*:
 * it keeps a board only when the solver fully solves it, so byte-match also
 * demands the TS solver reach C's exact verdict. The follow-on assertion
 * re-solves each C board to confirm it.
 *
 * The fixture is **frozen and cannot be regenerated**: the C build and the
 * trace harness that captured it are gone — see `engine/testing/differential.ts`.
 */
import { expect } from "vitest";
import { describeDescDifferential } from "../../engine/testing/differential.ts";
import cReference from "./__fixtures__/separate-c-reference.json" with { type: "json" };
import { newSeparateDesc } from "./generator.ts";
import { solve } from "./solver.ts";
import { newState, type SeparateParams } from "./state.ts";

interface Fixture {
  seed: string;
  desc: string;
  w: number;
  h: number;
  k: number;
}
const data = cReference as { fixtures: Fixture[] };

describeDescDifferential<Fixture, SeparateParams>({
  title: "separate differential (frozen C reference)",
  fixtures: data.fixtures,
  label: (f) => `${f.w}x${f.h}n${f.k} seed=${f.seed}`,
  params: (f) => ({ w: f.w, h: f.h, k: f.k }),
  newDesc: newSeparateDesc,
  // Every C board is uniquely solvable by the ported solver.
  extra: (f, p) => {
    const state = newState(p, f.desc);
    expect(solve(p, state.letters)).not.toBeNull();
  },
});
