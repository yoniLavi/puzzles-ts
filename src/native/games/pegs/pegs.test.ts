import { describe, expect, it } from "vitest";
import { randomNew } from "../../random/index.ts";
import {
  type PegsMove,
  type PegsParams,
  pegsGame,
} from "./index.ts";

const G = pegsGame;

describe("Pegs params", () => {
  it("has sensible defaults", () => {
    const p = G.defaultParams();
    expect(p.w).toBe(7);
    expect(p.h).toBe(7);
    expect(p.type).toBe(0); // TYPE_CROSS
  });

  it("round-trips params encoding", () => {
    const cases: PegsParams[] = [
      { w: 5, h: 7, type: 0 },
      { w: 7, h: 7, type: 1 },
      { w: 9, h: 9, type: 2 },
    ];
    for (const p of cases) {
      const encoded = G.encodeParams(p, true);
      const decoded = G.decodeParams(encoded);
      expect(decoded).toEqual(p);
    }
  });

  it("decodes width-only params (square)", () => {
    const decoded = G.decodeParams("7x7");
    expect(decoded.w).toBe(7);
    expect(decoded.h).toBe(7);
  });

  it("validates cross board sizes", () => {
    expect(G.validateParams({ w: 5, h: 7, type: 0 }, true)).toBeNull();
    expect(G.validateParams({ w: 3, h: 3, type: 0 }, true)).toMatch(/greater than three/);
    expect(G.validateParams({ w: 6, h: 6, type: 0 }, true)).toMatch(/only supported/);
  });

  it("validates octagon is 7x7 only", () => {
    expect(G.validateParams({ w: 7, h: 7, type: 1 }, true)).toBeNull();
    expect(G.validateParams({ w: 5, h: 7, type: 1 }, true)).toMatch(/only supported at 7×7/);
  });

  it("rejects zero/negative dimensions", () => {
    expect(G.validateParams({ w: 0, h: 5, type: 0 }, false)).toMatch(/at least one/);
    expect(G.validateParams({ w: 5, h: -1, type: 0 }, false)).toMatch(/at least one/);
  });
});

describe("Pegs desc and state", () => {
  const rng = randomNew("pegs-42");

  it("generates a cross board with central hole", () => {
    const p = { w: 7, h: 7, type: 0 };
    const { desc } = G.newDesc(p, rng);
    expect(desc.length).toBe(49);
    // Centre cell (index 24) should be a hole.
    expect(desc[24]).toBe("H");
    // Should have pegs and holes and obstacles.
    const pegs = [...desc].filter((c) => c === "P").length;
    const holes = [...desc].filter((c) => c === "H").length;
    expect(pegs).toBeGreaterThan(0);
    expect(holes).toBeGreaterThanOrEqual(1);
  });

  it("generates an octagon board with a solvable starting hole", () => {
    const p = { w: 7, h: 7, type: 1 };
    const { desc } = G.newDesc(p, rng);
    expect(desc.length).toBe(49);
    // Octagon should have exactly one hole (the starting hole).
    const holes = [...desc].filter((c) => c === "H").length;
    expect(holes).toBe(1);
  });

  it("generates a random board that touches all edges", () => {
    const p = { w: 5, h: 5, type: 2 };
    const { desc } = G.newDesc(p, rng);
    expect(desc.length).toBe(25);
    // Check that the board touches all four edges.
    const grid = [...desc];
    const leftEdge = grid.some((_, y) => grid[y * 5] !== "O");
    const rightEdge = grid.some((_, y) => grid[y * 5 + 4] !== "O");
    const topEdge = grid.slice(0, 5).some((c) => c !== "O");
    const bottomEdge = grid.slice(20, 25).some((c) => c !== "O");
    expect(leftEdge && rightEdge && topEdge && bottomEdge).toBe(true);
  });

  it("validates desc length", () => {
    expect(G.validateDesc({ w: 7, h: 7, type: 0 }, "PPPPPPP")).toMatch(/wrong length/);
  });

  it("validates desc characters", () => {
    expect(G.validateDesc({ w: 2, h: 2, type: 0 }, "PPXH")).toMatch(/Invalid character/);
  });

  it("validates desc has enough pegs and holes", () => {
    // "PPH" is the minimal valid desc (2 pegs + 1 hole).
    expect(G.validateDesc({ w: 3, h: 1, type: 0 }, "PPH")).toBeNull();
    expect(G.validateDesc({ w: 2, h: 1, type: 0 }, "OO")).toMatch(/Too few pegs/);
    expect(G.validateDesc({ w: 2, h: 1, type: 0 }, "PP")).toMatch(/Too few holes/);
  });

  it("creates state from desc", () => {
    const p = { w: 3, h: 1, type: 0 };
    const state = G.newState(p, "PPH");
    expect(state.w).toBe(3);
    expect(state.h).toBe(1);
    expect(state.completed).toBe(false);
    expect(state.grid[0]).toBe(1); // GRID_PEG
    expect(state.grid[1]).toBe(1); // GRID_PEG
    expect(state.grid[2]).toBe(0); // GRID_HOLE
  });
});

