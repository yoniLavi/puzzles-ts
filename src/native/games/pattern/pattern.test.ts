/**
 * Behavioural tests for the Pattern (Nonograms) port.
 * Tier 1 — params/desc codec, solver, findMistakes, moves, completion.
 * Tier 2.5 — a render scenario through a real Midend with a snapshot.
 */
import { describe, expect, it } from "vitest";
import { UI_UPDATE } from "../../engine/game.ts";
import { Midend } from "../../engine/index.ts";
import { CURSOR_SELECT } from "../../engine/pointer.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { newPatternDesc } from "./generator.ts";
import { patternGame } from "./index.ts";
import { COL_UNKNOWN } from "./render.ts";
import { findMistakes, solveState } from "./solver.ts";
import {
  computeRuns,
  decodeParams,
  encodeClues,
  encodeParams,
  executeMove,
  GRID_EMPTY,
  GRID_FULL,
  GRID_UNKNOWN,
  isComplete,
  newState,
  type PatternMove,
  type PatternParams,
  type PatternState,
  status,
  validateDesc,
  validateParams,
} from "./state.ts";

function genState(
  p: PatternParams,
  seed: string,
): { state: PatternState; desc: string } {
  const { desc } = newPatternDesc(p, randomNew(seed));
  return { state: newState(p, desc), desc };
}

/** Apply the unique solution to a fresh state cell-by-cell via real fills. */
function applySolution(state: PatternState, solution: Uint8Array): PatternState {
  const { w, h } = state.common;
  let st = state;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = solution[y * w + x] === GRID_FULL ? GRID_FULL : GRID_EMPTY;
      st = executeMove(st, { type: "fill", value: v, x, y, w: 1, h: 1 });
    }
  }
  return st;
}

describe("pattern params", () => {
  it("round-trips and decodes a bare square dimension", () => {
    expect(encodeParams({ w: 20, h: 15 }, true)).toBe("20x15");
    expect(decodeParams("20x15")).toEqual({ w: 20, h: 15 });
    expect(decodeParams("10")).toEqual({ w: 10, h: 10 });
  });

  it("rejects invalid params", () => {
    expect(validateParams({ w: 0, h: 5 }, true)).not.toBeNull();
    expect(validateParams({ w: 5, h: -1 }, true)).not.toBeNull();
    expect(validateParams({ w: 10, h: 10 }, true)).toBeNull();
  });
});

describe("pattern desc codec", () => {
  it("round-trips a clue desc through newState/encodeClues", () => {
    const desc = "4/2.2/2/1/2/2/2/1/3.1/4"; // a recorded 5x5 board
    const st = newState({ w: 5, h: 5 }, desc);
    expect(encodeClues(st.common.clues)).toBe(desc);
  });

  it("accepts a generated desc and rejects malformed ones", () => {
    const { desc } = genState({ w: 10, h: 10 }, "pattern-desc-1");
    expect(validateDesc({ w: 10, h: 10 }, desc)).toBeNull();
    // Too few line specifications.
    expect(validateDesc({ w: 5, h: 5 }, "1/2/3")).not.toBeNull();
    // Unrecognised character.
    expect(validateDesc({ w: 2, h: 2 }, "1/2/!/1")).not.toBeNull();
    // A clue that cannot fit its line.
    expect(validateDesc({ w: 3, h: 3 }, "9/1/1/1/1/1")).not.toBeNull();
  });
});

describe("pattern solver", () => {
  it("fully cracks every generated board (the uniqueness gate)", () => {
    for (const seed of ["s-a", "s-b", "s-c"]) {
      const { state } = genState({ w: 10, h: 10 }, seed);
      const solution = solveState(state);
      expect(solution).not.toBeNull();
      if (!solution) continue;
      // The solution reproduces every clue.
      const { w, h, clues } = state.common;
      for (let i = 0; i < w; i++) {
        expect(computeRuns(solution, i, h, w)).toEqual(clues[i]);
      }
      for (let i = 0; i < h; i++) {
        expect(computeRuns(solution, i * w, w, 1)).toEqual(clues[w + i]);
      }
    }
  }, 30_000);
});

