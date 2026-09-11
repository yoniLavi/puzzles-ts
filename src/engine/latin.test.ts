/**
 * Tests for the generic Latin-square solver/generator (`engine/latin.ts`).
 *
 * `latin.ts` is the largest module in the engine and the Latin family sits on
 * it. Tested only end to end through `latinSolver`, a defect planted in one of
 * its deductions surfaces in the Towers and Singles differentials, but only
 * after a generate-and-compare run, and as a differing description string
 * rather than as the deduction that broke.
 *
 * So the blocks below assert each deduction **directly**, in the vocabulary of
 * the technique it implements: `elim` places on a last remaining candidate and
 * reports a contradiction on none, `set` refuses three cells sharing two
 * digits, `forcing` follows a chain of two-candidate cells to an elimination.
 * That is the same reasoning a hint narrates, which is why the tests read as
 * sentences about Latin squares rather than as pokes at an array.
 *
 * ## What deliberately stays with the differentials, checked rather than assumed
 *
 * The **RNG draw order** through `matching` — the `shuffle(Lorder)` per BFS
 * pass and the in-place adjacency swap during the DFS — decides *which boards
 * exist*, not whether the matching is correct. A matching's cardinality is
 * order-independent, so every assertion below is blind to it by construction,
 * and that is the right division of labor rather than a gap in it.
 *
 * `repo-layout` requires that split to be verified, not stated, so it was:
 * disabling the DFS adjacency swap (`if (rs && adjsizes[L] - j > 1)` → `false`)
 * leaves **all 21 tests in this file green** and fails **34 assertions** across
 * `towers-differential.test.ts` and `singles-differential.test.ts`. Do not add a
 * test here that pins a particular matching; it would break on any deliberate
 * generator change while proving nothing the differentials do not already.
 */
import { describe, expect, it } from "vitest";
import {
  DIFF_AMBIGUOUS,
  DIFF_IMPOSSIBLE,
  DIFF_UNFINISHED,
  LatinSolver,
  type LatinSolverConfig,
  latinGenerate,
  latinGenerateRect,
  latinSolver,
  matching,
} from "./latin.ts";
import { randomNew, randomUpto } from "./random/index.ts";

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

/**
 * The deductions, each against the rule it implements. A fresh solver over an
 * all-blank grid starts with every digit possible everywhere, so a test states
 * its situation by ruling candidates *out* — which is what the deductions
 * themselves manipulate.
 */
