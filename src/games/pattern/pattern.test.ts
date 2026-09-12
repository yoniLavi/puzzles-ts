/**
 * Behavioral tests for the Pattern (Nonograms) port.
 * Tier 1 — params/desc codec, solver, findMistakes, moves, completion.
 * Tier 2.5 — a render scenario through a real Midend with a snapshot.
 */
import { describe, expect, it } from "vitest";
import { UI_UPDATE } from "../../engine/game.ts";
import { Midend } from "../../engine/index.ts";
import {
  CURSOR_SELECT,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
} from "../../engine/pointer.ts";
import { randomNew } from "../../engine/random/index.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { sizedDrawState } from "../../engine/testing/sized-draw-state.ts";
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
    // Unrecognized character.
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
  });
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

    // Flip one cell to the wrong color → exactly that cell is flagged.
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
    expect(
      patternGame.interpretMove(
        st,
        ui,
        sizedDrawState(patternGame, st),
        { x: 0, y: 0 },
        CURSOR_SELECT,
      ),
    ).toBe(UI_UPDATE);
    expect(ui.cursor.visible).toBe(true);
    // Second select cycles the (0,0) cell UNKNOWN → FULL.
    const move = patternGame.interpretMove(
      st,
      ui,
      sizedDrawState(patternGame, st),
      { x: 0, y: 0 },
      CURSOR_SELECT,
    );
    expect(move).toEqual({ type: "fill", value: GRID_FULL, x: 0, y: 0, w: 1, h: 1 });
  });
});

describe("pattern drag-paint skips placed marks", () => {
  const base = () => newState({ w: 5, h: 5 }, "4/2.2/2/1/2/2/2/1/3.1/4");

  it("an onlyBlank fill paints blanks but leaves existing marks", () => {
    // Place EMPTY at (0,0), then drag FULL across the top row with onlyBlank.
    let st = executeMove(base(), {
      type: "fill",
      value: GRID_EMPTY,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
    });
    st = executeMove(st, {
      type: "fill",
      value: GRID_FULL,
      x: 0,
      y: 0,
      w: 4,
      h: 1,
      onlyBlank: true,
    });
    expect(st.grid[0]).toBe(GRID_EMPTY); // the placed mark is untouched
    expect([st.grid[1], st.grid[2], st.grid[3]]).toEqual([
      GRID_FULL,
      GRID_FULL,
      GRID_FULL,
    ]);
  });

  it("a single-cell fill (no onlyBlank) still overwrites a mark", () => {
    let st = executeMove(base(), {
      type: "fill",
      value: GRID_EMPTY,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
    });
    st = executeMove(st, { type: "fill", value: GRID_FULL, x: 0, y: 0, w: 1, h: 1 });
    expect(st.grid[0]).toBe(GRID_FULL); // a deliberate click can change a mark
  });

  it("interpretMove flags a multi-cell paint drag onlyBlank, a single cell not", () => {
    const st = base();
    const drag = (endX: number) => {
      const ui = patternGame.newUi(st);
      Object.assign(ui, {
        dragButton: LEFT_DRAG,
        releaseButton: LEFT_RELEASE,
        state: GRID_FULL,
      });
      Object.assign(ui.drag, { live: true, sx: 0, sy: 0, ex: endX, ey: 0 });
      return patternGame.interpretMove(
        st,
        ui,
        sizedDrawState(patternGame, st),
        { x: 0, y: 0 },
        LEFT_RELEASE,
      );
    };
    expect(drag(3)).toMatchObject({ type: "fill", onlyBlank: true, w: 4 });
    expect(drag(0)).toMatchObject({ type: "fill", onlyBlank: false, w: 1 });
  });

  // The tests above reach `interpretMove` only at the release, with the drag's
  // anchor written onto the `Ui` by hand — so nothing ran the press handler
  // that sets it. Measured: swapping the two coordinates it writes passed all
  // 38 pattern tests. These drive press → drag → release through
  // `interpretMove`, which is the only way the anchor is exercised at all.
  describe("driven through interpretMove from the press", () => {
    /** Pixel center of cell `(x, y)`, through the game's own geometry. */
    function rig() {
      const st = base();
      const ui = patternGame.newUi(st);
      const ds = sizedDrawState(patternGame, st);
      const ts = (ds as { tileSize: number }).tileSize;
      const b =
        Math.floor((3 * ts) / 4) + Math.floor(ts / 2) + ts * (Math.floor(5 / 5) + 2);
      const at = (x: number, y: number) => ({ x: b + x * ts + 1, y: b + y * ts + 1 });
      return { st, ui, ds, at };
    }

    it("anchors the drag at the pressed cell, not at its transpose", () => {
      const { st, ui, ds, at } = rig();
      patternGame.interpretMove(st, ui, ds, at(3, 1), LEFT_BUTTON);
      expect([ui.drag.sx, ui.drag.sy]).toEqual([3, 1]);
      expect([ui.drag.ex, ui.drag.ey]).toEqual([3, 1]);
    });

    it("snaps a paint drag to the axis it moved furthest along", () => {
      const { st, ui, ds, at } = rig();
      patternGame.interpretMove(st, ui, ds, at(1, 1), LEFT_BUTTON);
      // 3 across, 1 down — horizontal wins, so the row is held.
      patternGame.interpretMove(st, ui, ds, at(4, 2), LEFT_DRAG);
      expect([ui.drag.ex, ui.drag.ey]).toEqual([4, 1]);

      // And the other way round.
      patternGame.interpretMove(st, ui, ds, at(1, 1), LEFT_BUTTON);
      patternGame.interpretMove(st, ui, ds, at(2, 4), LEFT_DRAG);
      expect([ui.drag.ex, ui.drag.ey]).toEqual([1, 4]);
    });

    it("commits the swept row as one onlyBlank fill", () => {
      const { st, ui, ds, at } = rig();
      patternGame.interpretMove(st, ui, ds, at(1, 2), LEFT_BUTTON);
      patternGame.interpretMove(st, ui, ds, at(3, 2), LEFT_DRAG);
      const move = patternGame.interpretMove(st, ui, ds, at(3, 2), LEFT_RELEASE);
      expect(move).toMatchObject({
        type: "fill",
        value: GRID_FULL,
        x: 1,
        y: 2,
        w: 3,
        h: 1,
        onlyBlank: true,
      });
      expect(ui.drag.live).toBe(false);
    });

    it("a press outside the grid starts no drag", () => {
      const { st, ui, ds } = rig();
      expect(patternGame.interpretMove(st, ui, ds, { x: 1, y: 1 }, LEFT_BUTTON)).toBe(
        null,
      );
      expect(ui.drag.live).toBe(false);
    });
  });

  it("a clear drag (middle/UNKNOWN) still erases placed marks", () => {
    let st = executeMove(base(), {
      type: "fill",
      value: GRID_FULL,
      x: 0,
      y: 0,
      w: 3,
      h: 1,
    });
    // A clear is never onlyBlank, so it resets marked cells to UNKNOWN.
    st = executeMove(st, { type: "fill", value: GRID_UNKNOWN, x: 0, y: 0, w: 3, h: 1 });
    expect([st.grid[0], st.grid[1], st.grid[2]]).toEqual([
      GRID_UNKNOWN,
      GRID_UNKNOWN,
      GRID_UNKNOWN,
    ]);
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
  });
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
    expect(ops.some((o) => o.op === "rect" && o.color === COL_UNKNOWN)).toBe(true);
    // Clue numbers are drawn as text.
    expect(ops.some((o) => o.op === "text")).toBe(true);
    expect(ops).toMatchSnapshot();
  });
});
