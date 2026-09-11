/**
 * Sokoban — gated differential check against a frozen snapshot of
 * C-generated reference boards (`__fixtures__/sokoban-c-reference.json`).
 *
 * Sokoban has no solver, so the *desc* is the whole reproducible output, and
 * the bar is that the TS generator reproduces the C engine's level
 * byte-for-byte for the same seed: `random.ts` is bit-identical end-to-end
 * through every `random_upto` call the reverse-move generator and its
 * priority-queue search make, and the run-length codec is checked with it.
 *
 * The fixture is **frozen and cannot be regenerated**: it was captured from
 * upstream's C by a trace harness that no longer exists — see
 * `engine/testing/differential.ts`.
 */
import { expect } from "vitest";
import { describeDescDifferential } from "../../engine/testing/differential.ts";
import cReference from "./__fixtures__/sokoban-c-reference.json" with { type: "json" };
import { newSokobanDesc } from "./generator.ts";
import { type SokobanParams, validateDesc } from "./state.ts";

interface Fixture {
  w: number;
  h: number;
  seed: string;
  desc: string;
}

const data = cReference as { fixtures: Fixture[] };

describeDescDifferential<Fixture, SokobanParams>({
  title: "Sokoban differential (frozen C reference)",
  fixtures: data.fixtures,
  label: (f) => `${f.w}x${f.h} seed=${f.seed}`,
  params: (f) => ({ w: f.w, h: f.h }),
  newDesc: newSokobanDesc,
  extra: (f, p) => {
    // The desc the generator emits must also pass validation.
    expect(validateDesc(p, f.desc)).toBeNull();
  },
});
