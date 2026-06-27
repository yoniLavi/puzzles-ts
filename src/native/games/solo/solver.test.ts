/**
 * Behavioural tests for the Solo solver (tier 1). These validate the core
 * deduction engine on hand-built standard-variant boards; the jigsaw / X /
 * killer paths and exact C-difficulty agreement are covered by the generator
 * tests + the byte-match differential once those land.
 */
import { describe, expect, it } from "vitest";
import { runSolver, solveSolo } from "./solver.ts";
import {
  DIFF_AMBIGUOUS,
  DIFF_BLOCK,
  DIFF_IMPOSSIBLE,
  DIFF_KINTERSECT,
  DIFF_RECURSIVE,
  DIFF_SIMPLE,
  defaultParams,
  encodeBlockStructureDesc,
  encodeGrid,
  newState,
  rectangularBlocks,
} from "./state.ts";

/** Build a standard 3×3 SoloState from an 81-cell givens array (0 = blank). */
function stateFromGivens(givens: number[]) {
  const desc = encodeGrid(givens, 81);
  return newState(defaultParams(), desc);
}

// prettier-ignore
const PUZZLE = [
  5,3,0, 0,7,0, 0,0,0,
  6,0,0, 1,9,5, 0,0,0,
  0,9,8, 0,0,0, 0,6,0,
  8,0,0, 0,6,0, 0,0,3,
  4,0,0, 8,0,3, 0,0,1,
  7,0,0, 0,2,0, 0,0,6,
  0,6,0, 0,0,0, 2,8,0,
  0,0,0, 4,1,9, 0,0,5,
  0,0,0, 0,8,0, 0,7,9,
];

// prettier-ignore
const SOLUTION = [
  5,3,4, 6,7,8, 9,1,2,
  6,7,2, 1,9,5, 3,4,8,
  1,9,8, 3,4,2, 5,6,7,
  8,5,9, 7,6,1, 4,2,3,
  4,2,6, 8,5,3, 7,9,1,
  7,1,3, 9,2,4, 8,5,6,
  9,6,1, 5,3,7, 2,8,4,
  2,8,7, 4,1,9, 6,3,5,
  3,4,5, 2,8,6, 1,7,9,
];

describe("solo solver — standard 3×3", () => {
  it("solves a unique puzzle to the correct full grid", () => {
    const s = stateFromGivens(PUZZLE);
    const { diff, grid } = solveSolo(s);
    expect(diff).toBeLessThan(DIFF_AMBIGUOUS); // a real difficulty, not ambiguous/impossible
    expect([...grid]).toEqual(SOLUTION);
  });

  it("grades the puzzle at Trivial (yields to blockwise scanning alone)", () => {
    const s = stateFromGivens(PUZZLE);
    // This classic example is solvable by repeated blockwise positional
    // elimination (the "scanning" technique), which the driver exhausts before
    // ever reaching row/col elimination — so it grades at DIFF_BLOCK.
    const { diff } = solveSolo(s, DIFF_SIMPLE, 0);
    expect(diff).toBe(DIFF_BLOCK);
  });

  it("reports AMBIGUOUS for an under-constrained grid (exercises recursion)", () => {
    const sparse = new Array(81).fill(0);
    sparse[0] = 1; // a single given leaves many solutions
    const s = stateFromGivens(sparse);
    const { diff } = solveSolo(s);
    expect(diff).toBe(DIFF_AMBIGUOUS);
  });

  it("reports IMPOSSIBLE for a contradictory givens grid", () => {
    const bad = [...PUZZLE];
    bad[1] = 5; // two 5s in row 0 (cells 0 and 1)
    const s = stateFromGivens(bad);
    const { diff } = solveSolo(s);
    expect(diff).toBe(DIFF_IMPOSSIBLE);
  });

});

describe("solo solver — variant paths (codec → solve round-trips)", () => {
  // These reuse the standard solution but route it through the killer and
  // jigsaw code paths (cages / jigsaw-blocks shaped as the 3×3 rectangles, so
  // the known SOLUTION stays valid). They confirm the variant deductions run
  // end-to-end and stay consistent; exact C-difficulty agreement across
  // genuinely irregular boards is the differential's job (design D5).

  it("solves a killer board (cages = blocks, sums = 45) to the solution", () => {
    const gridDesc = encodeGrid(PUZZLE, 81);
    const cages = rectangularBlocks(3, 3);
    const blockDesc = encodeBlockStructureDesc(9, cages);
    const kgrid = new Array(81).fill(0);
    for (const cell of cages.blocks) kgrid[cell[0]] = 45; // 1+…+9 per block
    const desc = `${gridDesc},${blockDesc},${encodeGrid(kgrid, 81)}`;
    const s = newState({ ...defaultParams(), killer: true, kdiff: DIFF_KINTERSECT }, desc);
    const { diff, grid } = solveSolo(s, DIFF_RECURSIVE, DIFF_KINTERSECT);
    expect(diff).toBeLessThan(DIFF_AMBIGUOUS);
    expect([...grid]).toEqual(SOLUTION);
  });

  it("solves a jigsaw board (blocks = the 3×3 rectangles) to the solution", () => {
    const gridDesc = encodeGrid(PUZZLE, 81);
    const blockDesc = encodeBlockStructureDesc(9, rectangularBlocks(3, 3));
    const desc = `${gridDesc},${blockDesc}`;
    const s = newState({ ...defaultParams(), c: 9, r: 1 }, desc);
    const { diff, grid } = solveSolo(s);
    expect(diff).toBeLessThan(DIFF_AMBIGUOUS);
    expect([...grid]).toEqual(SOLUTION);
  });
});

describe("solo solver — low level", () => {
  it("runSolver mutates the grid in place to the solution", () => {
    const grid = Int8Array.from(PUZZLE);
    const dlev = { maxdiff: DIFF_RECURSIVE, maxkdiff: 0, diff: DIFF_IMPOSSIBLE, kdiff: 0 };
    runSolver(9, rectangularBlocks(3, 3), null, false, grid, null, dlev);
    expect(dlev.diff).toBeLessThan(DIFF_AMBIGUOUS);
    expect([...grid]).toEqual(SOLUTION);
  });
});
