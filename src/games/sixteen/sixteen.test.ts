import { describe, expect, it } from "vitest";
import { raisedBevelWidth } from "../../engine/draw.ts";
import { ALREADY_SOLVED } from "../../engine/hint-refusal.ts";
import type { GameDrawing, HintStep } from "../../engine/index.ts";
import { randomNew } from "../../engine/random/index.ts";
import { opsOfKind, RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import { DEFAULT_BACKGROUND } from "../../engine/testing/render-scenario.ts";
import { itSlow } from "../../engine/testing/slow.ts";
import { executeMove, sixteenGame } from "./index.ts";
import type { SixteenHintHighlights } from "./render.ts";
import {
  decodeParams,
  defaultParams,
  encodeParams,
  isCompleted,
  newDesc,
  newState,
  presets,
  type SixteenMove,
  type SixteenParams,
  type SixteenState,
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
    cheated: false,
    moveCount: 0,
    moveTarget: 0,
    lastMovementSense: 0,
  };
}

/** A `GameDrawing` that records each call's name and color. */
function recordingDrawing() {
  const ops: Array<{ op: string; color?: number }> = [];
  const rec = (op: string, color?: number) => ops.push({ op, color });
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

  it("decodes a bare square form to w === h", () => {
    // Upstream's `w = h = atoi(s)`: a bare number is a square board.
    expect(decodeParams("4")).toEqual({ w: 4, h: 4, movetarget: 0 });
    expect(decodeParams("6")).toEqual({ w: 6, h: 6, movetarget: 0 });
  });

  it("decodes the rectangular and movetarget forms unchanged", () => {
    expect(decodeParams("4x4")).toEqual({ w: 4, h: 4, movetarget: 0 });
    expect(decodeParams("5x4")).toEqual({ w: 5, h: 4, movetarget: 0 });
    expect(decodeParams("4x4m10")).toEqual({ w: 4, h: 4, movetarget: 10 });
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
    expect(result.cheated).toBe(true);
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

// --- colors ----------------------------------------------------------

describe("Sixteen colors", () => {
  it("returns 5 colors from the game (including hint)", () => {
    const bg: [number, number, number] = [0.9, 0.9, 0.9];
    const palette = sixteenGame.colors(bg);
    expect(palette).toHaveLength(5);
  });
});

// --- hint heuristic -------------------------------------------------------

describe("Sixteen hint", () => {
  it("returns an error for a solved state", () => {
    const s = solvedState(4, 4);
    const result = sixteenGame.hint?.(s);
    expect(result?.ok).toBe(false);
    if (result && !result.ok) expect(result.error).toBe(ALREADY_SOLVED);
  });

  it("returns a non-empty plan of slide moves for an unsolved state", () => {
    const rng = randomNew("hint-test");
    const { desc } = newDesc(defaultParams(), rng);
    const s = newState(defaultParams(), desc);
    const result = sixteenGame.hint?.(s);
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;
    expect(result.steps.length).toBeGreaterThan(0);
    for (const step of result.steps) {
      expect(step.move.type).toBe("slide");
      expect(step.explanation.length).toBeGreaterThan(0);
    }
  });

  it("the hinted move is a legal move that changes the state", () => {
    const rng = randomNew("hint-legal");
    const { desc } = newDesc(defaultParams(), rng);
    const s = newState(defaultParams(), desc);
    const result = sixteenGame.hint?.(s);
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;
    const next = executeMove(s, result.steps[0].move);
    expect(Array.from(next.tiles)).not.toEqual(Array.from(s.tiles));
  });

  it("the explanation mentions the tile and target location", () => {
    const rng = randomNew("hint-explanation");
    const { desc } = newDesc(defaultParams(), rng);
    const s = newState(defaultParams(), desc);
    const result = sixteenGame.hint?.(s);
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;
    // Format: "Working on tile T: move it to row R" / "… to column C".
    expect(result.steps[0].explanation).toMatch(
      /^Working on tile \d+: move it to (row|column) \d+/,
    );
  });

  it("the hinted move actually improves the state (net tiles-closer > 0)", () => {
    const rng = randomNew("hint-improves");
    const { desc } = newDesc(defaultParams(), rng);
    const s = newState(defaultParams(), desc);
    const result = sixteenGame.hint?.(s);
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;
    const next = executeMove(s, result.steps[0].move);
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
      const step = result.steps[0];
      const hl = step.highlights as SixteenHintHighlights;
      expect(hl).toBeDefined();
      expect(hl.tile).toBeGreaterThan(0);
      expect(hl.tile).toBeLessThanOrEqual(s.n);

      const row = Math.floor(hl.targetPos / s.w);
      const col = hl.targetPos % s.w;

      if (step.move.type === "slide") {
        const move = step.move;
        // The target is on the moved line…
        if (move.axis === "row") {
          expect(row).toBe(move.index);
        } else {
          expect(col).toBe(move.index);
        }
        // …and is exactly where the hinted move lands the tile.
        const next = executeMove(s, step.move);
        expect(next.tiles.indexOf(hl.tile)).toBe(hl.targetPos);
      }
    }
  });

  it("solves the board that previously cycled tile 2 back and forth", () => {
    // A plan in single-step slides, followed by hints that execute whole ones,
    // leaves the plan on every executed hint: on this board auto-play then
    // loops through the same four states for ever. Planning in full slides is
    // what prevents it.
    let s: SixteenState = {
      ...solvedState(4, 4),
      tiles: new Int32Array([3, 4, 1, 8, 5, 6, 2, 7, 9, 10, 11, 12, 13, 14, 15, 16]),
    };
    for (let round = 0; round < 10 && s.completed === 0; round++) {
      const result = sixteenGame.hint?.(s);
      expect(result?.ok).toBe(true);
      if (!result?.ok) return;
      for (const step of result.steps) s = executeMove(s, step.move);
    }
    expect(s.completed).toBeGreaterThan(0);
  });

  it("prioritizes the lowest-numbered out-of-place tile", () => {
    // Row 0 shifted right by one step: 4, 1, 2, 3, every tile on it out of place.
    const s: SixteenState = {
      ...solvedState(4, 4),
      tiles: new Int32Array([4, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]),
    };
    const result = sixteenGame.hint?.(s);
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;
    // The hint should recommend sliding row 0, prioritizing tile 1 (the lowest out-of-place tile on row 0).
    expect(result.steps[0].explanation).toMatch(/tile 1/);
  });

  it("never highlights a tile off the moved line or a target on the tile itself", () => {
    // Property test over full plan-following playthroughs: every step of
    // every plan must be geometrically coherent against the board it
    // applies to — the highlighted tile sits on the row/column being
    // slid, neither the (intermediate) target nor the ultimate target is
    // the tile's own current cell, and applying the step's move lands
    // the tile exactly on its highlighted target. Plans are re-requested
    // only on exhaustion.
    for (const [w, h, seeds] of [
      [3, 3, ["hint-geom-a", "hint-geom-b"]],
      [4, 4, ["hint-geom-c", "hint-geom-d"]],
    ] as const) {
      for (const seed of seeds) {
        const p = { w, h, movetarget: 0 };
        const { desc } = newDesc(p, randomNew(seed));
        let s = newState(p, desc);
        for (let round = 0; round < 150 && s.completed === 0; round++) {
          const result = sixteenGame.hint?.(s);
          if (!result?.ok) break;
          for (const step of result.steps) {
            const hl = step.highlights as SixteenHintHighlights;
            const cur = s.tiles.indexOf(hl.tile);
            expect(cur).toBeGreaterThanOrEqual(0);
            if (step.move.type === "slide") {
              const onLine =
                step.move.axis === "row"
                  ? Math.floor(cur / w) === step.move.index
                  : cur % w === step.move.index;
              expect(onLine).toBe(true);
            }
            expect(hl.targetPos).not.toBe(cur);
            if (hl.ultimatePos !== undefined) expect(hl.ultimatePos).not.toBe(cur);
            s = executeMove(s, step.move);
            // The step's move is the full slide its narration describes:
            // applying it lands the tile exactly on the highlighted target.
            expect(s.tiles.indexOf(hl.tile)).toBe(hl.targetPos);
          }
        }
        expect(s.completed).toBeGreaterThan(0);
      }
    }
  });

  it("solves the two-swap 5x5 endgame that previously halted auto-hint", () => {
    // Tiles 1↔6 and 16↔20 swapped, everything else solved. Every single slide
    // makes the distance heuristic worse (a strict local minimum ~8 plies
    // deep), so a forward search finds nothing and auto-play halts; the exact
    // bidirectional search crosses the hill.
    let s: SixteenState = {
      ...solvedState(5, 5),
      tiles: new Int32Array([
        6, 2, 3, 4, 5, 1, 7, 8, 9, 10, 11, 12, 13, 14, 15, 20, 17, 18, 19, 16, 21, 22,
        23, 24, 25,
      ]),
    };
    const result = sixteenGame.hint?.(s);
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;
    // Only the exact bidirectional search can cross this hill, so a plan that
    // reaches the solved board is proof it ran and succeeded — which is the
    // thing worth asserting, and it needs no flag to say so.
    for (const step of result.steps) s = executeMove(s, step.move);
    expect(s.completed).toBeGreaterThan(0);
    // The exact bidirectional search over ~1.5M states is slow; the assertions
    // above are the guarantee, never the clock. Ceiling: vitest.config.ts.
  });

  /* ---------------------------------------------------------------------
   * The deep-search walks: `npm run test:slow -- src/games/sixteen`.
   *
   * These two were 73% of this file, which alone was 109 s CPU — the most
   * expensive in the collection (measured 2026-09-09). Each walks a
   * deliberately pathological 5×5 to solved, recomputing a full exact search
   * after every move. The Sixteen hint is not expected to change again (owner
   * decision), so they are deferred, not deleted: run the command above when
   * anything under `engine/slide-planner.ts` or this game's heuristic moves.
   *
   * **What the gate still checks, on every commit.** Real 5×5 hint coverage:
   * "solves the two-swap 5x5 endgame that previously halted auto-hint" drives
   * a board only the exact bidirectional search can cross, and "recomputing
   * after every move still lands on the same board, one move nearer" walks it
   * with a fresh search per move, which is the recompute-stability property.
   * Both are seconds, not minutes.
   *
   * **What the gate gives up.** The *tangle* term is priced only above
   * `TANGLES_IN_REACH` (2), and the boards the gate keeps sit at or below it,
   * so a regression in the tangle measure is caught only in the slow tier.
   * Verified: zeroing `TANGLE_COST` turns the deferred test below red and
   * leaves the retained pair green.
   * ------------------------------------------------------------------- */

  itSlow(
    "finds the way home from the swapped-pair endgames that used to strand it",
    () => {
      // **The boards a hint without `deepSearch` gives up on**, and often:
      // walking forty games of each preset one recomputed hint at a time, 5×5
      // stopped on five of them and 5×4 on twelve, each perfectly solvable. Every
      // one has this shape — one or two pairs of tiles sitting in each other's
      // cells, a strict local minimum of the distance measure (every slide makes
      // it worse), nine moves from finished while looking like two.
      //
      // Nine is one past what a search that stores every board it visits can
      // afford here, so these are the boards `deepSearch` exists for. **The plan
      // length is the assertion that says so**: the state-bounded search never
      // returns more than eight moves at this size, so a nine-move plan can only
      // have come from the deep search. A weaker check — that a plan came back at
      // all — would go on passing if the deep search were quietly disabled and the
      // board happened to be reachable another way.
      const cases: { label: string; w: number; h: number; tiles: number[] }[] = [
        {
          label: "5×4, one swapped pair",
          w: 5,
          h: 4,
          // biome-ignore format: keep the 5×4 grid readable.
          tiles: [
          1, 2, 3, 4, 5,
          6, 7, 8, 9, 10,
          11, 12, 14, 13, 15,
          16, 17, 18, 19, 20,
        ],
        },
        {
          label: "5×5, two swapped pairs",
          w: 5,
          h: 5,
          // biome-ignore format: keep the 5×5 grid readable.
          tiles: [
          1, 2, 3, 4, 5,
          6, 7, 8, 9, 15,
          11, 12, 13, 14, 10,
          16, 18, 17, 19, 20,
          21, 22, 23, 24, 25,
        ],
        },
      ];

      for (const { label, w, h, tiles } of cases) {
        const state: SixteenState = {
          ...solvedState(w, h),
          tiles: new Int32Array(tiles),
        };
        const result = sixteenGame.hint?.(state);
        expect(result?.ok, `${label}: the hint gave up`).toBe(true);
        if (!result?.ok) continue;
        expect(
          result.steps.length,
          `${label}: a plan this short is within the state-bounded search's reach, so it does not exercise the deep search`,
        ).toBeGreaterThan(8);
        let board = state;
        for (const step of result.steps) board = executeMove(board, step.move);
        expect(
          board.completed,
          `${label}: the plan does not finish the board`,
        ).toBeGreaterThan(0);
      }
    },
  );

  itSlow("finds the way home from the tangled boards the searches cannot reach", () => {
    // **A board a player reaches by following thirty-three hints, and the class
    // around it.** A *tangle* is a non-trivial cycle of the tile permutation —
    // two tiles in each other's cells, three rotating among themselves. Travel
    // distance prices one at the couple of squares it looks like and it is
    // really nine moves, so a board made of several is a strict local minimum a
    // dozen moves from finished: past the exact search (eight), past the deep
    // search (nine), and unclimbable by a fallback steered by travel alone.
    //
    // **The assertion is the walk, not the plan.** What a player experiences is
    // one recomputed hint at a time, and a plan that comes back is worth nothing
    // if the next recompute sends the board back where it came from — which a
    // measure consulted only where the blunt one is stuck does, for 400 moves
    // without solving, because consecutive recomputes steer by different
    // measures. Walking to solved is what says the measure is stable, and no
    // assertion on a single plan can.
    //
    // **Every board here is an *even* permutation, and that is load-bearing.**
    // On a 5×5 board every slide is a 5-cycle, so odd permutations are
    // unreachable and unsolvable: a three-swap board built as an obvious test
    // case looks exactly like this class and can never be finished, which is a
    // way to convict the hint of a defect it does not have.
    const cases: { label: string; desc: string; maxMoves: number }[] = [
      {
        label: "four tangles — the board the hint refused on",
        desc: "1,2,3,4,5,6,8,7,9,10,15,12,13,14,11,16,17,19,18,20,22,21,23,24,25",
        maxMoves: 40,
      },
      {
        label: "three tangles — two swaps and a 3-cycle",
        desc: "1,2,3,4,5,6,8,7,9,10,15,12,13,14,11,16,17,20,18,19,21,22,23,24,25",
        maxMoves: 40,
      },
      {
        label: "five tangles — the refused board plus a 3-cycle",
        desc: "3,1,2,4,5,6,8,7,9,10,15,12,13,14,11,16,17,19,18,20,22,21,23,24,25",
        maxMoves: 60,
      },
    ];

    for (const { label, desc, maxMoves } of cases) {
      let state = newState({ w: 5, h: 5, movetarget: 0 }, desc);
      let moves = 0;
      for (; moves < maxMoves; moves++) {
        if (state.completed > 0) break;
        const res = sixteenGame.hint?.(state);
        expect(res?.ok, `${label}: the hint gave up after ${moves} moves`).toBe(true);
        if (!res?.ok) return;
        state = executeMove(state, res.steps[0].move);
      }
      expect(
        state.completed,
        `${label}: following recomputed hints did not finish in ${maxMoves} moves`,
      ).toBeGreaterThan(0);
    }
  });

  it("recomputing after every move still lands on the same board, one move nearer", () => {
    // The property the plan above only *displays*: a player who re-asks after
    // every move gets a fresh search each time, and those searches must agree
    // about where they are going. They do because each returns a **shortest**
    // plan, so following its first move leaves a board exactly one move nearer —
    // and the plan length falls by exactly one, every time, until it is gone.
    // The same endgame, walked rather than replayed: the failure this guards is
    // a period-4 cycle here instead of a descent.
    let s: SixteenState = {
      ...solvedState(5, 5),
      tiles: new Int32Array([
        6, 2, 3, 4, 5, 1, 7, 8, 9, 10, 11, 12, 13, 14, 15, 20, 17, 18, 19, 16, 21, 22,
        23, 24, 25,
      ]),
    };
    let previous: number | null = null;
    let first = 0;
    let steps = 0;
    while (s.completed === 0) {
      const result = sixteenGame.hint?.(s);
      expect(result?.ok, `stalled after ${steps} moves`).toBe(true);
      if (!result?.ok) return;
      if (previous === null) first = result.steps.length;
      else expect(result.steps.length, `at move ${steps}`).toBe(previous - 1);
      previous = result.steps.length;
      s = executeMove(s, result.steps[0].move);
      steps++;
      // Vacuity: a walk that never entered the loop, or one that wandered, both
      // report health without this.
      expect(steps).toBeLessThanOrEqual(first);
    }
    expect(steps).toBe(first);
    expect(first).toBeGreaterThan(1);
  });

  it("a mid-game board out of the exact search's reach still gets a useful plan", () => {
    // 7 tiles out of place in one 7-cycle needing a 12-slide solution — beyond
    // the exact search's depth cap, so it comes back empty having spent its
    // budget and the heuristic's partial plan is what the player gets. That
    // fallthrough is on the common path, since the exact search runs on every
    // board, so what matters is that the partial plan is *useful*: it must exist
    // and it must net-improve the board, which is what this asserts.
    const s: SixteenState = {
      ...solvedState(5, 5),
      tiles: new Int32Array([
        1, 2, 3, 4, 6, 7, 12, 8, 9, 5, 11, 18, 13, 14, 15, 16, 17, 24, 19, 20, 21, 22,
        23, 10, 25,
      ]),
      moveCount: 34,
    };
    const result = sixteenGame.hint?.(s);
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;
    expect(result.steps.length).toBeGreaterThan(0);
    // Each step must net-improve tile placement (partial plans from the
    // forward search are useful, not noise).
    let board = s;
    for (const step of result.steps) board = executeMove(board, step.move);
    const outOfPlace = (st: SixteenState) => {
      let k = 0;
      for (let i = 0; i < st.n; i++) if (st.tiles[i] !== i + 1) k++;
      return k;
    };
    expect(outOfPlace(board)).toBeLessThan(outOfPlace(s));
  });

  it("a previewed two-leg journey tracks and narrates the same tile through both legs", () => {
    // The hint says "Working on tile 7: move it to row 1, then column 2".
    // Following it leg by leg must (a) keep the plan alive with "completed"
    // verdicts — including equivalent wrap-around deltas — and (b) narrate the
    // second leg around the SAME tile, not whichever tile is lowest-numbered on
    // the second line, which would make a re-requested mid-journey hint look
    // like an unrelated fresh one.
    let s: SixteenState = {
      ...solvedState(5, 5),
      tiles: new Int32Array([
        1, 2, 3, 4, 6, 7, 12, 8, 9, 5, 11, 18, 13, 14, 15, 16, 17, 24, 19, 20, 21, 22,
        23, 10, 25,
      ]),
      moveCount: 34,
    };
    const result = sixteenGame.hint?.(s);
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;
    const [step1, step2] = result.steps;
    const hl1 = step1.highlights as SixteenHintHighlights;
    const hl2 = step2.highlights as SixteenHintHighlights;
    // Tile 7's journey ends at index 1 (its home is index 6), so the
    // first leg carries the "(setting up)" why for the whole journey.
    expect(step1.explanation).toBe(
      "Working on tile 7: move it to row 1, then column 2 (setting up).",
    );
    expect(hl1.ultimatePos).toBe(1);

    // (b) journey continuity: the second leg narrates tile 7's journey
    // and is flagged so the midend keeps it displayed when leg 1
    // completes (the journey was presented as one hint).
    expect(step2.explanation).toBe("Working on tile 7: then to column 2.");
    expect(hl2.tile).toBe(7);
    expect(hl2.targetPos).toBe(1);
    expect(step2.continuesPrevious).toBe(true);
    expect(step1.continuesPrevious).toBeUndefined();

    // Doing the second leg before the first genuinely diverges (row and
    // column slides do not commute) and must drop the plan.
    expect(sixteenGame.hintKeepTrack?.(step2.move, step1, s)).toBe("off");

    // (a) faithful in-order following: leg 1 completes step 1...
    expect(sixteenGame.hintKeepTrack?.(step1.move, step1, s)).toBe("completed");
    s = executeMove(s, step1.move);
    // ...and leg 2 completes step 2, whether played as planned or as
    // the equivalent wrap-around slide of the same line.
    expect(sixteenGame.hintKeepTrack?.(step2.move, step2, s)).toBe("completed");
    if (step2.move.type === "slide") {
      const equivalent = { ...step2.move, delta: step2.move.delta + 5 };
      expect(sixteenGame.hintKeepTrack?.(equivalent, step2, s)).toBe("completed");
    }
  });

  it("narrates a home move as 'final spot' and a staging move as 'setting up'", () => {
    // Row 0 rotated one cell out of place: the single solving slide lands
    // tile 1 in its solved cell, so the hint must read as a home move.
    const homeBoard: SixteenState = {
      ...solvedState(4, 4),
      // biome-ignore format: keep the 4×4 grid readable.
      tiles: new Int32Array([
        4, 1, 2, 3,
        5, 6, 7, 8,
        9, 10, 11, 12,
        13, 14, 15, 16,
      ]),
    };
    const homeRes = sixteenGame.hint?.(homeBoard);
    expect(homeRes?.ok).toBe(true);
    if (!homeRes?.ok) return;
    const homeStep = homeRes.steps[0];
    expect(homeStep.explanation).toContain("its final spot");
    const hl = homeStep.highlights as SixteenHintHighlights;
    expect(hl.ultimatePos ?? hl.targetPos).toBe(hl.tile - 1);

    // The label must never lie: across a scrambled plan, a non-continuation
    // step says "its final spot" iff its journey ends in the tile's solved
    // cell, and otherwise says "(setting up)"; at least one staging step is
    // present on a scrambled board.
    const { desc } = newDesc(defaultParams(), randomNew("hint-why-sixteen"));
    const s = newState(defaultParams(), desc);
    const res = sixteenGame.hint?.(s);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    let sawStaging = false;
    for (const step of res.steps) {
      if (step.continuesPrevious) continue;
      const sh = step.highlights as SixteenHintHighlights;
      const finalPos = sh.ultimatePos ?? sh.targetPos;
      const labelHome = step.explanation.includes("its final spot");
      const labelStage = step.explanation.includes("(setting up)");
      expect(labelHome || labelStage).toBe(true);
      expect(labelHome).toBe(finalPos === sh.tile - 1);
      if (labelStage) sawStaging = true;
    }
    expect(sawStaging).toBe(true);
  });

  it("can solve a puzzle using sequential hints", () => {
    const p = { w: 3, h: 3, movetarget: 3 };
    const rng = randomNew("hint-solve-test");
    const { desc } = newDesc(p, rng);
    let s = newState(p, desc);

    let rounds = 0;
    const maxRounds = 50;
    while (s.completed === 0 && rounds < maxRounds) {
      const result = sixteenGame.hint?.(s);
      if (!result?.ok) break;
      for (const step of result.steps) s = executeMove(s, step.move);
      rounds++;
    }
    expect(s.completed).toBeGreaterThan(0);
  });

  it("can solve a 4x4 puzzle using sequential hints", () => {
    const p = { w: 4, h: 4, movetarget: 0 };
    const rng = randomNew("hint-solve-test-4x4");
    const { desc } = newDesc(p, rng);
    let s = newState(p, desc);

    let rounds = 0;
    const maxRounds = 100;
    while (s.completed === 0 && rounds < maxRounds) {
      const result = sixteenGame.hint?.(s);
      expect(result?.ok, `round ${rounds}, board ${s.tiles.join(",")}`).toBe(true);
      if (!result?.ok) break;
      for (const step of result.steps) s = executeMove(s, step.move);
      rounds++;
    }
    expect(s.completed).toBeGreaterThan(0);
  });

  describe("backtracking and oscillation prevention", () => {
    it("says plainly to slide back the move that undid a finished board", () => {
      // From one slide off a finished board exactly one move finishes it, and it
      // is the undo, so the hint gives it rather than sending the player the long
      // way round. What prevents a ping-pong is the plan being *shortest*
      // (`exactSearch` in the planner), and vetoing a shortest plan's true first
      // move would destroy exactly that guarantee. The undo veto still applies on
      // the boards the exact search cannot reach, where the heuristic has no such
      // guarantee; `slide-planner.test.ts` tests it there, directly.
      const s0 = solvedState(4, 4);

      for (const delta of [1, 2]) {
        const s1 = executeMove(s0, { type: "slide", axis: "row", index: 0, delta });
        const hint = sixteenGame.hint?.(s1);
        expect(hint?.ok).toBe(true);
        if (!hint?.ok) continue;
        expect(hint.steps, `slide by ${delta}`).toHaveLength(1);
        expect(executeMove(s1, hint.steps[0].move).completed).toBeGreaterThan(0);
      }
    });
  });

  it("handles the edge case of tile 7 and 8 under column slide of index 3", () => {
    const s: SixteenState = {
      ...solvedState(4, 4),
      tiles: new Int32Array([1, 2, 14, 8, 5, 6, 15, 7, 9, 10, 11, 12, 4, 13, 3, 16]),
      moveCount: 16,
    };
    const result = sixteenGame.hint?.(s);
    expect(result?.ok).toBe(true);
  });

  it("uses the immediate destination in hint explanation when tile is already in its target row/column", () => {
    // Tile 1 sits in its home column but the wrong row, and the plan opens by
    // sliding its row, which takes it out of that column. Every step must name
    // the line its own move lands the tile on, never the line the tile belongs
    // on.
    const s: SixteenState = {
      ...solvedState(3, 3),
      tiles: new Int32Array([4, 3, 9, 1, 6, 5, 8, 2, 7]),
    };
    const result = sixteenGame.hint?.(s);
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;

    for (const step of result.steps) {
      if (step.move.type !== "slide") continue;
      const hl = step.highlights as SixteenHintHighlights;
      const line =
        step.move.axis === "row"
          ? `column ${(hl.targetPos % 3) + 1}`
          : `row ${Math.floor(hl.targetPos / 3) + 1}`;
      expect(step.explanation).toMatch(
        new RegExp(`^Working on tile ${hl.tile}: (move it|then) to ${line}\\b`),
      );
    }
  });

  it("always prefers candidates in ascending numeric order regardless of whether they are out-of-place on the moved axis", () => {
    // Row 0 holds tile 4 (right column, wrong row) and tile 6 (wrong both), and
    // the plan opens by sliding it. Out of place is out of place: every step
    // that starts a journey narrates the lowest-numbered out-of-place tile on
    // the line it slides, whichever axis that tile is wrong on.
    const s: SixteenState = {
      ...solvedState(3, 3),
      tiles: new Int32Array([4, 6, 3, 9, 2, 5, 8, 1, 7]),
    };
    const result = sixteenGame.hint?.(s);
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;

    let board = s;
    let checked = 0;
    for (const step of result.steps) {
      if (step.move.type !== "slide") continue;
      const { axis, index } = step.move;
      const cells = Array.from({ length: 3 }, (_, k) =>
        axis === "row" ? index * 3 + k : k * 3 + index,
      );
      const outOfPlace = cells.filter((i) => board.tiles[i] !== i + 1);
      if (!step.continuesPrevious && outOfPlace.length > 0) {
        const tile = (step.highlights as SixteenHintHighlights).tile;
        expect(tile).toBe(Math.min(...outOfPlace.map((i) => board.tiles[i])));
        checked++;
      }
      board = executeMove(board, step.move);
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("Sixteen hint rendering", () => {
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
    sixteenGame.redraw?.(dr, ds, null, s, 1, ui, 0, 0, result.steps[0]);

    // The tile fill and target border (rects) and the arrow (polygon) all paint
    // in COL_HINT, which is color index 4.
    const COL_HINT_INDEX = 4;
    const hintOps = ops.filter((o) => o.color === COL_HINT_INDEX);
    expect(hintOps.length).toBeGreaterThan(0);
  });

  it("supports two-leg step narration and double-target highlights", () => {
    const rng = randomNew("two-move-hint");
    const { desc } = newDesc(defaultParams(), rng);
    const s = newState(defaultParams(), desc);
    const result = sixteenGame.hint?.(s);
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;

    for (const step of result.steps) {
      const hl = step.highlights as SixteenHintHighlights;
      // A previewed two-leg journey (first leg, not a continuation) reads
      // "move it to <line>, then <line>" and carries a distinct ultimatePos.
      if (hl.ultimatePos !== undefined && !step.continuesPrevious) {
        expect(step.explanation).toMatch(
          /^Working on tile \d+: move it to (row|column) \d+, then (row|column) \d+/,
        );
        expect(hl.ultimatePos).not.toBe(hl.targetPos);
      }
    }
  });
});

describe("Sixteen hint track and direction fixes", () => {
  it("always overrides arrow direction to point in-grid (avoiding wrapping arrow)", () => {
    // Case 1: tile 1 at col 0, target at col 2.
    // Recommended move was left (delta: -1), but in-grid direction is right (delta: 1).
    const s1 = solvedState(3, 3); // Tile 1 is at index 0 (col 0, row 0).
    const ui1 = sixteenGame.newUi(s1);
    const ds1 = sixteenGame.newDrawState?.(s1);
    expect(ds1).toBeDefined();
    if (!ds1) return;
    sixteenGame.setTileSize?.(ds1, 32);

    const activeHint1: HintStep<SixteenMove, SixteenHintHighlights> = {
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

    const activeHint2: HintStep<SixteenMove, SixteenHintHighlights> = {
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

  it("hintKeepTrack classifies moves against the current step", () => {
    const step = (): HintStep<SixteenMove, SixteenHintHighlights> => ({
      move: { type: "slide", axis: "row", index: 0, delta: 2 },
      explanation: "",
      highlights: {
        tile: 1,
        targetPos: 2,
      },
    });

    // Case 1: same line, target not reached yet — onTrack, and the
    // step's move shrinks in place to the remaining in-grid distance
    // (tile 1: col 0 → col 1, one more column to go).
    const s = solvedState(3, 3); // Tile 1 is at index 0 (col 0, row 0).
    const m1: SixteenMove = { type: "slide", axis: "row", index: 0, delta: 1 };
    const h1 = step();
    expect(sixteenGame.hintKeepTrack?.(m1, h1, s)).toBe("onTrack");
    expect(h1.move).toEqual({ type: "slide", axis: "row", index: 0, delta: 1 });

    // Case 2: same line and the move lands the tile on the target —
    // completed.
    const sWithTileAt1 = solvedState(3, 3);
    sWithTileAt1.tiles[0] = 2;
    sWithTileAt1.tiles[1] = 1; // Tile 1 is at index 1
    const m2: SixteenMove = { type: "slide", axis: "row", index: 0, delta: 1 };
    expect(sixteenGame.hintKeepTrack?.(m2, step(), sWithTileAt1)).toBe("completed");

    // Case 3: a different line (unrelated move) — off.
    const m3: SixteenMove = { type: "slide", axis: "row", index: 1, delta: 1 };
    expect(sixteenGame.hintKeepTrack?.(m3, step(), s)).toBe("off");

    // Case 4: same line but sliding *away* — still onTrack, with the
    // remaining delta grown to compensate (tile 1: col 0 → col 2 is
    // the target… sliding left puts it at col 2 via wrap, which IS
    // the target on a 3-wide row, so use a 4-wide board instead).
    const s4 = solvedState(4, 4); // tile 1 at col 0
    const h4: HintStep<SixteenMove, SixteenHintHighlights> = {
      move: { type: "slide", axis: "row", index: 0, delta: 2 },
      explanation: "",
      highlights: { tile: 1, targetPos: 2 },
    };
    const m4: SixteenMove = { type: "slide", axis: "row", index: 0, delta: -1 };
    expect(sixteenGame.hintKeepTrack?.(m4, h4, s4)).toBe("onTrack");
    // tile 1 now at col 3; target col 2 ⇒ remaining in-grid delta -1.
    expect(h4.move).toEqual({ type: "slide", axis: "row", index: 0, delta: -1 });
  });
});

describe("the hint marks while the hinted slide animates", () => {
  // Netslide's defect class: once the hinted slide starts animating, a mark on
  // the *moving tile* must ride the slide and a mark on a *fixed cell* must
  // stay put — the midend advances the plan only at animation end, so the
  // displayed step's indices refer to the board the move left behind. Sixteen
  // holds both properties by construction (the tile mark is keyed by tile
  // *number*, so it follows the tile through the interpolated draw; the target
  // border is drawn after the tile loop at the cell's own coordinates). These
  // tests pin that down at an actual mid-slide frame, which a settled frame
  // cannot show.
  const TS = 48;
  const BORDER = TS; // Sixteen's border is one tile wide
  const HW = raisedBevelWidth(TS); // read from the helper, so it cannot go stale
  const px = (cell: number) => cell * TS + BORDER;

  /** The shared recorder. The local double this replaced dropped every line and
   * circle, and kept only a polygon's first vertex. */
  function coordRecordingDrawing(): {
    dr: RecordingDrawing;
    ops: RecordingDrawing["ops"];
  } {
    const dr = new RecordingDrawing(sixteenGame.colors(DEFAULT_BACKGROUND));
    return { dr, ops: dr.ops };
  }

  /** A mid-slide frame of the hinted move, on the first board whose hint step
   * slides its tile one straight (unwrapped) cell and aims the target border
   * at a cell on the line being slid — the only case where a border wrongly
   * painted in the shifted tile pass would visibly move. */
  function animatingFrame() {
    for (let i = 0; i < 60; i++) {
      const rng = randomNew(`hint-anim-${i}`);
      const params = defaultParams();
      const { desc } = newDesc(params, rng);
      const state = newState(params, desc);
      const res = sixteenGame.hint?.(state);
      if (!res?.ok) continue;
      const step = res.steps[0];
      if (step.move.type !== "slide") continue;
      const m = step.move;
      const hl = step.highlights as SixteenHintHighlights;
      if (hl.ultimatePos !== undefined) continue; // want the solid target border
      const after = executeMove(state, m);
      const w = state.w;
      const from = state.tiles.indexOf(hl.tile);
      const to = after.tiles.indexOf(hl.tile);
      // The hinted tile must move without wrapping round the torus, so the
      // expected mid-slide position is closed-form.
      const straight =
        m.axis === "row"
          ? Math.floor(to / w) === Math.floor(from / w) &&
            (to % w) - (from % w) === m.delta
          : to % w === from % w &&
            Math.floor(to / w) - Math.floor(from / w) === m.delta;
      if (!straight) continue;
      const onLine =
        m.axis === "row"
          ? Math.floor(hl.targetPos / w) === m.index
          : hl.targetPos % w === m.index;
      if (!onLine) continue;

      const ds = sixteenGame.newDrawState?.(state);
      if (!ds) throw new Error("no draw state");
      sixteenGame.setTileSize?.(ds, TS);
      const ui = sixteenGame.newUi(state);

      // Paint the still pre-move frame first, so the cache is warm exactly
      // as in the app when the hinted slide begins.
      sixteenGame.redraw?.(
        coordRecordingDrawing().dr,
        ds,
        null,
        state,
        1,
        ui,
        0,
        0,
        step,
      );

      // Halfway through the slide.
      const anim = sixteenGame.animLength?.(state, after, 1, ui) ?? 0;
      const { dr, ops } = coordRecordingDrawing();
      sixteenGame.redraw?.(dr, ds, state, after, 1, ui, anim / 2, 0, step);
      return { state, after, m, hl, from, ops };
    }
    throw new Error(
      "no board in 60 gave a straight hinted slide aimed along its own line",
    );
  }

  it("carries the tile mark along with the tile it is marking", () => {
    const { state, m, from, ops } = animatingFrame();
    const w = state.w;

    // Half a slide in, the tile sits half a tile from its origin toward its
    // landing cell; the hint fill is drawTile's center rect, inset by HW.
    const shift = Math.round(0.5 * TS * m.delta);
    const ex = px(from % w) + (m.axis === "row" ? shift : 0) + HW;
    const ey = px(Math.floor(from / w)) + (m.axis === "column" ? shift : 0) + HW;

    const fills = opsOfKind(ops, "rect").filter(
      (o) => o.color === 4 && o.w === TS - 2 * HW && o.h === TS - 2 * HW,
    );
    expect(
      fills.length,
      "the hinted tile is not painted in the hint color",
    ).toBeGreaterThan(0);
    for (const f of fills) {
      expect({ x: f.x, y: f.y }).toEqual({ x: ex, y: ey });
    }
  });

  it("leaves the target border where the target cell is", () => {
    const { state, hl, ops } = animatingFrame();
    const w = state.w;

    // The target is a *cell*; the line slides under it. The solid border's
    // top edge is a full-width, 3px-tall rect at the cell's own corner.
    const top = opsOfKind(ops, "rect").find(
      (o) => o.color === 4 && o.w === TS && o.h === 3,
    );
    expect(top, "the target cell is not outlined at all").toBeDefined();
    expect(top).toMatchObject({
      x: px(hl.targetPos % w),
      y: px(Math.floor(hl.targetPos / w)),
    });
  });
});
