import { describe, it, expect } from "vitest";
import { randomNew } from "../../random/index.ts";
import {
  type SixteenParams,
  type SixteenState,
  type SixteenMove,
  defaultParams,
  encodeParams,
  decodeParams,
  validateParams,
  presets,
  validateDesc,
  newState,
  isCompleted,
  status,
  serialiseMove,
  deserialiseMove,
  textFormat,
  newDesc,
} from "./state.ts";
import { sixteenGame, executeMove } from "./index.ts";

// --- helpers ----------------------------------------------------------

function solvedState(w: number, h: number): SixteenState {
  const n = w * h;
  const tiles = new Int32Array(n);
  for (let i = 0; i < n; i++) tiles[i] = i + 1;
  return {
    w, h, n, tiles,
    completed: 0,
    usedSolve: false,
    moveCount: 0,
    moveTarget: 0,
    lastMovementSense: 0,
  };
}

// --- params -----------------------------------------------------------

describe("Sixteen params", () => {
  it("default is 4×4 with no movetarget", () => {
    const p = defaultParams();
    expect(p).toEqual({ w: 4, h: 4, movetarget: 0 });
  });

  it("round-trips through encode/decode", () => {
    const cases: SixteenParams[] = [
      { w: 3, h: 3, movetarget: 0 },
      { w: 5, h: 4, movetarget: 0 },
      { w: 4, h: 4, movetarget: 20 },
    ];
    for (const p of cases) {
      expect(decodeParams(encodeParams(p, true))).toEqual(p);
      expect(decodeParams(encodeParams(p, false))).toEqual(p);
    }
  });

  it("validates minimum dimensions", () => {
    expect(validateParams({ w: 1, h: 3, movetarget: 0 }, true)).toBeTruthy();
    expect(validateParams({ w: 3, h: 1, movetarget: 0 }, true)).toBeTruthy();
    expect(validateParams({ w: 2, h: 2, movetarget: 0 }, true)).toBeNull();
  });

  it("validates movetarget >= 0", () => {
    expect(validateParams({ w: 3, h: 3, movetarget: -1 }, true)).toBeTruthy();
    expect(validateParams({ w: 3, h: 3, movetarget: 0 }, true)).toBeNull();
  });
});

// --- presets ----------------------------------------------------------

describe("Sixteen presets", () => {
  it("has 5 presets", () => {
    const menu = presets();
    expect(menu.submenu).toHaveLength(5);
  });

  it("presets have valid params", () => {
    const menu = presets();
    for (const entry of menu.submenu ?? []) {
      expect(entry.params).toBeDefined();
      if (entry.params) {
        expect(validateParams(entry.params, true)).toBeNull();
      }
    }
  });
});

// --- desc / state -----------------------------------------------------

describe("Sixteen desc and state", () => {
  it("validates a correct desc", () => {
    const p = { w: 3, h: 3, movetarget: 0 };
    expect(validateDesc(p, "1,2,3,4,5,6,7,8,9")).toBeNull();
  });

  it("rejects desc with wrong number of entries", () => {
    const p = { w: 3, h: 3, movetarget: 0 };
    expect(validateDesc(p, "1,2,3,4,5,6,7,8")).toBeTruthy();
  });

  it("rejects desc with duplicate numbers", () => {
    const p = { w: 3, h: 3, movetarget: 0 };
    expect(validateDesc(p, "1,2,3,4,5,6,7,8,8")).toBeTruthy();
  });

  it("rejects desc with out-of-range numbers", () => {
    const p = { w: 3, h: 3, movetarget: 0 };
    expect(validateDesc(p, "1,2,3,4,5,6,7,8,10")).toBeTruthy();
  });

  it("newState parses desc correctly", () => {
    const p = { w: 3, h: 3, movetarget: 0 };
    const s = newState(p, "1,2,3,4,5,6,7,8,9");
    expect(s.tiles).toEqual(new Int32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]));
    expect(s.w).toBe(3);
    expect(s.h).toBe(3);
    expect(s.completed).toBe(0);
  });
});

// --- completion -------------------------------------------------------

describe("Sixteen completion", () => {
  it("detects a solved state", () => {
    const s = solvedState(3, 3);
    expect(isCompleted(s)).toBe(true);
  });

  it("detects an unsolved state", () => {
    const s = solvedState(3, 3);
    const tiles = new Int32Array(s.tiles);
    [tiles[0], tiles[1]] = [tiles[1], tiles[0]];
    const unsolved = { ...s, tiles };
    expect(isCompleted(unsolved)).toBe(false);
  });

  it("status returns solved/ongoing", () => {
    const s = solvedState(3, 3);
    expect(status(s)).toBe("ongoing");
    expect(status({ ...s, completed: 5 })).toBe("solved");
  });
});

// --- move serialisation -----------------------------------------------

describe("Sixteen move serialisation", () => {
  it("round-trips slide moves", () => {
    const moves: SixteenMove[] = [
      { type: "slide", axis: "row", index: 2, delta: 1 },
      { type: "slide", axis: "column", index: 0, delta: -1 },
    ];
    for (const m of moves) {
      expect(deserialiseMove(serialiseMove(m))).toEqual(m);
    }
  });

  it("round-trips solve move", () => {
    const m: SixteenMove = { type: "solve" };
    expect(deserialiseMove(serialiseMove(m))).toEqual(m);
  });
});

// --- text format ------------------------------------------------------

describe("Sixteen text format", () => {
  it("formats a 3×3 solved state", () => {
    const s = solvedState(3, 3);
    expect(textFormat(s)).toBe("1 2 3\n4 5 6\n7 8 9");
  });
});

