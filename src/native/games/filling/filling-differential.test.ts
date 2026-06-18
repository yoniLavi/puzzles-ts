/**
 * Gated C-vs-TS differential for Filling (Fillomino).
 *
 * Filling earns a differential: it runs a real uniqueness-driven generator
 * (a shuffled DSF region partition + solver-gated clue minimisation) over the
 * bit-identical `random.ts`, so a faithful port reproduces the C desc exactly
 * for the same seed. Two assertions per fixture:
 *   1. byte-for-byte desc match (the generator + RNG are faithful);
 *   2. the TS solver uniquely solves the C-recorded board to a valid full
 *      Fillomino solution (every region's size equals its number).
 *
 * Regenerate the fixture while puzzles/filling.c still exists:
 *   cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
 *   (cd build/native && make filling-trace)
 *   build/native/auxiliary/filling-trace \
 *     > src/native/games/filling/__fixtures__/filling-c-reference.json
 */
import { expect } from "vitest";
import { describeDescDifferential } from "../../engine/testing/differential.ts";
import cReference from "./__fixtures__/filling-c-reference.json" with { type: "json" };
import { newFillingDesc } from "./generator.ts";
import { solveFilling } from "./solver.ts";
import { type FillingParams, makeRegionDsf, newState } from "./state.ts";

interface Fixture {
  w: number;
  h: number;
  seed: string;
  desc: string;
}
const data = cReference as { version: number; fixtures: Fixture[] };

describeDescDifferential<Fixture, FillingParams>({
  title: "filling differential (frozen C reference)",
  fixtures: data.fixtures,
  label: (f) => `${f.w}x${f.h} seed=${f.seed}`,
  params: (f) => ({ w: f.w, h: f.h }),
  newDesc: newFillingDesc,
  extra: (f, p) => {
    // The TS solver uniquely solves the C board to a valid full solution.
    const st = newState(p, f.desc);
    const { solved, board } = solveFilling(st.clues, p.w, p.h);
    expect(solved).toBe(true);
    const dsf = makeRegionDsf(board, p.w, p.h);
    for (let i = 0; i < p.w * p.h; i++) {
      expect(board[i]).toBe(dsf.size(i));
    }
  },
});
