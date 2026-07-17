// Tier-1 logic tests for the Flood port: params/desc codecs, presets,
// generation (completable + par = solver + leniency), fill/solve move
// semantics and immutability, win/lose status, and input mapping.
import { describe, expect, it } from "vitest";
import { UI_UPDATE } from "../../engine/game.ts";
import { CURSOR_RIGHT, CURSOR_SELECT, LEFT_BUTTON } from "../../engine/pointer.ts";
import { randomNew } from "../../random/index.ts";
import { executeMove, floodGame } from "./index.ts";
import { completed, solveMoves } from "./solver.ts";
import {
  decodeParams,
  defaultParams,
  encodeParams,
  type FloodParams,
  type FloodState,
  newDesc,
  newState,
  status,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

function gen(p: FloodParams, seed = "flood-test"): FloodState {
  const { desc } = newDesc(p, randomNew(seed));
  return newState(p, desc);
}

describe("Flood params", () => {
  it("round-trips and encodes the full form", () => {
    const p: FloodParams = { w: 12, h: 12, colours: 6, leniency: 5 };
    expect(encodeParams(p, true)).toBe("12x12c6m5");
    expect(encodeParams(p, false)).toBe("12x12");
    expect(decodeParams("12x12c6m5")).toEqual(p);
  });

  it("decodes a bare W as a square board with default colours/leniency", () => {
    expect(decodeParams("12")).toEqual({ w: 12, h: 12, colours: 6, leniency: 5 });
  });

  it("decodes c/m flags in either remainder order", () => {
    expect(decodeParams("8x10c4m0")).toEqual({ w: 8, h: 10, colours: 4, leniency: 0 });
    expect(decodeParams("16x16c6m2")).toEqual({
      w: 16,
      h: 16,
      colours: 6,
      leniency: 2,
    });
  });

  it("validateParams rejects bad params", () => {
    expect(validateParams({ w: 1, h: 1, colours: 6, leniency: 0 }, true)).toMatch(
      /two squares/,
    );
    expect(validateParams({ w: 4, h: 4, colours: 2, leniency: 0 }, true)).toMatch(
      /between 3 and 10/,
    );
    expect(validateParams({ w: 4, h: 4, colours: 11, leniency: 0 }, true)).toMatch(
      /between 3 and 10/,
    );
    expect(validateParams({ w: 4, h: 4, colours: 6, leniency: -1 }, true)).toMatch(
      /non-negative/,
    );
    expect(validateParams(defaultParams(), true)).toBeNull();
  });

  it("offers the seven upstream presets", () => {
    const menu = floodGame.presets();
    expect(menu.submenu).toHaveLength(7);
    expect(menu.submenu?.[0]).toEqual({
      title: "12x12 Easy",
      params: { w: 12, h: 12, colours: 6, leniency: 5 },
    });
  });
});

describe("Flood desc", () => {
  it("round-trips a generated description", () => {
    const p = defaultParams();
    const { desc } = newDesc(p, randomNew("desc-rt"));
    expect(validateDesc(p, desc)).toBeNull();
    const state = newState(p, desc);
    expect(state.grid).toHaveLength(p.w * p.h);
    // desc is wh colour chars + ",<movelimit>".
    expect(desc).toMatch(/^[0-9A-Z]+,\d+$/);
  });

  it("validateDesc rejects malformed descriptions", () => {
    const p: FloodParams = { w: 2, h: 2, colours: 3, leniency: 0 };
    expect(validateDesc(p, "012")).toMatch(/Not enough/); // 3 of 4 cells, no comma
    expect(validateDesc(p, "012!")).toMatch(/Bad character/);
    expect(validateDesc(p, "0123")).toMatch(/Expected ','/);
    expect(validateDesc(p, "0120,5")).toBeNull();
    expect(validateDesc(p, "0120,5x")).toMatch(/Badly formatted/);
  });
});

describe("Flood generation", () => {
  for (const p of [
    { w: 12, h: 12, colours: 6, leniency: 5 },
    { w: 12, h: 12, colours: 3, leniency: 0 },
    { w: 16, h: 16, colours: 6, leniency: 0 },
  ] as FloodParams[]) {
    it(`produces a non-trivial board whose limit is solver+leniency (${encodeParams(p, true)})`, () => {
      const { desc } = newDesc(p, randomNew(`gen-${encodeParams(p, true)}`));
      const state = newState(p, desc);
      expect(completed(state.grid)).toBe(false);
      const solverMoves = solveMoves(p.w, p.h, state.grid, state.colours);
      expect(state.movelimit).toBe(solverMoves.length + p.leniency);
    });
  }
});

describe("Flood fill move", () => {
  it("floods the corner region and leaves the source unmutated", () => {
    // A 3×3 board: corner colour 0, with a colour-1 cell adjacent.
    const p: FloodParams = { w: 3, h: 3, colours: 3, leniency: 0 };
    const state = newState(p, "011000222,9");
    const before = Uint8Array.from(state.grid);
    const next = executeMove(state, { type: "fill", colour: 1 });
    // The corner (0,0) and the two colour-1 cells (1,0),(2,0) become 1.
    expect(Array.from(next.grid.slice(0, 3))).toEqual([1, 1, 1]);
    expect(next.moves).toBe(1);
    // Source state untouched (immutability).
    expect(Array.from(state.grid)).toEqual(Array.from(before));
    expect(state.moves).toBe(0);
  });

  it("rejects a fill with the current corner colour", () => {
    const p: FloodParams = { w: 3, h: 3, colours: 3, leniency: 0 };
    const state = newState(p, "011000222,9");
    expect(() => executeMove(state, { type: "fill", colour: 0 })).toThrow();
  });
});

describe("Flood win / lose status", () => {
  it("reports solved when the grid completes within the limit", () => {
    // 1×2 board, corner colour 0, other cell colour 1, limit 5.
    const p: FloodParams = { w: 2, h: 1, colours: 3, leniency: 0 };
    const state = newState(p, "01,5");
    expect(status(state)).toBe("ongoing");
    const next = executeMove(state, { type: "fill", colour: 1 });
    expect(completed(next.grid)).toBe(true);
    expect(status(next)).toBe("solved");
  });

  it("reports lost when the move count reaches the limit unsolved", () => {
    // limit 1: a single fill that does not complete the board loses.
    const p: FloodParams = { w: 3, h: 1, colours: 3, leniency: 0 };
    const state = newState(p, "012,1");
    const next = executeMove(state, { type: "fill", colour: 1 });
    // grid is now 1,1,2 — not complete, and moves(1) >= limit(1).
    expect(completed(next.grid)).toBe(false);
    expect(status(next)).toBe("lost");
  });
});

describe("Flood solve", () => {
  it("snaps to a completed, cheated board", () => {
    const p = defaultParams();
    const state = gen(p, "solve-seed");
    const result = floodGame.solve?.(state, state);
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;
    const solved = executeMove(state, result.move);
    expect(completed(solved.grid)).toBe(true);
    expect(solved.cheated).toBe(true);
    expect(solved.moves).toBeGreaterThan(0);
  });

  it("refuses to solve an already-complete board", () => {
    const p: FloodParams = { w: 2, h: 1, colours: 3, leniency: 0 };
    const state = executeMove(newState(p, "01,5"), { type: "fill", colour: 1 });
    expect(floodGame.solve?.(state, state).ok).toBe(false);
  });
});

describe("Flood input mapping", () => {
  const p: FloodParams = { w: 3, h: 3, colours: 3, leniency: 0 };
  const state = newState(p, "011000222,9");
  const ds = floodGame.newDrawState?.(state) ?? null;
  if (ds) floodGame.setTileSize?.(ds, 32);

  it("maps a left-click on a different-colour cell to a fill", () => {
    const fresh = floodGame.newUi(state);
    // Cell (1,0) holds colour 1; border = ts/2 = 16, ts = 32, so x in
    // [48,80) maps to column 1, y in [16,48) to row 0.
    const move = floodGame.interpretMove(
      state,
      fresh,
      ds,
      { x: 56, y: 24 },
      LEFT_BUTTON,
    );
    expect(move).toEqual({ type: "fill", colour: 1 });
  });

  it("ignores a left-click on a same-colour (corner) cell", () => {
    const fresh = floodGame.newUi(state);
    // Cell (0,0) is the corner colour 0.
    const move = floodGame.interpretMove(
      state,
      fresh,
      ds,
      { x: 24, y: 24 },
      LEFT_BUTTON,
    );
    expect(move).toBeNull();
  });

  it("moves the cursor on an arrow key (UI update)", () => {
    const fresh = floodGame.newUi(state);
    const r = floodGame.interpretMove(state, fresh, ds, { x: 0, y: 0 }, CURSOR_RIGHT);
    expect(r).toBe(UI_UPDATE);
    expect(fresh.cx).toBe(1);
    expect(fresh.cursorVisible).toBe(true);
  });

  it("fills the cursor cell on select when it differs", () => {
    const fresh = floodGame.newUi(state);
    floodGame.interpretMove(state, fresh, ds, { x: 0, y: 0 }, CURSOR_RIGHT); // cx=1
    const move = floodGame.interpretMove(
      state,
      fresh,
      ds,
      { x: 0, y: 0 },
      CURSOR_SELECT,
    );
    expect(move).toEqual({ type: "fill", colour: 1 });
  });
});

describe("Flood text format", () => {
  it("emits colour chars per row", () => {
    const p: FloodParams = { w: 3, h: 2, colours: 3, leniency: 0 };
    const state = newState(p, "012210,9");
    expect(textFormat(state)).toBe("012\n210\n");
  });
});
