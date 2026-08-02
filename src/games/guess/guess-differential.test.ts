/**
 * Guess — gated differential check against a frozen snapshot of
 * C-generated reference descriptions (`__fixtures__/guess-c-reference.json`).
 *
 * C-free: this test does not link the C build. Guess's secret is just a
 * random colour sequence run through the SHA-1 obfuscation codec, so the
 * strongest meaningful bar is that the TS generator reproduces the C
 * engine's **whole** game description for the same seed — proving both
 * that `random.ts` is bit-identical end-to-end (the colour picks, incl.
 * the no-duplicates re-roll) and that the obfuscation matches C
 * byte-for-byte. An identical desc is the cleanest possible Guess
 * differential. Every C desc must also pass `validateDesc` and recover a
 * legal solution.
 *
 * The fixture is **frozen and cannot be regenerated**. It was captured by
 * `puzzles/auxiliary/guess-trace.c` against upstream's C, under an
 * Emscripten/CMake build that `retire-c-engine` deleted along with the
 * sources and the harness — see `engine/testing/differential.ts`.
 */
import { describe, expect, it } from "vitest";
import { describeDescDifferential } from "../../engine/testing/differential.ts";
import cReference from "./__fixtures__/guess-c-reference.json" with { type: "json" };
import {
  decodeParams,
  type GuessParams,
  newDesc,
  newState,
  validateDesc,
} from "./state.ts";

interface Ref {
  seed: string;
  params: string;
  desc: string;
}

const refs = cReference as Ref[];

describe("Guess differential corpus", () => {
  it("has a non-trivial frozen corpus", () => {
    expect(refs.length).toBeGreaterThanOrEqual(20);
  });
});

describeDescDifferential<Ref, GuessParams>({
  title: "Guess differential (frozen C snapshot)",
  fixtures: refs,
  label: (ref) => `${ref.params} seed="${ref.seed}"`,
  params: (ref) => decodeParams(ref.params),
  // Byte-identical generator path (random.ts + obfuscation).
  newDesc,
  extra: (ref, params) => {
    // The C desc is a valid, decodable solution.
    expect(validateDesc(params, ref.desc)).toBeNull();
    const state = newState(params, ref.desc);
    expect(state.solution).toHaveLength(params.npegs);
    for (const c of state.solution) {
      expect(c).toBeGreaterThanOrEqual(1);
      expect(c).toBeLessThanOrEqual(params.ncolours);
    }
  },
});