describe("latin deductions", () => {
  /** A solver on a blank `o × o` board: every digit possible in every cell. */
  function blank(o: number): LatinSolver {
    const s = new LatinSolver(o);
    expect(s.alloc(new Uint8Array(o * o))).toBe(true);
    return s;
  }

  /** Restrict `(x, y)` to exactly `digits`. */
  function only(s: LatinSolver, x: number, y: number, digits: number[]): void {
    for (let n = 1; n <= s.o; n++) {
      if (!digits.includes(n)) s.cube[s.cubepos(x, y, n)] = 0;
    }
  }

  it("placing a digit rules it out of the rest of its row and column", () => {
    // The whole of `place`'s job, and the one deduction every other rests on.
    // Row *and* column: they are two separate loops, so a test that checked
    // only one would let the other be deleted.
    const s = blank(4);
    s.place(1, 2, 3);

    expect(s.grid[2 * 4 + 1]).toBe(3);
    for (let n = 1; n <= 4; n++) expect(s.cubeGet(1, 2, n)).toBe(n === 3);
    for (let y = 0; y < 4; y++) if (y !== 2) expect(s.cubeGet(1, y, 3)).toBe(false);
    for (let x = 0; x < 4; x++) if (x !== 1) expect(s.cubeGet(x, 2, 3)).toBe(false);

    // ...and nothing beyond that cross was touched: a cell sharing neither
    // line keeps every digit, including the one just placed elsewhere.
    for (let n = 1; n <= 4; n++) expect(s.cubeGet(0, 0, n)).toBe(true);
  });

  it("elim places only on the *last* remaining candidate", () => {
    // The line between deduction and guessing. `elim` sweeps the o positions
    // digit `n` could take in row `y`; two survivors means the row is not
    // decided yet, and placing one would be a guess dressed as a deduction.
    const s = blank(4);
    const row0 = (n: number) => s.elim(s.cubepos(0, 0, n), 4 * 4);

    s.cube[s.cubepos(2, 0, 1)] = 0;
    s.cube[s.cubepos(3, 0, 1)] = 0;
    expect(row0(1)).toBe(0); // two positions left for digit 1 — no progress
    expect(s.grid[0]).toBe(0);

    s.cube[s.cubepos(1, 0, 1)] = 0;
    expect(row0(1)).toBe(1); // one left — placed
    expect(s.grid[0]).toBe(1);
  });

  it("elim reports a contradiction when a digit has nowhere left to go", () => {
    // The negative half of the same sweep, and the one that decides whether an
    // unsolvable board is *reported* unsolvable or silently graded.
    const s = blank(4);
    for (let x = 0; x < 4; x++) s.cube[s.cubepos(x, 0, 1)] = 0;
    expect(s.elim(s.cubepos(0, 0, 1), 4 * 4)).toBe(-1);
  });

  it("set elimination rejects three cells that share only two digits", () => {
    // Naked subsets, in the direction that proves impossibility: three cells
    // in a row restricted to {1,2} cannot all be filled, so `set` must report
    // a contradiction rather than eliminate something and carry on.
    const s = blank(4);
    for (const x of [0, 1, 2]) only(s, x, 0, [1, 2]);
    only(s, 3, 0, [3, 4]);
    expect(s.set(s.cubepos(0, 0, 1), 4 * 4, 1)).toBe(-1);
  });

  it("forcing chains follow two-candidate cells to an elimination", () => {
    // The technique in full: assume 1 at (0,0); it forces 2 at (1,0), which
    // forces 3 at (2,0), which forces 1 back into the same row — so 1 is
    // impossible at (3,0) whichever way the chain is entered. Cells with a
    // different number of candidates are not chain links, which is why the
    // "exactly two" test is the rule and not a tuning constant.
    const s = blank(4);
    only(s, 0, 0, [1, 2]);
    only(s, 1, 0, [2, 3]);
    only(s, 2, 0, [1, 3]);
    expect(s.cubeGet(3, 0, 1)).toBe(true);

    expect(s.forcing()).toBe(1);
    expect(s.cubeGet(3, 0, 1)).toBe(false);
  });
});

