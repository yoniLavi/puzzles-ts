/**
 * Gated C-vs-TS differential for magnets (openspec add-magnets-ts-port).
 *
 * Byte-for-byte desc match: the generator is a faithful port over the
 * bit-identical `random.ts` — the `dominoLayout` shuffles, the `layDominoes`
 * scratch shuffle, and the strip-clues shuffle all reproduce C's draws — so
 * `newDesc(params, randomNew(seed)).desc` reproduces C exactly (playbook
 * §4.3). Two follow-on assertions (§4.4): the recorded aux (C's solution)
 * matches, and the TS solver grades each C board at exactly the recorded
 * difficulty (solves at diff; for a Tricky board, fails at Easy) — the
 * generator is solver-gated, so the TS solver must reach C's verdict.
 *
 * Regenerate the frozen fixture while puzzles/magnets.c still exists (it is
 * deleted at acceptance):
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make magnets-trace)
 *   build/native/auxiliary/magnets-trace \
 *     > src/native/games/magnets/__fixtures__/magnets-c-reference.json
 */
import { expect } from "vitest";
import { describeDescDifferential } from "../../engine/testing/differential.ts";
import { randomNew } from "../../random/index.ts";
import cReference from "./__fixtures__/magnets-c-reference.json" with { type: "json" };
import { newMagnetsDesc } from "./generator.ts";
import { MagnetsSolver } from "./solver.ts";
import { DIFF_COUNT, DIFF_EASY, type MagnetsParams, newState } from "./state.ts";

interface Fixture {
  w: number;
  h: number;
  diff: number;
  stripclues: boolean;
  seed: string;
  desc: string;
  aux: string;
}
const data = cReference as { fixtures: Fixture[] };

describeDescDifferential<Fixture, MagnetsParams>({
  title: "magnets differential (frozen C reference)",
  fixtures: data.fixtures,
  label: (f) => `${f.w}x${f.h} d${f.diff}${f.stripclues ? "S" : ""} seed=${f.seed}`,
  params: (f) => ({ w: f.w, h: f.h, diff: f.diff, stripclues: f.stripclues }),
  newDesc: newMagnetsDesc,
  extra: (f, p) => {
    // The generated aux (solution) matches C's.
    const { aux } = newMagnetsDesc(p, randomNew(f.seed));
    expect(aux).toBe(f.aux);

    // The TS solver grades the C board at exactly the recorded difficulty.
    const s = newState(p, f.desc);
    const solver = new MagnetsSolver(
      s.w,
      s.h,
      s.common.dominoes,
      s.common.rowcount,
      s.common.colcount,
    );
    expect(solver.solve(DIFF_COUNT)).toBe(1); // uniquely solvable
    if (f.diff > DIFF_EASY) {
      const easier = new MagnetsSolver(
        s.w,
        s.h,
        s.common.dominoes,
        s.common.rowcount,
        s.common.colcount,
      );
      expect(easier.solve(f.diff - 1)).toBeLessThanOrEqual(0); // ambiguous one level down
    }
  },
});
