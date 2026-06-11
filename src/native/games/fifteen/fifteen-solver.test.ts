// Tier-1: the greedy solver invariant. From any solvable board,
// repeatedly applying the gap-move that `computeHint` recommends reaches
// the solved arrangement within the upstream `5·n³` bound — the same
// assertion `fifteen.c`'s STANDALONE_SOLVER makes. This exercises the
// `next_move` branches, the axis-flipped column path, and the hard-coded
// `next_move_3x2` endgame table.
import { describe, expect, it } from "vitest";
import { randomNew } from "../../random/index.ts";
import { executeMove } from "./index.ts";
import { computeHint } from "./solver.ts";
import { type FifteenParams, isCompletedTiles, newDesc, newState } from "./state.ts";

function solveByHints(p: FifteenParams, desc: string): number {
  let state = newState(p, desc);
  const limit = 5 * state.n * state.n * state.n;
  let steps = 0;
  while (!isCompletedTiles(state.tiles, state.n)) {
    const dest = computeHint(state);
    if (!dest) throw new Error("computeHint returned null on an unsolved board");
    state = executeMove(state, { type: "move", x: dest.x, y: dest.y });
    if (++steps > limit) throw new Error(`exceeded ${limit} moves`);
  }
  return steps;
}

describe("Fifteen greedy solver", () => {
  it("solves every generated 4×4 board within 5·n³ moves", () => {
    const p = { w: 4, h: 4 };
    for (let s = 0; s < 60; s++) {
      const { desc } = newDesc(p, randomNew(`solver-4x4-${s}`));
      expect(() => solveByHints(p, desc)).not.toThrow();
    }
  });

  it("solves non-square and rectangular boards (exercises the column axis)", () => {
    for (const p of [
      { w: 5, h: 4 },
      { w: 4, h: 5 },
      { w: 6, h: 3 },
      { w: 3, h: 6 },
    ]) {
      for (let s = 0; s < 15; s++) {
        const { desc } = newDesc(p, randomNew(`solver-${p.w}x${p.h}-${s}`));
        expect(() => solveByHints(p, desc)).not.toThrow();
      }
    }
  });

  it("solves small boards including the 3×2 endgame corner", () => {
    for (const p of [
      { w: 3, h: 2 },
      { w: 2, h: 3 },
      { w: 3, h: 3 },
      { w: 2, h: 2 },
    ]) {
      for (let s = 0; s < 20; s++) {
        const { desc } = newDesc(p, randomNew(`solver-small-${p.w}x${p.h}-${s}`));
        expect(() => solveByHints(p, desc)).not.toThrow();
      }
    }
  });

  it("returns null exactly on a solved board", () => {
    const solved = newState(
      { w: 4, h: 4 },
      [...Array(16)].map((_, i) => (i + 1) % 16).join(","),
    );
    expect(computeHint(solved)).toBeNull();
  });
});
