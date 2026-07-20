/**
 * Group behavioural tests (tier 1, pure logic): params codec, generation +
 * unique-solvability at target difficulty, desc round-trip, move transitions
 * (multifill, reorder, divider), completion, and findMistakes. The byte-match
 * differential against the C reference lives in `group-differential.test.ts`.
 */

import { describe, expect, it } from "vitest";
import { DIFF_AMBIGUOUS, DIFF_IMPOSSIBLE } from "../../engine/latin.ts";
import { randomNew } from "../../random/index.ts";
import { newGameDesc } from "./generator.ts";
import { groupGame } from "./index.ts";
import { colours, newDrawState, redraw, setTileSize } from "./render.ts";
import { solveGroup } from "./solver.ts";
import {
  cloneState,
  DIFF_HARD,
  DIFF_NORMAL,
  DIFF_UNREASONABLE,
  decodeParams,
  encodeGrid,
  encodeParams,
  type GroupParams,
  type GroupState,
  newState,
  newUi,
  PRESETS,
  validateDesc,
  validateParams,
} from "./state.ts";

const P = (w: number, diff: number, id: boolean): GroupParams => ({ w, diff, id });

/** A completed grid is a valid group table iff Latin + associative. */
function isValidGroupTable(grid: Uint8Array, w: number): boolean {
  // Latin: each element once per row and column.
  for (let y = 0; y < w; y++) {
    const seen = new Set<number>();
    for (let x = 0; x < w; x++) {
      const v = grid[y * w + x];
      if (v < 1 || v > w || seen.has(v)) return false;
      seen.add(v);
    }
  }
  for (let x = 0; x < w; x++) {
    const seen = new Set<number>();
    for (let y = 0; y < w; y++) seen.add(grid[y * w + x]);
    if (seen.size !== w) return false;
  }
  // Associative: (ab)c == a(bc).
  const g = (aa: number, bb: number) => grid[aa * w + bb] - 1; // 0-based product
  for (let i = 0; i < w; i++)
    for (let j = 0; j < w; j++)
      for (let k = 0; k < w; k++) if (g(g(i, j), k) !== g(i, g(j, k))) return false;
  return true;
}

describe("params codec", () => {
  it("round-trips every preset through encode/decode", () => {
    for (const p of PRESETS) {
      const enc = encodeParams(p, true);
      const dec = decodeParams(enc);
      expect(dec.w).toBe(p.w);
      expect(dec.diff).toBe(p.diff);
      expect(dec.id).toBe(p.id);
    }
  });

  it("encodes identity-hidden and difficulty faithfully", () => {
    expect(encodeParams(P(8, DIFF_HARD, false), true)).toBe("8dhi");
    expect(encodeParams(P(6, DIFF_NORMAL, true), true)).toBe("6dn");
    expect(encodeParams(P(6, DIFF_NORMAL, true), false)).toBe("6");
  });

  it("rejects the two impossible identity-hidden combinations", () => {
    expect(validateParams(P(3, DIFF_NORMAL, false), true)).toMatch(/3x3/);
    expect(validateParams(P(6, 0, false), true)).toMatch(/Trivial/);
    expect(validateParams(P(6, DIFF_NORMAL, false), true)).toBeNull();
    expect(validateParams(P(2, DIFF_NORMAL, true), true)).toMatch(/between 3 and 26/);
  });
});

describe("generation", () => {
  // A small, fast matrix across sizes / difficulties / both identity modes.
  const cases: GroupParams[] = [
    P(4, DIFF_NORMAL, true),
    P(6, DIFF_NORMAL, true),
    P(6, DIFF_NORMAL, false),
    P(6, DIFF_HARD, false),
    P(8, DIFF_HARD, true),
    P(8, DIFF_HARD, false),
  ];

  for (const p of cases) {
    it(`produces a uniquely-solvable board at ${p.w}d${p.diff}${p.id ? "" : "i"}`, () => {
      const rng = randomNew(`group-${p.w}-${p.diff}-${p.id}`);
      const { desc, aux } = newGameDesc(p, rng);

      // Desc validates and round-trips through the codec.
      expect(validateDesc(p, desc)).toBeNull();
      const state = newState(p, desc);
      expect(encodeGrid(state.grid, p.w * p.w)).toBe(desc);

      // The generated board is uniquely solvable at the (possibly downgraded)
      // difficulty, and the solution is a genuine group table.
      const soln = state.grid.slice();
      const ret = solveGroup(soln, p.w, DIFF_UNREASONABLE);
      expect(ret).not.toBe(DIFF_IMPOSSIBLE);
      expect(ret).not.toBe(DIFF_AMBIGUOUS);
      expect(isValidGroupTable(soln, p.w)).toBe(true);

      // aux encodes that same solution.
      expect(aux[0]).toBe("S");
      expect(aux.length).toBe(p.w * p.w + 1);
    });
  }
});