describe("Pegs moves", () => {
  it("executes a valid jump", () => {
    const p = { w: 3, h: 1, type: 0 };
    const state = G.newState(p, "PPH");
    const move: PegsMove = { type: "jump", sx: 0, sy: 0, tx: 2, ty: 0 };
    const next = G.executeMove(state, move);
    expect(next.grid[0]).toBe(0); // source → HOLE
    expect(next.grid[1]).toBe(0); // middle → HOLE (jumped peg removed)
    expect(next.grid[2]).toBe(1); // target → PEG
  });

  it("detects completion when one peg remains", () => {
    const p = { w: 3, h: 1, type: 0 };
    const state = G.newState(p, "PPH");
    const move: PegsMove = { type: "jump", sx: 0, sy: 0, tx: 2, ty: 0 };
    const next = G.executeMove(state, move);
    expect(next.completed).toBe(true);
    expect(G.status(next)).toBe("solved");
  });

  it("does not complete when multiple pegs remain", () => {
    const p = { w: 5, h: 1, type: 0 };
    const state = G.newState(p, "PPPPH");
    const move: PegsMove = { type: "jump", sx: 2, sy: 0, tx: 4, ty: 0 };
    const next = G.executeMove(state, move);
    expect(next.completed).toBe(false);
    expect(G.status(next)).toBe("ongoing");
  });

  it("throws on invalid move (wrong length)", () => {
    const p = { w: 5, h: 1, type: 0 };
    const state = G.newState(p, "PPPPH");
    const move: PegsMove = { type: "jump", sx: 0, sy: 0, tx: 1, ty: 0 };
    expect(() => G.executeMove(state, move)).toThrow();
  });

  it("throws on invalid move (no peg at source)", () => {
    const p = { w: 3, h: 1, type: 0 };
    const state = G.newState(p, "PPH");
    const move: PegsMove = { type: "jump", sx: 2, sy: 0, tx: 0, ty: 0 };
    expect(() => G.executeMove(state, move)).toThrow();
  });

  it("throws on invalid move (no peg in middle)", () => {
    const p = { w: 3, h: 1, type: 0 };
    const state = G.newState(p, "PHH");
    const move: PegsMove = { type: "jump", sx: 0, sy: 0, tx: 2, ty: 0 };
    expect(() => G.executeMove(state, move)).toThrow();
  });

  it("state is immutable — original unchanged after executeMove", () => {
    const p = { w: 3, h: 1, type: 0 };
    const state = G.newState(p, "PPH");
    const origGrid = new Uint8Array(state.grid);
    const move: PegsMove = { type: "jump", sx: 0, sy: 0, tx: 2, ty: 0 };
    G.executeMove(state, move);
    expect(state.grid).toEqual(origGrid);
  });
});

describe("Pegs move serialisation", () => {
  it("round-trips a jump move", () => {
    const move: PegsMove = { type: "jump", sx: 3, sy: 5, tx: 3, ty: 7 };
    const raw = G.serialiseMove?.(move);
    const restored = G.deserialiseMove?.(raw);
    expect(restored).toEqual(move);
  });

  it("rejects invalid serialised move", () => {
    expect(() => G.deserialiseMove?.("invalid")).toThrow();
  });
});

describe("Pegs text format", () => {
  it("formats a simple board", () => {
    const p = { w: 3, h: 1, type: 0 };
    const state = G.newState(p, "PPH");
    const text = G.textFormat?.(state);
    expect(text).toBe("**-");
  });

  it("formats obstacles as spaces", () => {
    const p = { w: 3, h: 1, type: 0 };
    const state = G.newState(p, "OPO");
    const text = G.textFormat?.(state);
    expect(text).toBe(" * ");
  });
});

describe("Pegs colours", () => {
  it("uses mkhighlightBackground for the background colour", () => {
    const bg: [number, number, number] = [1, 1, 1]; // near-white
    const palette = G.colours(bg);
    // Background should be shifted away from pure white.
    expect(palette[0][0]).toBeLessThan(1);
    expect(palette[0][1]).toBeLessThan(1);
    expect(palette[0][2]).toBeLessThan(1);
  });

  it("has 5 colours", () => {
    const palette = G.colours([0.9, 0.9, 0.9]);
    expect(palette.length).toBe(5);
  });
});

describe("Pegs computeSize", () => {
  it("computes size for a 7x7 board", () => {
    const p = { w: 7, h: 7, type: 0 };
    const size = G.computeSize(p, 33);
    expect(size.w).toBeGreaterThan(0);
    expect(size.h).toBeGreaterThan(0);
  });
});

describe("Pegs generator (Random)", () => {
  it("produces a solvable board with pegs and holes", () => {
    const rng = randomNew("pegs-123");
    const p = { w: 5, h: 5, type: 2 };
    const { desc } = G.newDesc(p, rng);
    const pegs = [...desc].filter((c) => c === "P").length;
    const holes = [...desc].filter((c) => c === "H").length;
    expect(pegs).toBeGreaterThan(0);
    expect(holes).toBeGreaterThan(0);
  });

  it("produces different boards for different seeds", () => {
    const r1 = randomNew("pegs-seed-1");
    const r2 = randomNew("pegs-seed-2");
    const p = { w: 5, h: 5, type: 2 };
    const d1 = G.newDesc(p, r1).desc;
    const d2 = G.newDesc(p, r2).desc;
    expect(d1).not.toBe(d2);
  });
});

describe("Pegs presets", () => {
  it("has 9 presets", () => {
    const menu = G.presets();
    expect(menu.submenu?.length).toBe(9);
  });

  it("presets have valid params", () => {
    const menu = G.presets();
    for (const item of menu.submenu ?? []) {
      expect(G.validateParams(item.params as PegsParams, true)).toBeNull();
    }
  });
});
