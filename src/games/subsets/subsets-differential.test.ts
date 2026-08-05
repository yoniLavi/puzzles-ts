/**
 * Gated C-vs-TS differential for Subsets (design D6 of add-subsets-ts-port):
 * for each frozen fixture recorded from `puzzles/unreleased/subsets.c` via
 * `puzzles/auxiliary/subsets-trace.c`, the TS `newSubsetsDesc` over the
 * bit-identical RNG must reproduce the C desc byte-for-byte.
 *
 * Because generation gates every cell-blanking step on `subsetsSolveGame`
 * reaching a complete solution, one byte-match validates the generator (the
 * set-assignment shuffle, the arrow derivation, the blanking-order shuffle),
 * the six-rule solver's exact deductive strength, and the desc codec
 * together. The `extra` check also round-trips each C desc through
 * `validateDesc` + `newState` + `encodeDesc` (codec inverse property).
 *
 * **`add-subsets-difficulty-tiers` kept this oracle in full**, and needed no
 * `upstreamLooseGate` flag to do it. The new Tricky rung was added *above*
 * upstream's shipped strength rather than replacing it, so `DIFF_EASY` runs
 * upstream's exact rule set with upstream's exact RNG draw order — and tier 0
 * has no tier below to be graded against, so its acceptance rule is unchanged
 * too. These fixtures therefore still bind on the live default path, not
 * behind a test-only flag. See that change's `design.md` D3.
 */
import { expect } from "vitest";
import { describeDescDifferential } from "../../engine/testing/differential.ts";
import cReference from "./__fixtures__/subsets-c-reference.json" with { type: "json" };
import { newSubsetsDesc } from "./generator.ts";
import {
  DIFF_EASY,
  encodeDesc,
  newState,
  type SubsetsParams,
  validateDesc,
} from "./state.ts";

interface Fixture {
  seed: string;
  desc: string;
  w: number;
  h: number;
  n: number;
}
const data = cReference as { fixtures: Fixture[] };

describeDescDifferential<Fixture, SubsetsParams>({
  title: "subsets differential (frozen C reference)",
  fixtures: data.fixtures,
  label: (f) => `${f.w}x${f.h}n${f.n} seed=${f.seed}`,
  params: (f) => ({ w: f.w, h: f.h, n: f.n, diff: DIFF_EASY }),
  newDesc: newSubsetsDesc,
  extra: (f, p) => {
    expect(validateDesc(p, f.desc)).toBeNull();
    expect(encodeDesc(newState(p, f.desc))).toBe(f.desc);
  },
});