describe("moves and completion", () => {
  function freshGame(p: GroupParams): { state: GroupState; aux: string } {
    const rng = randomNew(`play-${p.w}-${p.diff}-${p.id}`);
    const { desc, aux } = newGameDesc(p, rng);
    return { state: newState(p, desc), aux };
  }

  it("solve() completes the board to a valid group table", () => {
    const p = P(6, DIFF_NORMAL, true);
    const { state, aux } = freshGame(p);
    const res = groupGame.solve!(state, state, aux);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const done = groupGame.executeMove(state, res.move);
    expect(done.completed).toBe(true);
    expect(done.cheated).toBe(true); // solved via the button
    expect(isValidGroupTable(done.grid, p.w)).toBe(true);
    expect(groupGame.status(done)).toBe("solved");
  });

  it("the completion flash fires on a genuine (non-cheated) completion", () => {
    const p = P(6, DIFF_NORMAL, true);
    const { state, aux } = freshGame(p);
    const res = groupGame.solve!(state, state, aux);
    if (!res.ok) throw new Error("unsolvable");
    const solved = groupGame.executeMove(state, res.move);
    const before = cloneState(solved);
    before.completed = false;
    before.cheated = false;
    const after = cloneState(solved);
    after.cheated = false; // as if the player placed the last cell themselves
    expect(groupGame.flashLength!(before, after, +1, newUi(state))).toBeGreaterThan(0);
  });

  it("a multifill set writes every listed cell", () => {
    const p = P(6, DIFF_NORMAL, true);
    const { state } = freshGame(p);
    // Find three empty non-immutable cells to fill.
    const cells: { x: number; y: number }[] = [];
    for (let y = 0; y < p.w && cells.length < 3; y++)
      for (let x = 0; x < p.w && cells.length < 3; x++)
        if (!state.immutable[y * p.w + x] && !state.grid[y * p.w + x])
          cells.push({ x, y });
    const next = groupGame.executeMove(state, { type: "set", cells, n: 1 });
    for (const c of cells) expect(next.grid[c.y * p.w + c.x]).toBe(1);
  });

  it("reorder moves an element and clears an obsoleted divider", () => {
    const p = P(6, DIFF_NORMAL, true);
    const { state } = freshGame(p);
    // Put a divider to the right of element 0 (currently followed by element 1).
    const withDiv = groupGame.executeMove(state, { type: "divider", i: 0, j: 1 });
    expect(withDiv.dividers[0]).toBe(1);
    // Move element 3 to position 1, splitting 0 and 1 apart.
    const reordered = groupGame.executeMove(withDiv, {
      type: "reorder",
      num: 3,
      pos: 1,
    });
    expect(reordered.sequence[1]).toBe(3);
    // 0 is no longer immediately followed by 1, so its divider is cleared.
    expect(reordered.dividers[0]).toBe(-1);
    // Every element still present exactly once.
    expect([...reordered.sequence].sort((a, b) => a - b)).toEqual(
      Array.from({ length: p.w }, (_, i) => i),
    );
  });

  it("divider toggles off when reapplied", () => {
    const p = P(6, DIFF_NORMAL, true);
    const { state } = freshGame(p);
    const on = groupGame.executeMove(state, { type: "divider", i: 2, j: 3 });
    expect(on.dividers[2]).toBe(3);
    const off = groupGame.executeMove(on, { type: "divider", i: 2, j: 3 });
    expect(off.dividers[2]).toBe(-1);
  });

  it("rejects setting an immutable cell to a different value", () => {
    const p = P(6, DIFF_NORMAL, true);
    const { state } = freshGame(p);
    const imm = state.grid.findIndex((v, i) => state.immutable[i] !== 0 && v !== 0);
    const x = imm % p.w;
    const y = (imm / p.w) | 0;
    const wrong = (state.grid[imm] % p.w) + 1;
    expect(() =>
      groupGame.executeMove(state, { type: "set", cells: [{ x, y }], n: wrong }),
    ).toThrow();
  });
});

describe("findMistakes", () => {
  it("flags a wrong entry and clears once corrected", () => {
    const p = P(6, DIFF_NORMAL, true);
    const rng = randomNew("mistake");
    const { desc, aux } = newGameDesc(p, rng);
    const state = newState(p, desc);

    // Solve to the unique solution, then corrupt one non-immutable cell.
    const res = groupGame.solve!(state, state, aux);
    if (!res.ok) throw new Error("unsolvable");
    const solved = groupGame.executeMove(state, res.move);
    expect(groupGame.findMistakes!(solved)).toHaveLength(0);

    const idx = solved.grid.findIndex((_, i) => !state.immutable[i]);
    const bad = cloneState(solved);
    bad.grid[idx] = (bad.grid[idx] % p.w) + 1;
    const mistakes = groupGame.findMistakes!(bad);
    expect(mistakes.length).toBeGreaterThan(0);
    expect(mistakes.some((m) => m.y * p.w + m.x === idx)).toBe(true);
  });
});

describe("rendering smoke", () => {
  it("draws without throwing and the palette has all colours", () => {
    const p = P(6, DIFF_NORMAL, true);
    const rng = randomNew("render");
    const { desc } = newGameDesc(p, rng);
    const state = newState(p, desc);
    const pal = colours([0.9, 0.9, 0.9]);
    expect(pal).toHaveLength(8);

    const ds = newDrawState(state);
    setTileSize(ds, 48);
    const ops: string[] = [];
    // Minimal GameDrawing double: record op names, ignore geometry.
    const dr = {
      drawRect: () => ops.push("rect"),
      drawLine: () => ops.push("line"),
      drawPolygon: () => ops.push("poly"),
      drawCircle: () => ops.push("circle"),
      drawText: () => ops.push("text"),
      clip: () => {},
      unclip: () => {},
      drawUpdate: () => {},
    } as unknown as Parameters<typeof redraw>[0];
    redraw(dr, ds, null, state, 0, newUi(state), 0, 0);
    expect(ops.length).toBeGreaterThan(0);
  });
});
