/**
 * Gated byte-match differential for the Tracks generator + solver.
 *
 * For each C-recorded fixture: (1) the TS `newDesc` over the same seed
 * reproduces the C desc byte-for-byte (a faithful solver-gated generator over
 * the bit-identical `random.ts`), and (2) the TS solver grades the C board at
 * the recorded difficulty and one rung below fails to solve it.
 */
import { describe, expect, it } from "vitest";
import { randomNew } from "../../random/index.ts";
import fixtures from "./__fixtures__/tracks-c-reference.json" with { type: "json" };
import { newDesc } from "./generator.ts";
import { tracksSolve } from "./solver.ts";
import { decodeDesc, type TracksParams } from "./state.ts";

interface Fixture {
  w: number;
  h: number;
  diff: number;
  single_ones: number;
  seed: string;
  desc: string;
  solveRet: number;
  gradeDiff: number;
}

const paramsOf = (f: Fixture): TracksParams => ({
  w: f.w,
  h: f.h,
  diff: f.diff,
  singleOnes: f.single_ones !== 0,
});

describe("tracks generator differential (byte-match vs C)", () => {
  for (const f of fixtures.fixtures as Fixture[]) {
    it(`${f.seed} (${f.w}x${f.h} diff=${f.diff}): TS desc matches C byte-for-byte`, () => {
      const { desc } = newDesc(paramsOf(f), randomNew(f.seed));
      expect(desc).toBe(f.desc);
    });

    it(`${f.seed}: TS solver grades the C board at difficulty ${f.gradeDiff}`, () => {
      const board = decodeDesc(paramsOf(f), f.desc);
      const graded = tracksSolve(board, 3 /* DIFF_COUNT */);
      expect(graded.ret).toBe(f.solveRet);
      expect(graded.maxDiff).toBe(f.gradeDiff);
      if (f.gradeDiff > 0) {
        const easier = tracksSolve(decodeDesc(paramsOf(f), f.desc), f.gradeDiff - 1);
        expect(easier.ret).toBeLessThan(1); // one rung below cannot finish
      }
    });
  }
});
