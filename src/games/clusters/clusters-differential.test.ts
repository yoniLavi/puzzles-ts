/**
 * Clusters — gated differential against a frozen snapshot of C-generated
 * reference boards (`__fixtures__/clusters-c-reference.json`).
 *
 * Clusters' generator is solver-gated (it accepts only a board its
 * contradiction solver can uniquely complete) and its codec is an exact
 * inverse, so the strongest meaningful bar is that the TS `newDesc` reproduces
 * the C engine's desc byte-for-byte for the same seed — which validates the
 * generator, the solver AND the run-length codec all at once
 * (docs/games/testing.md § "Byte-match: fidelity where there is a right answer").
 *
 * **`upstreamLooseGate` is set here and nowhere else.** The shipped generator
 * grades its two tiers honestly — Tricky rejects a board the single-cell rule
 * alone can finish — and because generation is solver-gated, that changes every
 * Tricky description. The flag keeps upstream's one-gate acceptance reachable
 * from this file alone, so these fixtures still byte-match the C; see
 * `ClustersGenerateOptions.upstreamLooseGate` for what it therefore stops
 * covering.
 *
 * The fixture is **frozen and cannot be regenerated**: it was captured by
 * `puzzles/auxiliary/clusters-trace.c` against upstream's C, and that harness
 * is gone — see `engine/testing/differential.ts`.
 */
import { expect } from "vitest";
import { describeDescDifferential } from "../../engine/testing/differential.ts";
import cReference from "./__fixtures__/clusters-c-reference.json" with { type: "json" };
import { newClustersDesc } from "./generator.ts";
import { type ClustersParams, DIFF_TRICKY, validateDesc } from "./state.ts";

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
  // The tier is immaterial under the loose gate, which solves at the deeper rung
  // whatever was asked for, but the params must carry one, and Tricky is what
  // the recorded boards are: upstream's only bar is "solvable with one
  // hypothetical".
  params: (f) => ({ w: f.w, h: f.h, diff: DIFF_TRICKY }),
  newDesc: (p, rng) => newClustersDesc(p, rng, { upstreamLooseGate: true }),
  extra: (f, p) => {
    // The desc the generator emits must also pass validation.
    expect(validateDesc(p, f.desc)).toBeNull();
  },
});
