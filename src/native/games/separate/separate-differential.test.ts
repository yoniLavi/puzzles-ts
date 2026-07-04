/**
 * Gated C-vs-TS differential for Separate.
 *
 * Separate's generator is a faithful port over the bit-identical `random.ts`, so
 * `newDesc` reproduces the C desc byte-for-byte for a given seed (playbook §4.3).
 * The generator is *solver-gated* (§4.4): it keeps a board only when the ported
 * solver fully solves it, so byte-match also demands the TS solver reach C's
 * exact verdict. The follow-on assertion re-solves each C board to confirm it.
 *
 * Regenerate the frozen fixture while `puzzles/unfinished/separate.c` still
 * exists (deleted at acceptance):
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make separate-trace)
 *   build/native/auxiliary/separate-trace \
 *     > src/native/games/separate/__fixtures__/separate-c-reference.json
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
