import { describe, expect, it } from "vitest";
import { randomNew } from "../../random/index.ts";
import {
  applyRules,
  findClues,
  findErrors,
  fullSolve,
  generateGrid,
} from "./solver.ts";
import { BLACK, EMPTY, idx, type RangeParams, WHITE } from "./state.ts";

const PRESETS: RangeParams[] = [
  { w: 9, h: 6 },
  { w: 12, h: 8 },
  { w: 13, h: 9 },
  { w: 16, h: 11 },
];

describe("deductive rules", () => {
  it("whitens the orthogonal neighbours of a black cell (adjacency)", () => {
    // 3x3, no clues, one black in the centre.
    const grid = Int8Array.from([
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      BLACK,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
    ]);
    applyRules(grid, 3, 3, findClues(grid, 3, 3));
    expect(grid[idx(0, 1, 3)]).toBe(WHITE);
    expect(grid[idx(1, 0, 3)]).toBe(WHITE);
    expect(grid[idx(1, 2, 3)]).toBe(WHITE);
    expect(grid[idx(2, 1, 3)]).toBe(WHITE);
    // The corners are not forced by adjacency alone.
    expect(grid[idx(0, 0, 3)]).toBe(EMPTY);
  });

  it("whitens cells a clue must still reach (not-too-big)", () => {
    // 1x3: clue 3 at the left end can only reach its count by making
    // both cells to the right white (the sole direction with room).
    const grid = Int8Array.from([3, EMPTY, EMPTY]);
    applyRules(grid, 3, 1, findClues(grid, 3, 1));
    expect(grid[idx(0, 1, 3)]).toBe(WHITE);
    expect(grid[idx(0, 2, 3)]).toBe(WHITE);
  });
});

describe("fullSolve", () => {
  it("returns null for a contradictory board", () => {
    // 1x2 with clue 3 — impossible (at most 2 cells visible).
    expect(fullSolve(Int8Array.from([3, EMPTY]), 2, 1)).toBeNull();
  });
});

describe("generator", () => {
  // Heavy but seed-deterministic: a single fixed-seed RNG drives a fixed number
  // of generate+full-solve iterations, so the work is identical every run —
  // however long it takes under load. A regression fails an assertion below.
  it("produces valid, uniquely no-recursion-solvable, symmetric boards", () => {
    const rng = randomNew("range-generator");
    for (const p of PRESETS) {
      const n = p.w * p.h;
      for (let iter = 0; iter < 4; iter++) {
        const grid = generateGrid(p, rng);

        // Clue presence is two-way rotationally symmetric.
        for (let i = 0; i < n; i++) {
          if (grid[i] > 0) expect(grid[n - 1 - i]).toBeGreaterThan(0);
        }

        // No-recursion solvable: deduction alone fills every blank cell.
        const dup = grid.slice();
        const emptyCount = grid.reduce((a, v) => a + (v === EMPTY ? 1 : 0), 0);
        const filled = applyRules(dup, p.w, p.h, findClues(dup, p.w, p.h));
        expect(filled).toBe(emptyCount);
        expect(findErrors(dup, p.w, p.h)).toBe(false);

        // At least one black square in the solution.
        expect(Array.from(dup).filter((v) => v === BLACK).length).toBeGreaterThan(0);

        // The full (recursive) solver agrees with the deductive solution.
        const sol = fullSolve(grid, p.w, p.h);
        expect(sol).not.toBeNull();
        expect(Array.from(sol as Int8Array)).toEqual(Array.from(dup));
      }
    }
  });
});