describe("latin solver configuration", () => {
  /** A 2×2 board is the smallest with more than one Latin completion: the two
   * squares [[1,2],[2,1]] and [[2,1],[1,2]]. Small enough to write answers out. */
  const blank2 = () => new Uint8Array(4);

  it("applies the seed hook to the cube before any deduction runs", () => {
    // Salad's ball/cross clues constrain a cell without placing a digit, so
    // they cannot travel in the seeded grid. Ruling digit 1 out of (0,0) picks
    // one of the two 2×2 squares, which nothing else in the config can do.
    expect(latinSolver(blank2(), 2, cfg(4))).toBe(DIFF_AMBIGUOUS);

    const grid = blank2();
    const ret = latinSolver(grid, 2, {
      ...cfg(4),
      seed: (s) => {
        s.cube[s.cubepos(0, 0, 1)] = 0;
      },
    });
    expect(ret).not.toBe(DIFF_AMBIGUOUS);
    expect([...grid]).toEqual([2, 1, 1, 2]);
  });

  it("re-runs the game's validator on a completed grid, and reports failure", () => {
    // A game's extra constraints (Keen's arithmetic, Unequal's inequalities)
    // are not expressible in the cube, so a grid that is a perfect Latin
    // square can still be no solution at all.
    const full = latinGenerate(4, randomNew("valid"));
    const seeded = () => {
      const g = Uint8Array.from(full, (v) => v);
      g[5] = 0;
      return g;
    };
    expect(latinSolver(seeded(), 4, { ...cfg(4), valid: () => true })).not.toBe(
      DIFF_IMPOSSIBLE,
    );
    expect(latinSolver(seeded(), 4, { ...cfg(4), valid: () => false })).toBe(
      DIFF_IMPOSSIBLE,
    );
  });

  it("writes the final candidate cube to cubeOut, on the solved and rejected paths alike", () => {
    // Unequal's generator grades a clue by how many possibilities remain, so
    // it reads the cube rather than the grid. Both exits must fill it — the
    // early one especially, since a caller reading a stale buffer there would
    // grade against the *previous* board.
    const full = latinGenerate(4, randomNew("cubeout"));
    const grid = Uint8Array.from(full, (v) => v);
    grid[5] = 0;
    const out = new Uint8Array(4 * 4 * 4).fill(9);
    expect(latinSolver(grid, 4, { ...cfg(4), cubeOut: out })).not.toBe(DIFF_AMBIGUOUS);
    // Solved ⇒ exactly one surviving candidate per cell, and it is the answer.
    for (let x = 0; x < 4; x++) {
      for (let y = 0; y < 4; y++) {
        const live = [1, 2, 3, 4].filter((n) => out[(x * 4 + y) * 4 + n - 1] !== 0);
        expect(live).toEqual([grid[y * 4 + x]]);
      }
    }

    // The `alloc` rejection path: contradictory givens, so no deduction ever
    // runs, and the buffer must still be the (empty) cube rather than untouched.
    const clash = new Uint8Array(16);
    clash[0] = 1;
    clash[1] = 1; // digit 1 twice in row 0
    const out2 = new Uint8Array(4 * 4 * 4).fill(9);
    expect(latinSolver(clash, 4, { ...cfg(4), cubeOut: out2 })).toBe(DIFF_IMPOSSIBLE);
    expect(out2.some((v) => v === 9)).toBe(false);
  });

  it("reports contradictory givens as impossible without deducing", () => {
    const clash = new Uint8Array(16);
    clash[0] = 2;
    clash[4] = 2; // digit 2 twice in column 0
    expect(latinSolver(clash, 4, cfg(4))).toBe(DIFF_IMPOSSIBLE);
  });
});

describe("latin generator", () => {
  it("produces a valid Latin square", () => {
    const o = 6;
    const sq = latinGenerate(o, randomNew("latin-gen"));
    expect(
      isLatin(
        Uint8Array.from(sq, (v) => v),
        o,
      ),
    ).toBe(true);
  });

  it.each([
    [6, 3],
    [3, 6],
    [5, 5],
    [7, 2],
  ])("crops a %ix%i rectangle from the max(w,h) square", (w, h) => {
    // The square is `max(w, h)` on a side and the rectangle is a corner of it,
    // so every row holds w distinct values from 1..max and every column h. Get
    // the square's size wrong and the crop reads past its end, which shows up
    // as zeroes rather than as an exception.
    const o = Math.max(w, h);
    const rect = latinGenerateRect(w, h, randomNew(`rect-${w}x${h}`));
    expect(rect.length).toBe(w * h);
    for (const v of rect) expect(v).toBeGreaterThanOrEqual(1);
    for (const v of rect) expect(v).toBeLessThanOrEqual(o);
    for (let y = 0; y < h; y++) {
      const row = new Set<number>();
      for (let x = 0; x < w; x++) row.add(rect[y * w + x]);
      expect(row.size).toBe(w);
    }
    for (let x = 0; x < w; x++) {
      const col = new Set<number>();
      for (let y = 0; y < h; y++) col.add(rect[y * w + x]);
      expect(col.size).toBe(h);
    }
  });
});

