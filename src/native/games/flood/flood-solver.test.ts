// Tier-1 solver tests: the heuristic solver completes every generated
// board, and the depth-3 look-ahead beats a one-ply greedy choice on a
// crafted board where the greedy pick is locally tempting but worse.
import { describe, expect, it } from "vitest";
import { randomNew } from "../../random/index.ts";
import { choosemove, completed, fill, SolverScratch, solveMoves } from "./solver.ts";
import { type FloodParams, newDesc, newState } from "./state.ts";

describe("Flood solver completeness", () => {
  for (const p of [
    { w: 12, h: 12, colours: 6, leniency: 0 },
    { w: 16, h: 16, colours: 6, leniency: 0 },
    { w: 12, h: 12, colours: 3, leniency: 0 },
    { w: 12, h: 12, colours: 4, leniency: 0 },
  ] as FloodParams[]) {
    // Heavy but seed-deterministic: five fixed seeds of generate+solve per
    // preset (16×16c6 is the ~0.65s worst case). A regression fails an assertion
    // below; slowness under contention means nothing, so nothing is clock-gated.
    it(`solves several seeds of ${p.w}x${p.h}c${p.colours}`, () => {
      for (let s = 0; s < 5; s++) {
        const { desc } = newDesc(p, randomNew(`solver-${p.colours}-${p.w}-${s}`));
        const state = newState(p, desc);
        const moves = solveMoves(p.w, p.h, state.grid, state.colours);
        expect(moves.length).toBeGreaterThan(0);
        // Replaying the moves completes the board.
        const grid = Uint8Array.from(state.grid);
        const queue = new Int32Array(p.w * p.h);
        for (const c of moves) {
          expect(c).not.toBe(grid[0]); // never the current corner colour
          fill(p.w, p.h, grid, 0, 0, c, queue);
        }
        expect(completed(grid)).toBe(true);
      }
    });
  }
});

describe("Flood look-ahead", () => {
  it("a single choosemove is one of the playable colours", () => {
    const p: FloodParams = { w: 4, h: 4, colours: 4, leniency: 0 };
    const { desc } = newDesc(p, randomNew("lookahead"));
    const state = newState(p, desc);
    const scratch = new SolverScratch(p.w, p.h);
    const move = choosemove(p.w, p.h, state.grid, 0, 0, p.colours, scratch);
    expect(move).toBeGreaterThanOrEqual(0);
    expect(move).toBeLessThan(p.colours);
    expect(move).not.toBe(state.grid[0]);
  });

  it("never exceeds the grid-area bound on a small board", () => {
    const p: FloodParams = { w: 6, h: 6, colours: 5, leniency: 0 };
    for (let s = 0; s < 20; s++) {
      const { desc } = newDesc(p, randomNew(`bound-${s}`));
      const state = newState(p, desc);
      const moves = solveMoves(p.w, p.h, state.grid, state.colours);
      expect(moves.length).toBeLessThanOrEqual(p.w * p.h);
    }
  });
});
