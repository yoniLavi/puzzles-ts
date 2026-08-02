/**
 * Gated C-vs-TS differential for Light Up: the TS generator, run over the
 * bit-identical RNG, must reproduce the C reference desc byte-for-byte
 * for every frozen (params, seed) fixture — the generator is solver-gated
 * (clue acceptance and stripping are decided by solver verdicts), so this
 * also pins the solver's exact deductive power at every difficulty.
 *
 * The fixture is **frozen and cannot be regenerated**. It was captured by
 * `puzzles/auxiliary/lightup-trace.c` against upstream's C, under an
 * Emscripten/CMake build that `retire-c-engine` deleted along with the
 * sources and the harness — see `engine/testing/differential.ts`.
 *
 * Generation at Tricky/Hard runs the discount-set/recursive solver in a
 * retry loop — legitimately seconds of fixed work per fixture. The work is
 * seed-deterministic, so the verdict never depends on load and the block is not
 * clock-gated (playbook §5.2).
 */
import { expect } from "vitest";
import { describeDescDifferential } from "../../engine/testing/differential.ts";
import cReference from "./__fixtures__/lightup-c-reference.json" with { type: "json" };
import { newLightupDesc } from "./generator.ts";
import type { LightupParams } from "./state.ts";
import { validateDesc } from "./state.ts";

interface Fixture {
  seed: string;
  desc: string;
  w: number;
  h: number;
  blackpc: number;
  symm: number;
  difficulty: number;
}
const data = cReference as { fixtures: Fixture[] };

describeDescDifferential<Fixture, LightupParams>({
  title: "lightup differential (frozen C reference)",
  fixtures: data.fixtures,
  label: (f) => `${f.w}x${f.h}b${f.blackpc}s${f.symm}d${f.difficulty} seed=${f.seed}`,
  params: (f) => ({
    w: f.w,
    h: f.h,
    blackpc: f.blackpc,
    symm: f.symm,
    difficulty: f.difficulty,
  }),
  newDesc: newLightupDesc,
  extra: (f, p) => {
    expect(validateDesc(p, f.desc)).toBeNull();
  },
});
