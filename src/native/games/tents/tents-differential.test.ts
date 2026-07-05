/**
 * Gated C-vs-TS differential for tents (openspec add-tents-ts-port).
 *
 * Byte-for-byte desc match: the generator is a faithful port over the
 * bit-identical `random.ts`, including the bipartite matching's internal RNG
 * draws, so `newDesc(params, randomNew(seed)).desc` reproduces C exactly
 * (playbook §4.3). A follow-on assertion re-solves each C board with the TS
 * solver and asserts it grades at exactly the C-recorded difficulty — the
 * generator is solver-gated, so the TS solver must reach C's verdict on every
 * board (§4.4).
 *
 * Regenerate the frozen fixture while puzzles/tents.c still exists (it is
 * deleted at acceptance):
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make tents-trace)
 *   build/native/auxiliary/tents-trace \
 *     > src/native/games/tents/__fixtures__/tents-c-reference.json
 */
import { expect } from "vitest";
import { describeDescDifferential } from "../../engine/testing/differential.ts";
import cReference from "./__fixtures__/tents-c-reference.json" with { type: "json" };
import { newTentsDesc } from "./generator.ts";
import { tentsSolve } from "./solver.ts";
import { decodeDesc, type TentsParams, TREE } from "./state.ts";

interface Fixture {
  seed: string;
  desc: string;
  aux: string;
  w: number;
  h: number;
  diff: number;
}
const data = cReference as { fixtures: Fixture[] };

describeDescDifferential<Fixture, TentsParams>({
  title: "tents differential (frozen C reference)",
  fixtures: data.fixtures,
  label: (f) => `${f.w}x${f.h} d${f.diff} seed=${f.seed}`,
  params: (f) => ({ w: f.w, h: f.h, diff: f.diff }),
  newDesc: newTentsDesc,
  // Solver-agreement: the TS solver grades each C board at exactly its
  // difficulty — solves at diff, fails (ambiguous) one level below.
  extra: (f, p) => {
    const { grid, numbers } = decodeDesc(p, f.desc);
    const puzzle = Int8Array.from(grid, (v) => (v === TREE ? TREE : 0));
    expect(tentsSolve(p.w, p.h, puzzle, numbers, p.diff).ret).toBe(1);
    expect(tentsSolve(p.w, p.h, puzzle, numbers, p.diff - 1).ret).toBe(2);
  },
});
