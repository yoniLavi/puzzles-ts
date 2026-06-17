import { describe, expect, it } from "vitest";
import { randomNew } from "../../random/index.ts";
import { newDesc } from "./generator.ts";
import {
  findMistakes,
  newScratch,
  solveGame,
  solveToString,
  validateCounts,
  validateRows,
} from "./solver.ts";
import {
  type Cell,
  DIFF_EASY,
  DIFF_NORMAL,
  DIFF_TRIVIAL,
  decodeParams,
  EMPTY,
  encodeGrid,
  encodeParams,
  executeMove,
  newState,
  ONE,
  presets,
  status,
  type UnrulyParams,
  type UnrulyState,
  validateDesc,
  validateParams,
  ZERO,
} from "./state.ts";

function params(w2: number, h2: number, diff: number, unique = false): UnrulyParams {
  return { w2, h2, unique, diff };
}

describe("params", () => {
  it("round-trips through encode/decode", () => {
    const p = params(10, 8, DIFF_NORMAL, true);
    const enc = encodeParams(p, true);
    expect(enc).toBe("10x8udn");
    expect(decodeParams(enc)).toEqual(p);
  });

  it("decodes a bare square size", () => {
    expect(decodeParams("8x8")).toEqual(params(8, 8, DIFF_TRIVIAL, false));
    expect(decodeParams("12")).toEqual(params(12, 12, DIFF_TRIVIAL, false));
  });

  it("rejects invalid params", () => {
    expect(validateParams(params(7, 8, DIFF_EASY), true)).toMatch(/even/);
    expect(validateParams(params(4, 8, DIFF_EASY), true)).toMatch(/at least 6/);
    expect(validateParams(params(8, 8, 99), true)).toMatch(/difficulty/i);
    // 6-wide unique: at most A177790[3] = 14 distinct rows, so h2 = 16 is too tall.
    expect(validateParams(params(6, 16, DIFF_EASY, true), true)).toMatch(/too tall/);
  });

  it("accepts the offered presets", () => {
    const menu = presets();
    for (const entry of menu.submenu ?? []) {
      const p = entry.params;
      expect(p).toBeDefined();
      if (p) expect(validateParams(p, true)).toBeNull();
    }
  });
});

describe("desc codec", () => {
  it("round-trips a generated board", () => {
    const rng = randomNew("unruly-desc-seed");
    const p = params(8, 8, DIFF_EASY);
    const { desc } = newDesc(p, rng);
    expect(validateDesc(p, desc)).toBeNull();
    const state = newState(p, desc);
    // Re-encode the clue grid (only immutable cells are present after parse).
    expect(encodeGrid(state.grid, p.w2 * p.h2)).toBe(desc);
  });

  it("rejects malformed descs", () => {
    const p = params(8, 8, DIFF_EASY);
    expect(validateDesc(p, "!!!")).toMatch(/invalid/i);
    expect(validateDesc(p, "a")).toMatch(/short/i);
  });

  it("parses clues as immutable cells of the right colour", () => {
    // Hand-place a ONE at index 0 and a ZERO at index 1, then round-trip.
    const p = params(6, 6, DIFF_TRIVIAL);
    const s = p.w2 * p.h2;
    const grid = new Uint8Array(s);
    grid[0] = ONE;
    grid[1] = ZERO;
    const desc = encodeGrid(grid, s);
    expect(validateDesc(p, desc)).toBeNull();
    const state = newState(p, desc);
    expect(state.grid[0]).toBe(ONE);
    expect(state.immutable[0]).toBe(1);
    expect(state.grid[1]).toBe(ZERO);
    expect(state.immutable[1]).toBe(1);
    expect(state.grid[2]).toBe(EMPTY);
    expect(state.immutable[2]).toBe(0);
  });
});

/** A completed grid is balanced and rule-clean. */
function isSolvedGrid(state: UnrulyState): boolean {
  return validateCounts(state, null) === 0 && validateRows(state, null) === 0;
}

