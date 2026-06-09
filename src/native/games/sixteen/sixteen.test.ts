import { describe, expect, it } from "vitest";
import type { ActiveHint, GameDrawing } from "../../engine/index.ts";
import { randomNew } from "../../random/index.ts";
import { executeMove, type SixteenHintHighlights, sixteenGame } from "./index.ts";
import {
  decodeParams,
  defaultParams,
  deserialiseMove,
  encodeParams,
  isCompleted,
  newDesc,
  newState,
  presets,
  type SixteenMove,
  type SixteenParams,
  type SixteenState,
  serialiseMove,
  status,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

// --- helpers ----------------------------------------------------------

function solvedState(w: number, h: number): SixteenState {
  const n = w * h;
  const tiles = new Int32Array(n);
  for (let i = 0; i < n; i++) tiles[i] = i + 1;
  return {
    w,
    h,
    n,
    tiles,
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
  it("returns 5 colours from the game (including hint)", () => {
    const bg: [number, number, number] = [0.9, 0.9, 0.9];
    const palette = sixteenGame.colours(bg);
    expect(palette).toHaveLength(5);
  });
});

// --- hint heuristic -------------------------------------------------------

describe("Sixteen hint", () => {
  it("returns an error for a solved state", () => {
    const s = solvedState(4, 4);
    const result = sixteenGame.hint?.(s);
    expect(result?.ok).toBe(false);
    if (result && !result.ok) expect(result.error).toBe("Already solved");
  });

  it("returns a valid slide move for an unsolved state", () => {
    const rng = randomNew("hint-test");
    const { desc } = newDesc(defaultParams(), rng);
    const s = newState(defaultParams(), desc);
    const result = sixteenGame.hint?.(s);
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;
    expect(result.move.type).toBe("slide");
    expect(result.explanation.length).toBeGreaterThan(0);
  });

  it("the hinted move is a legal move that changes the state", () => {
    const rng = randomNew("hint-legal");
    const { desc } = newDesc(defaultParams(), rng);
    const s = newState(defaultParams(), desc);
    const result = sixteenGame.hint?.(s);
    if (!result?.ok) return;
    const next = executeMove(s, result.move);
    // The state should have changed (tiles rearranged).
    let changed = false;
    for (let i = 0; i < s.n; i++) {
      if (s.tiles[i] !== next.tiles[i]) {
        changed = true;
        break;
      }
    }
    expect(changed).toBe(true);
  });

  it("the explanation mentions the tile and target location", () => {
    const rng = randomNew("hint-explanation");
    const { desc } = newDesc(defaultParams(), rng);
    const s = newState(defaultParams(), desc);
    const result = sixteenGame.hint?.(s);
    if (!result?.ok) return;
    // Explanation format: "Move tile T to row R" or "Move tile T to column C"
    expect(result.explanation).toMatch(/Move tile \d+ to (row|column) \d+/);
  });

  it("the hinted move actually improves the state (net tiles-closer > 0)", () => {
    const rng = randomNew("hint-improves");
    const { desc } = newDesc(defaultParams(), rng);
    const s = newState(defaultParams(), desc);
    const result = sixteenGame.hint?.(s);
    if (!result?.ok) return;
    const next = executeMove(s, result.move);
    // Count total toroidal distance for all tiles before and after.
    const dist = (st: SixteenState) => {
      let total = 0;
      for (let i = 0; i < st.n; i++) {
        const tile = st.tiles[i];
        const targetR = Math.floor((tile - 1) / st.w);
        const targetC = (tile - 1) % st.w;
        const curR = Math.floor(i / st.w);
        const curC = i % st.w;
        const dr = Math.abs(curR - targetR);
        const dc = Math.abs(curC - targetC);
        total += Math.min(dr, st.h - dr) + Math.min(dc, st.w - dc);
      }
      return total;
    };
    expect(dist(next)).toBeLessThan(dist(s));
  });

  it("returns highlights with the tile number and target position", () => {
    const rng = randomNew("hint-highlights");
    const { desc } = newDesc(defaultParams(), rng);
    const s = newState(defaultParams(), desc);
    const result = sixteenGame.hint?.(s);
    expect(result?.ok).toBe(true);
    if (result?.ok) {
      const hl = result.highlights as SixteenHintHighlights;
      expect(hl).toBeDefined();
      expect(hl.tile).toBeGreaterThan(0);
      expect(hl.tile).toBeLessThanOrEqual(s.n);

      const row = Math.floor(hl.targetPos / s.w);
      const col = hl.targetPos % s.w;
      const expectedRow = Math.floor((hl.tile - 1) / s.w);
      const expectedCol = (hl.tile - 1) % s.w;

      if (result.move.type === "slide") {
        const move = result.move;
        if (move.axis === "row") {
          expect(row).toBe(move.index);
          expect(col).toBe(expectedCol);
        } else {
          expect(row).toBe(expectedRow);
          expect(col).toBe(move.index);
        }
      }
    }
  });

  it("prioritizes the lowest-numbered out-of-place tile", () => {
    // Construct a 4×4 state where tile 1 is out of place.
    // Place tile 1 at position (0,1) — one column away from its target (0,0).
    // Place tile 5 at position (1,0) — one row away from its target (1,0)... wait, that IS its target.
    // Let's make tile 2 at position (0,2) — two columns away.
    // A row-0 slide right moves tile 1 closer (benefit 1) but also moves tile 2 farther (cost 1).
    // Net benefit = 0. But the heuristic should still prefer it because tile 1
    // is the lowest out-of-place tile.
    const w = 4,
      h = 4,
      n = 16;
    const tiles = new Int32Array(n);
    for (let i = 0; i < n; i++) tiles[i] = i + 1; // solved
    // Swap tile 1 and tile 2: tile 1 at position 1, tile 2 at position 0.
    tiles[0] = 2;
    tiles[1] = 1;
    const s: SixteenState = {
      w,
      h,
      n,
      tiles,
      completed: 0,
      usedSolve: false,
      moveCount: 0,
      moveTarget: 0,
      lastMovementSense: 0,
    };
    const result = sixteenGame.hint?.(s);
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;
    // The hint should mention tile 1 or 2 (the lowest out-of-place tiles on row 0).
    expect(result.explanation).toMatch(/tile (1|2)/);
  });

  it("can solve a puzzle using sequential hints", () => {
    const p = { w: 3, h: 3, movetarget: 3 };
    const rng = randomNew("hint-solve-test");
    const { desc } = newDesc(p, rng);
    let s = newState(p, desc);

    let steps = 0;
    const maxSteps = 50;
    while (s.completed === 0 && steps < maxSteps) {
      const result = sixteenGame.hint?.(s);
      if (!result?.ok) break;
      s = executeMove(s, result.move);
      steps++;
    }
    expect(s.completed).toBeGreaterThan(0);
  });

  it("can solve a 4x4 puzzle using sequential hints", () => {
    const p = { w: 4, h: 4, movetarget: 0 };
    const rng = randomNew("hint-solve-test-4x4");
    const { desc } = newDesc(p, rng);
    let s = newState(p, desc);

    let steps = 0;
    const maxSteps = 100;
    while (s.completed === 0 && steps < maxSteps) {
      const result = sixteenGame.hint?.(s);
      if (!result?.ok) {
        console.log(
          "Failed at step",
          steps,
          "with error:",
          result?.error,
          "board:",
          s.tiles.join(","),
        );
        break;
      }
      s = executeMove(s, result.move);
      steps++;
    }
    expect(s.completed).toBeGreaterThan(0);
  });

  describe("backtracking and oscillation prevention", () => {
    it("never recommends immediately undoing or contradicting a slide on the same axis/index", () => {
      const s0 = solvedState(4, 4);

      // 1. If user does slide right by 1, next hint must not be slide left by 1.
      const s1 = executeMove(s0, { type: "slide", axis: "row", index: 0, delta: 1 });
      const hint1 = sixteenGame.hint?.(s1);
      expect(hint1?.ok).toBe(true);
      if (hint1?.ok && hint1.move.type === "slide") {
        expect(
          hint1.move.axis === "row" &&
            hint1.move.index === 0 &&
            hint1.move.delta === -1,
        ).toBe(false);
      }

      // 2. If user does slide right by 2 (e.g. via dragging or half-grid shift), next hint must not be ANY slide on row 0.
      const s2 = executeMove(s0, { type: "slide", axis: "row", index: 0, delta: 2 });
      const hint2 = sixteenGame.hint?.(s2);
      expect(hint2?.ok).toBe(true);
      if (hint2?.ok && hint2.move.type === "slide") {
        expect(hint2.move.axis === "row" && hint2.move.index === 0).toBe(false);
      }
    });
  });

  it("handles the edge case of tile 7 and 8 under column slide of index 3", () => {
    const tiles = new Int32Array([
      1, 2, 14, 8, 5, 6, 15, 7, 9, 10, 11, 12, 4, 13, 3, 16,
    ]);
    const s: SixteenState = {
      w: 4,
      h: 4,
      n: 16,
      tiles,
      completed: 0,
      usedSolve: false,
      moveCount: 16,
      moveTarget: 0,
      lastMovementSense: 0,
    };
    const result = sixteenGame.hint?.(s);
    expect(result?.ok).toBe(true);
  });

  it("uses the immediate destination in hint explanation when tile is already in its target row/column", () => {
    // Row 1 has tile 7 (correct column 1, wrong row 3), 2 (correct column 2, wrong row 1), 6 (solved).
    // All tiles on Row 1 are in their correct column!
    // So if the recommended move is to slide Row 1, any selected tile will be in its correct column already.
    const tiles = new Int32Array([4, 8, 3, 7, 2, 6, 1, 5, 9]);
    const s: SixteenState = {
      w: 3,
      h: 3,
      n: 9,
      tiles,
      completed: 0,
      usedSolve: false,
      moveCount: 0,
      moveTarget: 0,
      lastMovementSense: 0,
    };
    const result = sixteenGame.hint?.(s);
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;

    // If the chosen move is a row slide on row 0 (e.g. index 0) and the chosen tile is 2 or 3:
    // They are already in their correct column (column 2 and 3).
    // So the explanation must use their immediate destination, NOT their correct column!
    if (result.move.type === "slide" && result.move.axis === "row") {
      const hl = result.highlights as SixteenHintHighlights;
      const tile = hl?.tile;
      if (tile === 2) {
        // Tile 2 is at col 2 (index 1). Shifting left/right.
        // It must NOT say "Move tile 2 to column 2".
        expect(result.explanation).not.toContain("column 2");
      } else if (tile === 3) {
        // Tile 3 is at col 3 (index 2). Shifting left/right.
        // It must NOT say "Move tile 3 to column 3".
        expect(result.explanation).not.toContain("column 3");
      }
    }
  });
});

describe("Sixteen hint rendering", () => {
  function recordingDrawing() {
    const ops: Array<{ op: string; colour?: number }> = [];
    const rec = (op: string, colour?: number) => ops.push({ op, colour });
    const dr: GameDrawing = {
      startDraw: () => rec("startDraw"),
      endDraw: () => rec("endDraw"),
      drawUpdate: () => rec("drawUpdate"),
      clip: () => rec("clip"),
      unclip: () => rec("unclip"),
      drawRect: (_r, c) => rec("drawRect", c),
      drawLine: (_a, _b, c) => rec("drawLine", c),
      drawPolygon: (_p, f) => rec("drawPolygon", f),
      drawCircle: (_p, _r, f) => rec("drawCircle", f),
      drawText: (_p, _o, c) => rec("drawText", c),
      blitterNew: () => ({}),
      blitterFree: () => rec("blitterFree"),
      blitterSave: () => rec("blitterSave"),
      blitterLoad: () => rec("blitterLoad"),
    };
    return { dr, ops };
  }

  it("highlights hint tiles and arrow in COL_HINT", () => {
    const rng = randomNew("render-test");
    const { desc } = newDesc(defaultParams(), rng);
    const s = newState(defaultParams(), desc);
    const result = sixteenGame.hint?.(s);
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;

    const ui = sixteenGame.newUi(s);
    const ds = sixteenGame.newDrawState?.(s);
    expect(ds).toBeDefined();
    if (!ds) return;
    sixteenGame.setTileSize?.(ds, 32);

    const { dr, ops } = recordingDrawing();
    sixteenGame.redraw?.(dr, ds, null, s, 1, ui, 0, 0, result);

    // We should see drawTile (using COL_HINT rect/polygon fill) or drawHintBorder (drawRect)
    // and drawArrow (drawPolygon) using COL_HINT (which is color index 4).
    const COL_HINT_INDEX = 4;

    // Check for hint highlight operations
    const hintOps = ops.filter((o) => o.colour === COL_HINT_INDEX);
    expect(hintOps.length).toBeGreaterThan(0);
  });

  it("supports generating 2-move hints and double-target highlights", () => {
    const rng = randomNew("two-move-hint");
    const { desc } = newDesc(defaultParams(), rng);
    const s = newState(defaultParams(), desc);
    const result = sixteenGame.hint?.(s);
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;

    if (result.explanation.includes("then to")) {
      expect(result.explanation).toMatch(
        /Move tile \d+ to (row|column) \d+, then to (row|column) \d+/,
      );
      const hl = result.highlights as SixteenHintHighlights;
      expect(hl.ultimatePos).toBeDefined();
      expect(hl.ultimatePos).not.toBe(hl.targetPos);
    }
  });
});

describe("Sixteen hint track and direction fixes", () => {
  function recordingDrawing() {
    const ops: Array<{ op: string; colour?: number }> = [];
    const rec = (op: string, colour?: number) => ops.push({ op, colour });
    const dr: GameDrawing = {
      startDraw: () => rec("startDraw"),
      endDraw: () => rec("endDraw"),
      drawUpdate: () => rec("drawUpdate"),
      clip: () => rec("clip"),
      unclip: () => rec("unclip"),
      drawRect: (_r, c) => rec("drawRect", c),
      drawLine: (_a, _b, c) => rec("drawLine", c),
      drawPolygon: (_p, f) => rec("drawPolygon", f),
      drawCircle: (_p, _r, f) => rec("drawCircle", f),
      drawText: (_p, _o, c) => rec("drawText", c),
      blitterNew: () => ({}),
      blitterFree: () => rec("blitterFree"),
      blitterSave: () => rec("blitterSave"),
      blitterLoad: () => rec("blitterLoad"),
    };
    return { dr, ops };
  }

  it("always overrides arrow direction to point in-grid (avoiding wrapping arrow)", () => {
    // Case 1: tile 1 at col 0, target at col 2.
    // Recommended move was left (delta: -1), but in-grid direction is right (delta: 1).
    const s1 = solvedState(3, 3); // Tile 1 is at index 0 (col 0, row 0).
    const ui1 = sixteenGame.newUi(s1);
    const ds1 = sixteenGame.newDrawState?.(s1);
    expect(ds1).toBeDefined();
    if (!ds1) return;
    sixteenGame.setTileSize?.(ds1, 32);

    const activeHint1: ActiveHint<SixteenMove, SixteenHintHighlights> = {
      move: { type: "slide", axis: "row", index: 0, delta: -1 },
      explanation: "",
      highlights: {
        tile: 1,
        targetPos: 2, // col 2, row 0
      },
    };

    const { dr: dr1 } = recordingDrawing();
    sixteenGame.redraw?.(dr1, ds1, null, s1, 1, ui1, 0, 0, activeHint1);
    // Since curCol (0) < targetCol (2), it should point right (ds1.hintArrowX = 3)
    const ds1Typed = ds1 as unknown as {
      hintArrowX: number | null;
      hintArrowY: number | null;
    };
    expect(ds1Typed.hintArrowX).toBe(3);
    expect(ds1Typed.hintArrowY).toBe(0);

    // Case 2: tile 1 at col 2, target at col 0.
    // Recommended move was right (delta: 1), but in-grid direction is left (delta: -1).
    const s2 = solvedState(3, 3);
    // Move tile 1 to index 2 (col 2, row 0)
    s2.tiles[0] = 3;
    s2.tiles[1] = 2;
    s2.tiles[2] = 1;

    const ui2 = sixteenGame.newUi(s2);
    const ds2 = sixteenGame.newDrawState?.(s2);
    expect(ds2).toBeDefined();
    if (!ds2) return;
    sixteenGame.setTileSize?.(ds2, 32);

    const activeHint2: ActiveHint<SixteenMove, SixteenHintHighlights> = {
      move: { type: "slide", axis: "row", index: 0, delta: 1 },
      explanation: "",
      highlights: {
        tile: 1,
        targetPos: 0, // col 0, row 0
      },
    };

    const { dr: dr2 } = recordingDrawing();
    sixteenGame.redraw?.(dr2, ds2, null, s2, 1, ui2, 0, 0, activeHint2);
    // Since curCol (2) > targetCol (0), it should point left (ds2.hintArrowX = -1)
    const ds2Typed = ds2 as unknown as {
      hintArrowX: number | null;
      hintArrowY: number | null;
    };
    expect(ds2Typed.hintArrowX).toBe(-1);
    expect(ds2Typed.hintArrowY).toBe(0);
  });

  it("hintKeepTrack determines whether to keep the active hint highlight", () => {
    const s = solvedState(3, 3); // Tile 1 is at index 0 (col 0, row 0).
    const h: ActiveHint<SixteenMove, SixteenHintHighlights> = {
      move: { type: "slide", axis: "row", index: 0, delta: 1 },
      explanation: "",
      highlights: {
        tile: 1,
        targetPos: 2,
      },
    };

    // Case 1: Same axis/row but move does not reach target. Should keep hint (true).
    const m1: SixteenMove = { type: "slide", axis: "row", index: 0, delta: 1 };
    const keep1 = sixteenGame.hintKeepTrack?.(m1, h, s);
    expect(keep1).toBe(true);

    // Case 2: Same axis/row but move reaches target (e.g. from pos 1 to pos 2). Should clear (false).
    const sWithTileAt1 = solvedState(3, 3);
    sWithTileAt1.tiles[0] = 2;
    sWithTileAt1.tiles[1] = 1; // Tile 1 is at index 1
    const m2: SixteenMove = { type: "slide", axis: "row", index: 0, delta: 1 };
    const keep2 = sixteenGame.hintKeepTrack?.(m2, h, sWithTileAt1);
    expect(keep2).toBe(false);

    // Case 3: Different axis/index (unrelated move). Should clear (false).
    const m3: SixteenMove = { type: "slide", axis: "row", index: 1, delta: 1 };
    const keep3 = sixteenGame.hintKeepTrack?.(m3, h, s);
    expect(keep3).toBe(false);

    // Case 4: 2D move intermediate target reached. Should transition and keep hint (true).
    const s2d = solvedState(3, 3); // Tile 1 is at index 0 (col 0, row 0).
    const h2d: ActiveHint<SixteenMove, SixteenHintHighlights> = {
      move: { type: "slide", axis: "row", index: 0, delta: 1 },
      explanation: "Initial explanation",
      highlights: {
        tile: 1,
        targetPos: 1,
        ultimatePos: 4, // intermediate is (1, 0) = 1, ultimate is (1, 1) = 4 on a 3x3
        secondMove: { type: "slide", axis: "column", index: 1, delta: 1 },
      },
    };
    const m4: SixteenMove = { type: "slide", axis: "row", index: 0, delta: 1 };
    const keep4 = sixteenGame.hintKeepTrack?.(m4, h2d, s2d);
    expect(keep4).toBe(true);
    expect(h2d.move).toEqual({ type: "slide", axis: "column", index: 1, delta: 1 });
    expect(h2d.highlights?.targetPos).toBe(4);
    expect(h2d.highlights?.ultimatePos).toBeUndefined();
    expect(h2d.highlights?.secondMove).toBeUndefined();
    expect(h2d.explanation).toContain("Move tile 1 to row 2, column 2");
  });
});
