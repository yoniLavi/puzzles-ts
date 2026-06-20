/**
 * Tests for the generic Latin-square solver/generator (`engine/latin.ts`).
 *
 * The solver's deductions (elim/set/forcing/recursion) are exercised
 * end-to-end and byte-for-byte against C by the Towers differential; here we
 * cover the generic framework directly against the `latin-solver` spec
 * scenarios: solving a uniquely-determined board, reporting ambiguity, and
 * respecting the difficulty ceiling. The generator is covered by the Singles
 * and Towers differentials (RNG-faithful byte-match).
 */
import { describe, expect, it } from "vitest";
import {
  DIFF_AMBIGUOUS,
  DIFF_UNFINISHED,
  latinGenerate,
  latinSolver,
  type LatinSolverConfig,
} from "./latin.ts";
import { randomNew } from "../random/index.ts";

/** A plain Latin-square config: no game-specific deductions or validator,
 * the generic layers keyed simple=0/set0=1/set1=2/forcing=3/recursive=4. */
function cfg(maxdiff: number): LatinSolverConfig<null> {
  return {
    maxdiff,
    diffSimple: 0,
    diffSet0: 1,
    diffSet1: 2,
    diffForcing: 3,
    diffRecursive: 4,
    usersolvers: [null, null, null, null, null],
    valid: null,
    ctx: null,
  };
}

function isLatin(grid: Uint8Array, o: number): boolean {
  for (let i = 0; i < o; i++) {
    const rowSeen = new Set<number>();
    const colSeen = new Set<number>();
    for (let j = 0; j < o; j++) {
      rowSeen.add(grid[i * o + j]);
      colSeen.add(grid[j * o + i]);
    }
    if (rowSeen.size !== o || colSeen.size !== o) return false;
    if (rowSeen.has(0) || colSeen.has(0)) return false;
  }
  return true;
}

describe("latin solver", () => {
  it("solves a uniquely-determined board and writes back a Latin square", () => {
    // A full Latin square with one cell blanked is uniquely completable.
    const o = 4;
    const full = latinGenerate(o, randomNew("latin-unique"));
    const grid = Uint8Array.from(full, (v) => v);
    grid[5] = 0; // blank one cell
    const ret = latinSolver(grid, o, cfg(4));
    expect(ret).not.toBe(DIFF_AMBIGUOUS);
    expect(ret).not.toBe(DIFF_UNFINISHED);
    expect(isLatin(grid, o)).toBe(true);
    for (let i = 0; i < o * o; i++) expect(grid[i]).toBe(full[i]);
  });

  it("reports ambiguity for an empty grid with recursion", () => {
    const grid = new Uint8Array(16); // empty 4×4 has many Latin completions
    expect(latinSolver(grid, 4, cfg(4))).toBe(DIFF_AMBIGUOUS);
  });

  it("respects the difficulty ceiling (no recursion → unfinished)", () => {
    const grid = new Uint8Array(16);
    // maxdiff = forcing (3) < recursive (4): deductions can't finish an empty
    // grid, and recursion is not permitted, so it reports unfinished.
    expect(latinSolver(grid, 4, cfg(3))).toBe(DIFF_UNFINISHED);
  });
});

describe("latin generator", () => {
  it("produces a valid Latin square", () => {
    const o = 6;
    const sq = latinGenerate(o, randomNew("latin-gen"));
    expect(isLatin(Uint8Array.from(sq, (v) => v), o)).toBe(true);
  });
});