describe("generator + solver", () => {
  const cases: [string, UnrulyParams][] = [
    ["8x8 trivial", params(8, 8, DIFF_TRIVIAL)],
    ["8x8 easy", params(8, 8, DIFF_EASY)],
    ["8x8 normal", params(8, 8, DIFF_NORMAL)],
    ["10x10 normal", params(10, 10, DIFF_NORMAL)],
    ["8x8 easy unique", params(8, 8, DIFF_EASY, true)],
  ];

  it.each(cases)("generates a board the solver solves: %s", (_name, p) => {
    const rng = randomNew(`unruly-gen-${_name}`);
    const { desc } = newDesc(p, rng);
    expect(validateDesc(p, desc)).toBeNull();

    const state = newState(p, desc);
    // The deductive solver at the board's difficulty completes it.
    const grid = Uint8Array.from(state.grid);
    const work = { w2: p.w2, h2: p.h2, unique: p.unique, grid };
    const scratch = newScratch(work);
    solveGame(work, scratch, p.diff);
    expect(validateCounts(work, null)).toBe(0);
    expect(validateRows(work, null)).toBe(0);
  });

  it("solveToString returns a fully solved grid for a generated board", () => {
    const rng = randomNew("unruly-solve-seed");
    const p = params(8, 8, DIFF_NORMAL);
    const { desc } = newDesc(p, rng);
    const state = newState(p, desc);
    const sol = solveToString(state);
    expect(sol).not.toBeNull();
    expect(sol).toHaveLength(p.w2 * p.h2);
    expect(sol).toMatch(/^[01]+$/);
  });

  it("the too-easy gate keeps NORMAL boards from being solved one level easier", () => {
    const rng = randomNew("unruly-gate-seed");
    const p = params(8, 8, DIFF_NORMAL);
    const { desc } = newDesc(p, rng);
    const state = newState(p, desc);
    const grid = Uint8Array.from(state.grid);
    const work = { w2: p.w2, h2: p.h2, unique: p.unique, grid };
    const scratch = newScratch(work);
    solveGame(work, scratch, DIFF_EASY);
    // EASY solver must NOT complete a NORMAL board (else it was too easy).
    expect(validateCounts(work, null)).not.toBe(0);
  });
});

describe("moves", () => {
  const p = params(6, 6, DIFF_TRIVIAL);
  const s = p.w2 * p.h2;

  function blank(): UnrulyState {
    const desc = encodeGrid(new Uint8Array(s), s);
    return newState(p, desc);
  }

  it("places a value and is pure (no mutation of the prior state)", () => {
    const a = blank();
    const b = executeMove(a, { type: "place", x: 1, y: 2, value: ONE });
    expect(b.grid[2 * p.w2 + 1]).toBe(ONE);
    expect(a.grid[2 * p.w2 + 1]).toBe(EMPTY);
  });

  it("rejects placing on an immutable cell", () => {
    const desc = `A${String.fromCharCode(97 + (s - 1))}`;
    const state = newState(p, desc);
    expect(state.immutable[0]).toBe(1);
    expect(() =>
      executeMove(state, { type: "place", x: 0, y: 0, value: ZERO }),
    ).toThrow();
  });

  it("detects completion and reports solved status", () => {
    const rng = randomNew("unruly-complete-seed");
    const { desc } = newDesc(p, rng);
    const state = newState(p, desc);
    const sol = solveToString(state);
    if (!sol) throw new Error("expected solvable board");
    // Apply the solution cell by cell on the non-immutable cells.
    let cur = state;
    for (let i = 0; i < s; i++) {
      if (cur.immutable[i]) continue;
      const value: Cell = sol[i] === "1" ? ONE : ZERO;
      cur = executeMove(cur, {
        type: "place",
        x: i % p.w2,
        y: Math.floor(i / p.w2),
        value,
      });
    }
    expect(cur.completed).toBe(true);
    expect(status(cur)).toBe("solved");
    expect(isSolvedGrid(cur)).toBe(true);
  });

  it("findMistakes flags a mark contradicting the solution, none when correct", () => {
    const big = params(8, 8, DIFF_EASY);
    const rng = randomNew("unruly-mistake-seed");
    const { desc } = newDesc(big, rng);
    const state = newState(big, desc);
    const sol = solveToString(state);
    if (!sol) throw new Error("expected solvable board");

    // First non-immutable cell.
    let idx = -1;
    for (let i = 0; i < big.w2 * big.h2; i++) {
      if (!state.immutable[i]) {
        idx = i;
        break;
      }
    }
    expect(idx).toBeGreaterThanOrEqual(0);
    const x = idx % big.w2;
    const y = Math.floor(idx / big.w2);

    // A correct mark → no mistakes.
    const right: Cell = sol[idx] === "1" ? ONE : ZERO;
    const good = executeMove(state, { type: "place", x, y, value: right });
    expect(findMistakes(good)).toHaveLength(0);

    // The opposite colour → flagged at that cell.
    const wrong: Cell = sol[idx] === "1" ? ZERO : ONE;
    const bad = executeMove(state, { type: "place", x, y, value: wrong });
    const mistakes = findMistakes(bad);
    expect(mistakes.some((m) => m.x === x && m.y === y)).toBe(true);
  });

  it("a solve move fills and marks the board cheated+completed", () => {
    const rng = randomNew("unruly-solvemove-seed");
    const { desc } = newDesc(p, rng);
    const state = newState(p, desc);
    const sol = solveToString(state);
    if (!sol) throw new Error("expected solvable board");
    const done = executeMove(state, { type: "solve", grid: sol });
    expect(done.completed).toBe(true);
    expect(done.cheated).toBe(true);
    expect(status(done)).toBe("solved");
  });
});
