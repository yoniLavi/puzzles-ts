/**
 * Guess — differential check against a frozen snapshot of C-generated
 * descriptions (`__fixtures__/guess-c-reference.json`).
 *
 * Guess's secret is a random color sequence run through the SHA-1
 * obfuscation codec, so reproducing upstream's **whole** desc for the same
 * seed proves both that `random.ts` is bit-identical (the color picks,
 * including the no-duplicates re-roll) and that the obfuscation matches byte
 * for byte. Every C desc must also pass `validateDesc` and decode to a legal
 * solution.
 *
 * The fixture is **frozen and cannot be regenerated** (upstream's
 * `auxiliary/guess-trace.c` captured it); see `engine/testing/differential.ts`.
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
      expect(c).toBeLessThanOrEqual(params.ncolors);
    }
  },
});