/**
 * `matching` is the bipartite matcher `latinGenerate` builds each row with, and
 * it is exported and used directly (Tents' completion check runs it with no
 * `rs`). Its *cardinality* is the guarantee; the particular matching chosen is
 * the RNG's business and stays with the differentials.
 */
describe("matching", () => {
  /** Maximum matching by brute force over all L→R injections. */
  function bruteForce(nl: number, adj: number[][]): number {
    let best = 0;
    const used = new Set<number>();
    const walk = (L: number, size: number) => {
      if (L === nl) {
        best = Math.max(best, size);
        return;
      }
      walk(L + 1, size); // leave L unmatched
      for (const R of adj[L]) {
        if (used.has(R)) continue;
        used.add(R);
        walk(L + 1, size + 1);
        used.delete(R);
      }
    };
    walk(0, 0);
    return best;
  }

  const cardinality = (m: Int32Array) => [...m].filter((r) => r !== -1).length;

  it("returns a valid assignment: within the adjacency, and injective", () => {
    const adj = [[0, 1], [1, 2], [0, 2], [2]];
    const m = matching(
      4,
      3,
      adj.map((a) => [...a]),
      adj.map((a) => a.length),
    );
    const seen = new Set<number>();
    for (let L = 0; L < 4; L++) {
      if (m[L] === -1) continue;
      expect(adj[L]).toContain(m[L]);
      expect(seen.has(m[L])).toBe(false);
      seen.add(m[L]);
    }
  });

  it("finds a maximum matching, checked against brute force", () => {
    // Random bipartite graphs, small enough to enumerate exhaustively. This is
    // the property Tents' completion check depends on: "is there a perfect
    // matching?" is only answerable if the cardinality is genuinely maximum.
    const rng = randomNew("matching-property");
    for (let trial = 0; trial < 40; trial++) {
      const nl = 4;
      const nr = 4;
      const adj: number[][] = [];
      for (let L = 0; L < nl; L++) {
        // Every left vertex keeps at least one edge, so the graphs are not
        // trivially empty; the rest are drawn.
        const edges = [...Array(nr).keys()].filter(
          (R) => randomUpto(rng, 2) === 1 || R === L % nr,
        );
        adj.push(edges);
      }
      const got = matching(
        nl,
        nr,
        adj.map((a) => [...a]),
        adj.map((a) => a.length),
      );
      expect(cardinality(got)).toBe(bruteForce(nl, adj));
    }
  });

  it("is deterministic without an RNG — cardinality does not depend on the draws", () => {
    // The `rs`-less mode is upstream's `rs = NULL` existence check. A matching's
    // *size* is order-independent even though the assignment is not, which is
    // what makes the two modes interchangeable for a yes/no question.
    const adj = [
      [0, 1, 2],
      [0, 1],
      [1, 2],
    ];
    const plain = matching(
      3,
      3,
      adj.map((a) => [...a]),
      adj.map((a) => a.length),
    );
    const again = matching(
      3,
      3,
      adj.map((a) => [...a]),
      adj.map((a) => a.length),
    );
    expect([...plain]).toEqual([...again]);
    expect(cardinality(plain)).toBe(3);

    const seeded = matching(
      3,
      3,
      adj.map((a) => [...a]),
      adj.map((a) => a.length),
      randomNew("matching-rs"),
    );
    expect(cardinality(seeded)).toBe(3);
  });

  it("leaves a left vertex unmatched when the graph cannot cover it", () => {
    // Three lefts competing for two rights: Hall's condition fails, so exactly
    // one must come back -1 rather than the matcher inventing a right vertex.
    const adj = [
      [0, 1],
      [0, 1],
      [0, 1],
    ];
    const m = matching(
      3,
      2,
      adj.map((a) => [...a]),
      adj.map((a) => a.length),
    );
    expect(cardinality(m)).toBe(2);
  });
});