// --- generator --------------------------------------------------------

describe("Sixteen generator", () => {
  it("generates a valid desc for random permutation (movetarget=0)", () => {
    const p = { w: 4, h: 4, movetarget: 0 };
    const rng = randomNew("test-sixteen-gen");
    const { desc } = newDesc(p, rng);
    expect(validateDesc(p, desc)).toBeNull();
  });

  it("generates a valid desc for shuffle (movetarget>0)", () => {
    const p = { w: 4, h: 4, movetarget: 50 };
    const rng = randomNew("test-sixteen-shuffle");
    const { desc } = newDesc(p, rng);
    expect(validateDesc(p, desc)).toBeNull();
  });

  it("shuffled desc is not solved", () => {
    const p = { w: 4, h: 4, movetarget: 100 };
    const rng = randomNew("test-sixteen-unsolved");
    const { desc } = newDesc(p, rng);
    const s = newState(p, desc);
    expect(isCompleted(s)).toBe(false);
  });

  it("odd×odd boards have even parity", () => {
    const p = { w: 3, h: 3, movetarget: 0 };
    const rng = randomNew("test-sixteen-parity");
    for (let trial = 0; trial < 10; trial++) {
      const { desc } = newDesc(p, rng);
      const s = newState(p, desc);
      let inversions = 0;
      for (let i = 0; i < s.n; i++) {
        for (let j = i + 1; j < s.n; j++) {
          if (s.tiles[i] > s.tiles[j]) inversions++;
        }
      }
      expect(inversions % 2).toBe(0);
    }
  });

  it("is deterministic for the same seed", () => {
    const p = { w: 4, h: 4, movetarget: 0 };
    const rng1 = randomNew("deterministic-seed");
    const rng2 = randomNew("deterministic-seed");
    const { desc: d1 } = newDesc(p, rng1);
    const { desc: d2 } = newDesc(p, rng2);
    expect(d1).toBe(d2);
  });
});

// --- move execution ---------------------------------------------------

describe("Sixteen move execution", () => {
  it("slides a row right by 1", () => {
    const s = newState({ w: 3, h: 3, movetarget: 0 }, "1,2,3,4,5,6,7,8,9");
    const move: SixteenMove = { type: "slide", axis: "row", index: 0, delta: 1 };
    const result = executeMove(s, move);
    expect(Array.from(result.tiles)).toEqual([3, 1, 2, 4, 5, 6, 7, 8, 9]);
  });

  it("slides a row left by 1", () => {
    const s = newState({ w: 3, h: 3, movetarget: 0 }, "1,2,3,4,5,6,7,8,9");
    const move: SixteenMove = { type: "slide", axis: "row", index: 0, delta: -1 };
    const result = executeMove(s, move);
    expect(Array.from(result.tiles)).toEqual([2, 3, 1, 4, 5, 6, 7, 8, 9]);
  });

  it("slides a column down by 1", () => {
    const s = newState({ w: 3, h: 3, movetarget: 0 }, "1,2,3,4,5,6,7,8,9");
    const move: SixteenMove = { type: "slide", axis: "column", index: 0, delta: 1 };
    const result = executeMove(s, move);
    expect(Array.from(result.tiles)).toEqual([7, 2, 3, 1, 5, 6, 4, 8, 9]);
  });

  it("slides a column up by 1", () => {
    const s = newState({ w: 3, h: 3, movetarget: 0 }, "1,2,3,4,5,6,7,8,9");
    const move: SixteenMove = { type: "slide", axis: "column", index: 0, delta: -1 };
    const result = executeMove(s, move);
    expect(Array.from(result.tiles)).toEqual([4, 2, 3, 7, 5, 6, 1, 8, 9]);
  });

  it("solve replaces grid with solved state", () => {
    const s = newState({ w: 3, h: 3, movetarget: 0 }, "3,1,2,6,4,5,9,7,8");
    const move: SixteenMove = { type: "solve" };
    const result = executeMove(s, move);
    expect(Array.from(result.tiles)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(result.usedSolve).toBe(true);
    expect(result.completed).toBeGreaterThan(0);
  });

  it("increments moveCount", () => {
    const s = newState({ w: 3, h: 3, movetarget: 0 }, "3,1,2,4,5,6,7,8,9");
    const move: SixteenMove = { type: "slide", axis: "row", index: 0, delta: 1 };
    const result = executeMove(s, move);
    expect(result.moveCount).toBe(s.moveCount + 1);
  });

  it("detects completion with row slide", () => {
    const s = newState({ w: 3, h: 3, movetarget: 0 }, "2,3,1,4,5,6,7,8,9");
    const move: SixteenMove = { type: "slide", axis: "row", index: 0, delta: 1 };
    const result = executeMove(s, move);
    expect(Array.from(result.tiles)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(result.completed).toBeGreaterThan(0);
  });

  it("does not mutate the original state", () => {
    const s = newState({ w: 3, h: 3, movetarget: 0 }, "1,2,3,4,5,6,7,8,9");
    const originalTiles = new Int32Array(s.tiles);
    const move: SixteenMove = { type: "slide", axis: "row", index: 0, delta: 1 };
    executeMove(s, move);
    expect(s.tiles).toEqual(originalTiles);
  });
});

// --- colours ----------------------------------------------------------

describe("Sixteen colours", () => {
  it("returns 4 colours from the game", () => {
    const bg: [number, number, number] = [0.9, 0.9, 0.9];
    const palette = sixteenGame.colours(bg);
    expect(palette).toHaveLength(4);
  });
});
