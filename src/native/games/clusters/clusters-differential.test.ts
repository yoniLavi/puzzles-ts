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
 * The fixture is a frozen snapshot — both `puzzles/unreleased/clusters.c` and
 * `puzzles/auxiliary/clusters-trace.c` are deleted in the same change that
 * flips the TS port to TS_PORTED (per-game C-deletion doctrine). To
 * regenerate before that deletion:
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   make -C build/native clusters-trace
 *   ./build/native/auxiliary/clusters-trace \
 *     > src/native/games/clusters/__fixtures__/clusters-c-reference.json
 * (`-DUSE_TS_RANDOM=0` restores the C `random.c`, which the umbrella default
 * drops.) After deletion, recover the harness from git history.
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
