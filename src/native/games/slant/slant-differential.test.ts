/**
 * Gated C-vs-TS differential for the Slant port. Reads the committed
 * fixture recorded from upstream slant.c (puzzles/auxiliary/slant-trace.c)
 * and asserts:
 *
 *  1. TS `newDesc` over the same seed reproduces the C desc **byte-for-byte**
 *     — the generator is a faithful port, the clue-removal loop is decided
 *     by identical solver verdicts, and the RNG is bit-identical.
 *  2. The same call reproduces the C aux solution byte-for-byte (the
 *     filled-grid generator path, checked directly).
 *  3. The TS solver solves the C-generated board uniquely at the recorded
 *     difficulty, and a Hard board is NOT solvable one level down.
 *
 * Regenerate the fixture (while slant.c still exists) with:
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make slant-trace)
 *   build/native/auxiliary/slant-trace > <this dir>/__fixtures__/slant-c-reference.json
 */
import { describe, expect, it } from "vitest";
import { describeDescDifferential } from "../../engine/testing/differential.ts";
import { randomNew } from "../../random/index.ts";
import cReference from "./__fixtures__/slant-c-reference.json" with { type: "json" };
import { newDesc } from "./generator.ts";
import {
  SOLVE_NOT_CONVERGED,
  SOLVE_UNIQUE,
  SolverScratch,
  slantSolve,
} from "./solver.ts";
import { DIFF_HARD, decodeClues, type SlantParams, validateDesc } from "./state.ts";

interface Fixture {
  w: number;
  h: number;
  diff: number;
  seed: string;
  desc: string;
  aux: string;
}

const data = cReference as { fixtures: Fixture[] };

const params = (f: Fixture): SlantParams => ({ w: f.w, h: f.h, diff: f.diff });
const label = (f: Fixture) => `${f.w}x${f.h}/d${f.diff} seed=${f.seed}`;

// 1. Byte-for-byte desc match — the shared faithful-generator bar (plus the
// desc validating, for free).
describeDescDifferential<Fixture, SlantParams>({
  title: "Slant C-vs-TS differential — desc byte-match (gated)",
  fixtures: data.fixtures,
  label,
  params,
  newDesc,
  extra: (f, p) => {
    expect(validateDesc(p, f.desc)).toBeNull();
  },
});

// 2 + 3. Aux byte-match and solver agreement — game-specific, inline.
describe("Slant C-vs-TS differential — aux + solver agreement (gated)", () => {
  for (const f of data.fixtures) {
    const p = params(f);
    it(`${label(f)}: TS aux matches C and the solver agrees`, () => {
      const { aux } = newDesc(p, randomNew(f.seed));
      expect(aux).toBe(f.aux);

      const clues = decodeClues(p, f.desc);
      const soln = new Int8Array(f.w * f.h);
      const sc = new SolverScratch(f.w, f.h);
      expect(slantSolve(f.w, f.h, clues, soln, sc, f.diff)).toBe(SOLVE_UNIQUE);
      // The unique solution is the generator's grid.
      let got = "";
      for (let i = 0; i < f.w * f.h; i++) got += soln[i] < 0 ? "\\" : "/";
      expect(got).toBe(f.aux);
      // A Hard board must genuinely need Hard techniques.
      if (f.diff === DIFF_HARD) {
        expect(slantSolve(f.w, f.h, clues, soln, sc, f.diff - 1)).toBe(
          SOLVE_NOT_CONVERGED,
        );
      }
    });
  }
});
