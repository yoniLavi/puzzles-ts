/**
 * Behavioural tests for the Ascent port (tier 1 + a midend save round-trip).
 *
 * Generation is solver-gated, so "generates a board that decodes, re-solves
 * to a single completion, and round-trips through the codec" exercises the
 * generator, the four-tier solver, the codec and `checkCompletion` together.
 */
import { describe, expect, it } from "vitest";
import { Midend } from "../../engine/index.ts";
import { randomNew } from "../../random/index.ts";
import { newAscentDesc } from "./generator.ts";
import { ascentGame } from "./index.ts";
import { ascentSolve, SolverScratch } from "./solver.ts";
import {
  type AscentParams,
  checkCompletion,
  DIFFCOUNT,
  encodeGridDesc,
  MODE_EDGES,
  MODE_HEXAGON,
  MODE_HONEYCOMB,
  MODE_ORTHOGONAL,
  MODE_RECT,
  newAscentState,
  validateAscentDesc,
} from "./state.ts";

function mk(
  w: number,
  h: number,
  diff: number,
  mode: number,
  removeends = false,
  symmetrical = false,
): AscentParams {
  return { w, h, diff, mode, removeends, symmetrical };
}

const SAMPLE: [string, AscentParams][] = [
  ["5x5 rect easy", mk(5, 5, 0, MODE_RECT)],
  ["5x5 rect hard", mk(5, 5, 3, MODE_RECT)],
  ["6x5 orthogonal normal", mk(6, 5, 1, MODE_ORTHOGONAL)],
  ["5x5 edges normal", mk(5, 5, 1, MODE_EDGES, true)],
  ["7x7 hexagon normal", mk(7, 7, 1, MODE_HEXAGON)],
  ["6x5 honeycomb normal", mk(6, 5, 1, MODE_HONEYCOMB)],
  ["6x5 rect symmetric", mk(6, 5, 1, MODE_RECT, false, true)],
];

describe("ascent generation + solving", () => {
  for (const [name, params] of SAMPLE) {
    it(`${name}: generates a uniquely soluble board`, () => {
      const { desc } = newAscentDesc(params, randomNew(`ascent-${name}`));

      // Desc is well-formed for these params.
      expect(validateAscentDesc(params, desc)).toBeNull();

      // Decode, re-solve at max difficulty, and it completes uniquely.
      const state = newAscentState(params, desc);
      const sc = new SolverScratch(state.w, state.h, state.mode, state.last);
      ascentSolve(state.grid, DIFFCOUNT, sc);
      expect(checkCompletion(sc.grid, state.w, state.h, state.mode)).toBe(true);

      // The solution decodes back to the same clue desc (codec inverse).
      expect(encodeGridDesc(state.grid, state.w * state.h)).toBe(desc);
    });
  }
});

describe("ascent generator determinism", () => {
  it("same seed reproduces the same desc", () => {
    const p = mk(6, 5, 1, MODE_RECT);
    const a = newAscentDesc(p, randomNew("determinism")).desc;
    const b = newAscentDesc(p, randomNew("determinism")).desc;
    expect(a).toBe(b);
  });
});

describe("ascent solve + completion", () => {
  it("Solve marks the board completed and cheated (no win flash)", () => {
    const p = mk(5, 5, 1, MODE_RECT);
    const { desc } = newAscentDesc(p, randomNew("solve-seed"));
    const state = newAscentState(p, desc);
    const res = ascentGame.solve?.(state, state);
    expect(res?.ok).toBe(true);
    if (!res?.ok) throw new Error("solve failed");
    const solved = ascentGame.executeMove(state, res.move);
    expect(solved.completed).toBe(true);
    expect(solved.cheated).toBe(true);
    expect(ascentGame.status(solved)).toBe("solved");
    expect(ascentGame.flashLength?.(state, solved, 1, ascentGame.newUi(state))).toBe(0);
  });

  it("Solve completes through a real Midend and save round-trips", () => {
    const me = new Midend(ascentGame);
    const id = `${ascentGame.encodeParams(mk(5, 5, 1, MODE_RECT), true)}#save-seed`;
    expect(me.newGameFromId(id)).toBeUndefined();
    expect(me.solve()).toBeUndefined();
    const text = me.formatAsText();
    expect(text).toBeDefined();
    expect(text).not.toContain(".");
    const saved = me.saveGame();
    const me2 = new Midend(ascentGame);
    expect(me2.loadGame(saved)).toBeUndefined();
    expect(me2.formatAsText()).not.toContain(".");
  });
});

describe("ascent findMistakes", () => {
  it("flags a wrong number and clears on a correct board", () => {
    const p = mk(5, 5, 1, MODE_RECT);
    const { desc } = newAscentDesc(p, randomNew("mistake-seed"));
    const state = newAscentState(p, desc);

    // Solve to the unique solution.
    const sc = new SolverScratch(state.w, state.h, state.mode, state.last);
    ascentSolve(state.grid, DIFFCOUNT, sc);
    const solved = { ...state, grid: sc.grid.slice() };
    expect(ascentGame.findMistakes?.(solved)).toEqual([]);

    // Corrupt a non-immutable cell to a wrong number.
    let victim = -1;
    for (let i = 0; i < state.w * state.h; i++) {
      if (!state.immutable[i] && solved.grid[i] >= 0) {
        victim = i;
        break;
      }
    }
    expect(victim).toBeGreaterThanOrEqual(0);
    const wrongVal = solved.grid[victim] === 0 ? 1 : 0;
    const dirty = { ...solved, grid: solved.grid.slice() };
    dirty.grid[victim] = wrongVal;
    const mistakes = ascentGame.findMistakes?.(dirty) ?? [];
    expect(mistakes.some((m) => m.cell === victim)).toBe(true);
  });
});