describe("pattern findMistakes", () => {
  it("flags only player cells that contradict the unique solution", () => {
    const { state } = genState({ w: 10, h: 10 }, "mistake-seed");
    const solution = solveState(state);
    expect(solution).not.toBeNull();
    if (!solution) return;

    // A fresh all-unknown board has no mistakes.
    expect(findMistakes(state)).toEqual([]);

    // The fully-correct board has no mistakes.
    const solved = applySolution(state, solution);
    expect(findMistakes(solved)).toEqual([]);

    // Flip one cell to the wrong colour → exactly that cell is flagged.
    const wrong = solution[0] === GRID_FULL ? GRID_EMPTY : GRID_FULL;
    const dirty = executeMove(solved, {
      type: "fill",
      value: wrong,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
    });
    expect(findMistakes(dirty)).toEqual([{ x: 0, y: 0 }]);
  });
});

describe("pattern moves and completion", () => {
  it("a fill applies a rectangle and a no-op fill leaves the board", () => {
    const st = newState({ w: 5, h: 5 }, "4/2.2/2/1/2/2/2/1/3.1/4");
    const filled = executeMove(st, {
      type: "fill",
      value: GRID_FULL,
      x: 1,
      y: 1,
      w: 2,
      h: 2,
    });
    for (const [x, y] of [
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2],
    ]) {
      expect(filled.grid[y * 5 + x]).toBe(GRID_FULL);
    }
    expect(filled.grid[0]).toBe(GRID_UNKNOWN);
  });

  it("completes (un-cheated) when fills reproduce the solution", () => {
    const { state } = genState({ w: 5, h: 5 }, "complete-seed");
    const solution = solveState(state);
    expect(solution).not.toBeNull();
    if (!solution) return;
    const solved = applySolution(state, solution);
    expect(isComplete(solved)).toBe(true);
    expect(status(solved)).toBe("solved");
    expect(solved.completed).toBe(true);
    expect(solved.cheated).toBe(false);
  });

  it("a solve move marks the board solved-with-help", () => {
    const { state } = genState({ w: 5, h: 5 }, "solve-seed");
    const sol = solveState(state);
    expect(sol).not.toBeNull();
    if (!sol) return;
    let grid = "";
    for (let i = 0; i < sol.length; i++) grid += sol[i] === GRID_FULL ? "1" : "0";
    const move: PatternMove = { type: "solve", grid };
    const after = executeMove(state, move);
    expect(after.completed).toBe(true);
    expect(after.cheated).toBe(true);
  });

  it("cursor select reveals the cursor, then cycles a cell", () => {
    const st = newState({ w: 5, h: 5 }, "4/2.2/2/1/2/2/2/1/3.1/4");
    const ui = patternGame.newUi(st);
    // First select just reveals the cursor.
    expect(patternGame.interpretMove(st, ui, null, { x: 0, y: 0 }, CURSOR_SELECT)).toBe(
      UI_UPDATE,
    );
    expect(ui.curVisible).toBe(true);
    // Second select cycles the (0,0) cell UNKNOWN → FULL.
    const move = patternGame.interpretMove(st, ui, null, { x: 0, y: 0 }, CURSOR_SELECT);
    expect(move).toEqual({ type: "fill", value: GRID_FULL, x: 0, y: 0, w: 1, h: 1 });
  });
});

describe("pattern Midend integration", () => {
  it("generates, solves, and round-trips a save", () => {
    const me = new Midend(patternGame);
    expect(me.newGameFromId("10x10#midend-seed")).toBeUndefined();
    expect(me.requestKeys()).toEqual([]); // no on-screen keypad
    const saved = me.saveGame();
    const me2 = new Midend(patternGame);
    expect(me2.loadGame(saved)).toBeUndefined();
    expect(me2.formatAsText()).toBe(me.formatAsText());
    expect(me.solve()).toBeUndefined(); // a fresh game can solve
  }, 30_000);
});

describe("pattern render", () => {
  it("draws the grid, undecided tiles, and clue numbers", () => {
    const { recording } = renderScenario({
      game: patternGame,
      id: "10x10#render-seed",
    });
    const ops = recording.ops;
    expect(ops.length).toBeGreaterThan(0);
    // Some tiles are still undecided (COL_UNKNOWN = palette index 4).
    expect(ops.some((o) => o.op === "rect" && o.colour === COL_UNKNOWN)).toBe(true);
    // Clue numbers are drawn as text.
    expect(ops.some((o) => o.op === "text")).toBe(true);
    expect(ops).toMatchSnapshot();
  }, 30_000);
});
