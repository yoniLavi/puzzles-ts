import { describe, expect, it } from "vitest";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_UP,
  LEFT_BUTTON,
} from "../../engine/pointer.ts";
import { randomNew } from "../../random/index.ts";
import { executeMove, fifteenGame } from "./index.ts";
import {
  decodeParams,
  defaultParams,
  encodeParams,
  type FifteenMove,
  type FifteenParams,
  type FifteenState,
  isCompletedTiles,
  newDesc,
  newState,
  parityP,
  permParity,
  presets,
  status,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

// --- helpers ----------------------------------------------------------

function solvedState(w: number, h: number): FifteenState {
  return newState({ w, h }, solvedDesc(w, h));
}

function solvedDesc(w: number, h: number): string {
  const n = w * h;
  const vals: number[] = [];
  for (let i = 0; i < n; i++) vals.push((i + 1) % n);
  return vals.join(",");
}

/** A 4×4 board with the gap at the bottom-right but tiles 14 and 15
 * swapped is *unsolvable*; this builds a known *solvable* near-solved
 * board: solved except the gap is one cell left of home and tile 15 sits
 * where the gap belongs. */
function nearSolved4x4(): FifteenState {
  // Solved: 1..15,0. Move tile 15 right into the gap → gap moves left.
  return executeMove(solvedState(4, 4), { type: "move", x: 2, y: 3 });
}

// --- params -----------------------------------------------------------

describe("Fifteen params", () => {
  it("default is 4×4", () => {
    expect(defaultParams()).toEqual({ w: 4, h: 4 });
  });

  it("round-trips through encode/decode", () => {
    const cases: FifteenParams[] = [
      { w: 4, h: 4 },
      { w: 5, h: 4 },
      { w: 3, h: 6 },
    ];
    for (const p of cases) {
      expect(decodeParams(encodeParams(p, true))).toEqual(p);
    }
  });

  it("decodes a bare W as a square board, and WxH as rectangular", () => {
    expect(decodeParams("4")).toEqual({ w: 4, h: 4 });
    expect(decodeParams("5x4")).toEqual({ w: 5, h: 4 });
    expect(decodeParams("6x6")).toEqual({ w: 6, h: 6 });
  });

  it("rejects dimensions below two", () => {
    expect(validateParams({ w: 1, h: 4 }, true)).toBeTruthy();
    expect(validateParams({ w: 4, h: 1 }, true)).toBeTruthy();
    expect(validateParams({ w: 2, h: 2 }, true)).toBeNull();
  });

  it("offers the 4×4 preset", () => {
    const menu = presets();
    expect(menu.submenu.map((s) => s.params)).toContainEqual({ w: 4, h: 4 });
  });
});

// --- generation -------------------------------------------------------

describe("Fifteen generation", () => {
  it("produces a solvable, non-solved board for every seed", () => {
    const p = { w: 4, h: 4 };
    for (let s = 0; s < 40; s++) {
      const rng = randomNew(`fifteen-gen-${s}`);
      const { desc } = newDesc(p, rng);
      expect(validateDesc(p, desc)).toBeNull();
      const state = newState(p, desc);
      // Reachable from solved iff permutation parity matches gap parity.
      expect(permParity(state.tiles, state.n)).toBe(parityP(p.w, p.h, state.gapPos));
      // Never starts solved.
      expect(isCompletedTiles(state.tiles, state.n)).toBe(false);
    }
  });

  it("handles non-square and odd boards", () => {
    for (const p of [
      { w: 5, h: 4 },
      { w: 3, h: 3 },
      { w: 2, h: 2 },
    ]) {
      const rng = randomNew(`fifteen-shape-${p.w}x${p.h}`);
      const { desc } = newDesc(p, rng);
      const state = newState(p, desc);
      expect(permParity(state.tiles, state.n)).toBe(parityP(p.w, p.h, state.gapPos));
      expect(isCompletedTiles(state.tiles, state.n)).toBe(false);
    }
  });

  it("is deterministic for a fixed seed", () => {
    const p = { w: 4, h: 4 };
    const a = newDesc(p, randomNew("same-seed")).desc;
    const b = newDesc(p, randomNew("same-seed")).desc;
    expect(a).toBe(b);
  });
});

// --- desc -------------------------------------------------------------

describe("Fifteen desc codec", () => {
  it("round-trips a generated desc through newState", () => {
    const p = { w: 4, h: 4 };
    const { desc } = newDesc(p, randomNew("desc-roundtrip"));
    const state = newState(p, desc);
    expect(Array.from(state.tiles).join(",")).toBe(desc);
    expect(state.tiles[state.gapPos]).toBe(0);
  });

  it("rejects malformed descriptions", () => {
    const p = { w: 2, h: 2 };
    expect(validateDesc(p, "0,1,2")).toBeTruthy(); // too few
    expect(validateDesc(p, "0,1,2,3,0")).toBeTruthy(); // too many
    expect(validateDesc(p, "0,1,2,9")).toBeTruthy(); // out of range
    expect(validateDesc(p, "0,1,1,2")).toBeTruthy(); // duplicate
    expect(validateDesc(p, "0,1,x,2")).toBeTruthy(); // non-numeric
    expect(validateDesc(p, "0,1,2,3")).toBeNull(); // valid
  });
});

// --- slide move semantics ---------------------------------------------

describe("Fifteen slide moves", () => {
  it("shifts a whole line of tiles into the gap, one move per tile", () => {
    // Solved 4×4: gap at (3,3). Click (0,3): slide the whole bottom row
    // right, three tiles move into the gap.
    const solved = solvedState(4, 4);
    const next = executeMove(solved, { type: "move", x: 0, y: 3 });
    expect(next.gapPos).toBe(3 * 4 + 0); // gap now at (0,3)
    expect(next.moveCount).toBe(3);
    // Bottom row was 13,14,15,0 → 0,13,14,15.
    expect(Array.from(next.tiles.slice(12))).toEqual([0, 13, 14, 15]);
  });

  it("does not mutate the source state", () => {
    const solved = solvedState(4, 4);
    const before = Array.from(solved.tiles);
    executeMove(solved, { type: "move", x: 0, y: 3 });
    expect(Array.from(solved.tiles)).toEqual(before);
  });

  it("records completion when the solved arrangement is reached", () => {
    const near = nearSolved4x4(); // one slide from solved
    expect(near.completed).toBe(0);
    // Slide tile 15 back: click its cell (3,3 is the gap home? rebuild).
    const back = executeMove(near, { type: "move", x: 3, y: 3 });
    expect(isCompletedTiles(back.tiles, back.n)).toBe(true);
    expect(back.completed).toBe(back.moveCount);
    expect(status(back)).toBe("solved");
  });

  it("rejects an illegal (diagonal) move", () => {
    const solved = solvedState(4, 4);
    expect(() => executeMove(solved, { type: "move", x: 0, y: 0 })).toThrow();
  });
});

// --- solve ------------------------------------------------------------

describe("Fifteen solve", () => {
  it("snaps to the solved board and sets usedSolve", () => {
    const rng = randomNew("solve-test");
    const state = newState({ w: 4, h: 4 }, newDesc({ w: 4, h: 4 }, rng).desc);
    const result = fifteenGame.solve?.(state, state);
    expect(result?.ok).toBe(true);
    if (!result?.ok) throw new Error("expected solve");
    const solved = executeMove(state, result.move);
    expect(isCompletedTiles(solved.tiles, solved.n)).toBe(true);
    expect(solved.usedSolve).toBe(true);
    expect(solved.gapPos).toBe(solved.n - 1);
  });

  it("suppresses the completion flash after a solve", () => {
    const rng = randomNew("solve-flash");
    const state = newState({ w: 4, h: 4 }, newDesc({ w: 4, h: 4 }, rng).desc);
    const solved = executeMove(state, { type: "solve" });
    expect(fifteenGame.flashLength?.(state, solved, 1, { invertCursor: false })).toBe(
      0,
    );
  });
});

// --- input mapping ----------------------------------------------------

describe("Fifteen input", () => {
  const ui = { invertCursor: false };

  it("maps a left-click sharing one coordinate with the gap to a slide", () => {
    const solved = solvedState(4, 4); // gap at (3,3)
    const ds = fifteenGame.newDrawState?.(solved) ?? null;
    fifteenGame.setTileSize?.(ds as never, 48);
    // Click the centre of cell (0,3): same row as the gap.
    const px = 0 * 48 + 24 + 24; // coord(0)+ts/2 = border + ts/2
    const py = 3 * 48 + 24 + 24;
    const move = fifteenGame.interpretMove(
      solved,
      ui,
      ds,
      { x: px, y: py },
      LEFT_BUTTON,
    );
    expect(move).toEqual({ type: "move", x: 0, y: 3 });
  });

  it("ignores a click diagonal to the gap", () => {
    const solved = solvedState(4, 4);
    const ds = fifteenGame.newDrawState?.(solved) ?? null;
    fifteenGame.setTileSize?.(ds as never, 48);
    const px = 0 * 48 + 24 + 24; // cell (0, 0): shares neither coord
    const py = 0 * 48 + 24 + 24;
    expect(
      fifteenGame.interpretMove(solved, ui, ds, { x: px, y: py }, LEFT_BUTTON),
    ).toBeNull();
  });

  it("ignores an out-of-bounds click", () => {
    const solved = solvedState(4, 4);
    const ds = fifteenGame.newDrawState?.(solved) ?? null;
    fifteenGame.setTileSize?.(ds as never, 48);
    expect(
      fifteenGame.interpretMove(solved, ui, ds, { x: 10000, y: 10000 }, LEFT_BUTTON),
    ).toBeNull();
  });

  it("slides on a cursor key (default arrow moves a tile)", () => {
    const solved = solvedState(4, 4); // gap at (3,3)
    // Default semantics: the pressed arrow moves a *tile* in that
    // direction, so the gap moves the opposite way (flip).
    // CURSOR_UP → flips to DOWN → gap moves down, clamped at the bottom row.
    expect(
      fifteenGame.interpretMove(solved, ui, null, { x: 0, y: 0 }, CURSOR_UP),
    ).toBeNull();
    // CURSOR_LEFT → flips to RIGHT → gap moves right, clamped at x = 3.
    expect(
      fifteenGame.interpretMove(solved, ui, null, { x: 0, y: 0 }, CURSOR_LEFT),
    ).toBeNull();
    // CURSOR_DOWN → flips to UP → gap moves up to (3,2): legal.
    expect(
      fifteenGame.interpretMove(solved, ui, null, { x: 0, y: 0 }, CURSOR_DOWN),
    ).toEqual({
      type: "move",
      x: 3,
      y: 2,
    });
  });
});

// --- hint -------------------------------------------------------------

describe("Fifteen hint", () => {
  it("returns a full multi-step plan that solves the board", () => {
    const p = { w: 4, h: 4 };
    let state = newState(p, newDesc(p, randomNew("hint-plan")).desc);
    const result = fifteenGame.hint?.(state);
    expect(result?.ok).toBe(true);
    if (!result?.ok) throw new Error("expected a plan");
    // Like Sixteen, the plan is the whole solution, not a single step.
    expect(result.steps.length).toBeGreaterThan(1);
    expect(result.steps[0].explanation).toMatch(/^Slide tile \d+ into the space$/);
    // Following every step reaches the solved board.
    for (const step of result.steps) state = executeMove(state, step.move);
    expect(isCompletedTiles(state.tiles, state.n)).toBe(true);
  });

  it("reports no plan on an already-solved board", () => {
    expect(fifteenGame.hint?.(solvedState(4, 4))).toEqual({
      ok: false,
      error: "Already solved",
    });
  });

  it("hintKeepTrack completes the step on the hinted move and drops it otherwise", () => {
    const p = { w: 4, h: 4 };
    const state = newState(p, newDesc(p, randomNew("hint-track")).desc);
    const result = fifteenGame.hint?.(state);
    if (!result?.ok) throw new Error("expected a plan");
    const step = result.steps[0];
    // Making exactly the hinted move completes the step (plan advances).
    expect(fifteenGame.hintKeepTrack?.(step.move, step, state)).toBe("completed");
    // A different legal slide (toward a cell sharing the other gap axis)
    // deviates from the plan and drops it.
    const gx = state.gapPos % p.w;
    const gy = Math.floor(state.gapPos / p.w);
    const hinted = step.move.type === "move" ? step.move : null;
    // Pick a legal move that differs from the hinted one: slide the gap
    // the other way along whichever axis the hint did not use.
    const other: FifteenMove =
      hinted && hinted.y === gy
        ? { type: "move", x: gx, y: gy === 0 ? gy + 1 : gy - 1 } // vertical instead
        : { type: "move", x: gx === 0 ? gx + 1 : gx - 1, y: gy }; // horizontal instead
    const verdict = fifteenGame.hintKeepTrack?.(other, step, state);
    expect(verdict).toBe("off");
  });
});

// --- capabilities -----------------------------------------------------

describe("Fifteen capabilities", () => {
  it("reports the expected Game flags", () => {
    expect(fifteenGame.id).toBe("fifteen");
    expect(fifteenGame.wantsStatusbar).toBe(true);
    expect(fifteenGame.isTimed).toBe(false);
    expect(fifteenGame.canSolve).toBe(true);
    expect(fifteenGame.canFormatAsText).toBe(true);
    // No mistake-checking: every reachable position is legal.
    expect(fifteenGame.findMistakes).toBeUndefined();
  });

  it("formats as text with the gap blank", () => {
    const text = textFormat(solvedState(2, 2));
    // Solved 2×2: 1 2 / 3 _.
    expect(text.split("\n").length).toBe(2);
    expect(text).toContain("1");
    expect(text).toContain("3");
  });
});
