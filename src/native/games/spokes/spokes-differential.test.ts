/**
 * Gated C-vs-TS differential for Spokes: the TS generator must reproduce the C
 * description **byte-for-byte** for the same seed.
 *
 * This is the strongest bar available, and here it validates three layers at
 * once. Spokes' generator strips a randomised list of lines and keeps each
 * removal only while the tiered solver still deduces a unique solution, so the
 * published clue digits are decided by the solver's verdict on every
 * intermediate board — the desc cannot match unless the generator's draw
 * order, every deduction rung (including the bounded contradiction look-ahead
 * and its exact recursion tiers) and the flat digit codec all agree with the C.
 *
 * The fixture was recorded from `puzzles/auxiliary/spokes-trace.c` while
 * `puzzles/unreleased/spokes.c` still existed; see that harness's header for
 * the regeneration commands.
 */

import { describeDescDifferential } from "../../engine/testing/differential.ts";
import cReference from "./__fixtures__/spokes-c-reference.json" with { type: "json" };
import { newSpokesDesc } from "./generator.ts";
import { diffFromLevel, type SpokesParams, validateDesc } from "./state.ts";

interface Fixture {
  w: number;
  h: number;
  diff: number;
  seed: string;
  desc: string;
}

const data = cReference as { fixtures: Fixture[] };

describeDescDifferential<Fixture, SpokesParams>({
  title: "spokes differential (frozen C reference)",
  fixtures: data.fixtures,
  label: (f) => `${f.w}x${f.h} ${diffFromLevel(f.diff)} seed=${f.seed}`,
  params: (f) => ({ w: f.w, h: f.h, diff: diffFromLevel(f.diff) }),
  newDesc: newSpokesDesc,
  extra: (f, p) => {
    if (validateDesc(p, f.desc) !== null) {
      throw new Error(`validateDesc rejected the C desc ${f.desc}`);
    }
  },
});
