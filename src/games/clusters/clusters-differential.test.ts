/**
 * Clusters — gated differential against a frozen snapshot of C-generated
 * reference boards (`__fixtures__/clusters-c-reference.json`).
 *
 * C-free: this test does not link the C build. Clusters' generator is
 * solver-gated (it accepts only a board its contradiction solver can uniquely
 * complete) and its codec is an exact inverse, so the strongest meaningful
 * bar is that the TS `newDesc` reproduces the C engine's desc byte-for-byte
 * for the same seed — which validates the generator, the solver AND the
 * run-length codec all at once (playbook §4 intro).
 *
 * The fixture is **frozen and cannot be regenerated**. It was captured by
 * `puzzles/auxiliary/clusters-trace.c` against upstream's C, under an
 * Emscripten/CMake build that `retire-c-engine` deleted along with the
 * sources and the harness — see `engine/testing/differential.ts`.
 */
import { expect } from "vitest";
import { describeDescDifferential } from "../../engine/testing/differential.ts";
import cReference from "./__fixtures__/clusters-c-reference.json" with { type: "json" };
import { newClustersDesc } from "./generator.ts";
import { type ClustersParams, validateDesc } from "./state.ts";

interface Fixture {
  w: number;
  h: number;
  seed: string;
  desc: string;
}

const data = cReference as { fixtures: Fixture[] };

describeDescDifferential<Fixture, ClustersParams>({
  title: "Clusters differential (frozen C reference)",
  fixtures: data.fixtures,
  label: (f) => `${f.w}x${f.h} seed=${f.seed}`,
  params: (f) => ({ w: f.w, h: f.h }),
  newDesc: newClustersDesc,
  extra: (f, p) => {
    // The desc the generator emits must also pass validation.
    expect(validateDesc(p, f.desc)).toBeNull();
  },
});
