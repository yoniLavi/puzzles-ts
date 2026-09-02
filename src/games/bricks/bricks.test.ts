/**
 * Bricks behavioral tests (tiers 1 and 2.5). The byte-match generator /
 * solver / codec are covered by `bricks-differential.test.ts`; here we pin the
 * hex geometry, the input mapping (the one place a shear-coordinate bug hides),
 * completion/solve through a real `Midend`, findMistakes, and the render frames.
 */
import { describe, expect, it } from "vitest";
import { UI_UPDATE } from "../../engine/game.ts";
import { Midend } from "../../engine/index.ts";
import { LEFT_BUTTON, LEFT_DRAG, LEFT_RELEASE } from "../../engine/pointer.ts";
import { randomNew } from "../../engine/random/index.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { sizedDrawState } from "../../engine/testing/sized-draw-state.ts";
import type { ChangeNotification, GameStatus } from "../../engine/types.ts";
import cReference from "./__fixtures__/bricks-c-reference.json" with { type: "json" };
import { newBricksDesc } from "./generator.ts";
import { bricksGame } from "./index.ts";
import { COL_ERROR, offsets } from "./render.ts";
import { bricksValidate, findMistakes, solveGame } from "./solver.ts";
import {
  applyBounds,
  type BricksMove,
  type BricksParams,
  type BricksState,
  type BricksUi,
  bitsColor,
  COL_MASK,
  DIFF_EASY,
  DIFF_NORMAL,
  DIFF_TRICKY,
  decodeParams,
  encodeDesc,
  encodeParams,
  F_BOUND,
  F_EMPTY,
  F_SHADE,
  gridSize,
  newState,
  validateDesc,
} from "./state.ts";

interface Fixture {
  seed: string;
  desc: string;
  w: number;
  h: number;
  diff: number;
}
const fixtures = (cReference as { fixtures: Fixture[] }).fixtures;
const FIX = fixtures[0]; // 7x6 easy
const FIX_PARAMS: BricksParams = { w: FIX.w, h: FIX.h, diff: FIX.diff };
const FIX_ID = `${encodeParams(FIX_PARAMS, true)}:${FIX.desc}`;

const TS = 48; // PREFERRED_TILE_SIZE, already even

/** Pixel center of padded-grid cell (col, row) at the default tile size. */
function center(
  state: BricksState,
  col: number,
  row: number,
): { x: number; y: number } {
  const { ox, oy } = offsets(state.h, TS);
  const tx = col * TS + ox + row * (TS >> 1);
  const ty = row * TS + oy;
  return { x: tx + TS / 2, y: ty + TS / 2 };
}

function press(
  state: BricksState,
  ui: BricksUi,
  button: number,
  x: number,
  y: number,
): BricksMove | null | typeof UI_UPDATE {
  return bricksGame.interpretMove(
    state,
    ui,
    sizedDrawState(bricksGame, state),
    { x, y },
    button,
  );
}

function harness() {
  const notes: ChangeNotification[] = [];
  const m = new Midend(bricksGame);
  m.setCallbacks(
    (n) => notes.push(n),
    () => {},
    () => {},
  );
  const status = (): GameStatus | undefined =>
    (
      [...notes].reverse().find((n) => n.type === "game-state-change") as
        | Extract<ChangeNotification, { type: "game-state-change" }>
        | undefined
    )?.status;
  return { m, status };
}

describe("bricks params", () => {
  it("encodes and decodes round-trip with difficulty", () => {
    const p = decodeParams("10x8dt");
    expect(p).toEqual({ w: 10, h: 8, diff: 2 });
    expect(encodeParams(p, true)).toBe("10x8dt");
    expect(encodeParams(p, false)).toBe("10x8");
  });

  it("reads a single dimension as square (upstream lenience)", () => {
    expect(decodeParams("9")).toMatchObject({ w: 9, h: 9 });
  });

  it("rejects an unknown difficulty char", () => {
    const p = decodeParams("7x6dx");
    expect(bricksGame.validateParams(p, true)).toMatch(/difficulty/i);
  });
});

describe("bricks hex geometry", () => {
  it("pads the width to w + ceil(h/2) - 1 and masks a w*h hexagon", () => {
    const { w, h } = gridSize(FIX_PARAMS); // 7 + ceil(6/2) - 1 = 9
    expect(w).toBe(9);
    expect(h).toBe(6);
    const grid = new Uint16Array(w * h);
    applyBounds(w, h, grid);
    const playable = grid.reduce((n, c) => n + (c & F_BOUND ? 0 : 1), 0);
    expect(playable).toBe(FIX_PARAMS.w * FIX_PARAMS.h); // exactly 42
  });
});

describe("bricks desc codec", () => {
  it("validates and round-trips every fixture desc", () => {
    for (const f of fixtures) {
      const p: BricksParams = { w: f.w, h: f.h, diff: f.diff };
      expect(validateDesc(p, f.desc)).toBeNull();
      const st = newState(p, f.desc);
      expect(encodeDesc(st.grid, st.w, st.h)).toBe(f.desc);
    }
  });

  it("rejects a clue out of range and a wrong cell count", () => {
    expect(validateDesc(FIX_PARAMS, "8a")).toMatch(/out of range/i);
    expect(validateDesc(FIX_PARAMS, "a")).toMatch(/Not enough/i);
    expect(validateDesc({ w: 2, h: 2, diff: 0 }, "zzzz")).toMatch(/Too many/i);
  });
});

describe("bricks solver", () => {
  it("solves every decoded fixture board to completion at Tricky", () => {
    for (const f of fixtures) {
      const st = newState({ w: f.w, h: f.h, diff: f.diff }, f.desc);
      const grid = st.grid.slice();
      expect(solveGame(grid, st.w, st.h, 2, true, true)).toBe("complete");
    }
  });

  it("a tricky board is not completed by the Easy tier alone", () => {
    const tricky = fixtures.find((f) => f.diff === 2 && f.w * f.h > 6);
    if (!tricky) throw new Error("no tricky fixture");
    const st = newState({ w: tricky.w, h: tricky.h, diff: tricky.diff }, tricky.desc);
    const easy = st.grid.slice();
    expect(solveGame(easy, st.w, st.h, 0, true, true)).not.toBe("complete");
    const hard = st.grid.slice();
    expect(solveGame(hard, st.w, st.h, 2, true, true)).toBe("complete");
  });

  it("flags three shaded in a horizontal row as invalid", () => {
    const st = newState(FIX_PARAMS, FIX.desc);
    // Bottom row (gravity-exempt): three consecutive playable cells.
    const base = (st.h - 1) * st.w;
    st.grid[base + 2] = F_SHADE;
    st.grid[base + 3] = F_SHADE;
    st.grid[base + 4] = F_SHADE;
    expect(bricksValidate(st.grid, st.w, st.h, false)).toBe("invalid");
  });
});

describe("bricks findMistakes", () => {
  it("flags a three-in-a-row and leaves a clean partial board clean", () => {
    const clean = newState(FIX_PARAMS, FIX.desc);
    expect(findMistakes(clean)).toEqual([]);

    const bad = newState(FIX_PARAMS, FIX.desc);
    const base = (bad.h - 1) * bad.w;
    bad.grid[base + 2] = F_SHADE;
    bad.grid[base + 3] = F_SHADE;
    bad.grid[base + 4] = F_SHADE;
    const flagged = new Set(findMistakes(bad).map((m) => m.index));
    expect(flagged.has(base + 2)).toBe(true);
    expect(flagged.has(base + 3)).toBe(true);
    expect(flagged.has(base + 4)).toBe(true);
  });
});

describe("bricks input", () => {
  const firstBlank = (state: BricksState): { col: number; row: number; i: number } => {
    for (let i = 0; i < state.w * state.h; i++) {
      if ((state.grid[i] & COL_MASK) === F_EMPTY)
        return { col: i % state.w, row: (i / state.w) | 0, i };
    }
    throw new Error("no blank cell");
  };

  it("left-click cycles a blank cell to shaded", () => {
    const state = newState(FIX_PARAMS, FIX.desc);
    const ui = bricksGame.newUi(state);
    const { col, row, i } = firstBlank(state);
    const c = center(state, col, row);
    expect(press(state, ui, LEFT_BUTTON, c.x, c.y)).toBe(UI_UPDATE);
    const move = press(state, ui, LEFT_RELEASE, c.x, c.y);
    expect(move).toMatchObject({ kind: "paint", cells: [{ index: i, to: "shade" }] });
    const next = bricksGame.executeMove(state, move as BricksMove);
    expect(next.grid[i]).toBe(F_SHADE);
  });

  it("a drag paints every crossed cell with one color", () => {
    const state = newState(FIX_PARAMS, FIX.desc);
    const ui = bricksGame.newUi(state);
    // Find two horizontally-adjacent blank cells.
    let a = -1;
    for (let i = 0; i < state.w * state.h - 1; i++) {
      if (
        (state.grid[i] & COL_MASK) === F_EMPTY &&
        (state.grid[i + 1] & COL_MASK) === F_EMPTY &&
        i % state.w < state.w - 1
      ) {
        a = i;
        break;
      }
    }
    expect(a).toBeGreaterThanOrEqual(0);
    const ca = center(state, a % state.w, (a / state.w) | 0);
    const cb = center(state, (a + 1) % state.w, (a / state.w) | 0);
    press(state, ui, LEFT_BUTTON, ca.x, ca.y);
    press(state, ui, LEFT_DRAG, cb.x, cb.y);
    const move = press(state, ui, LEFT_RELEASE, cb.x, cb.y) as BricksMove;
    expect(move.kind).toBe("paint");
    if (move.kind !== "paint") throw new Error();
    expect(move.cells.map((c) => c.index).sort((x, y) => x - y)).toEqual([a, a + 1]);
    expect(move.cells.every((c) => c.to === "shade")).toBe(true);
  });

  it("keyboard place sets the cursor cell (no-op moves suppressed)", () => {
    const state = newState(FIX_PARAMS, FIX.desc);
    const ui = bricksGame.newUi(state);
    const { col, row, i } = firstBlank(state);
    ui.cursor.visible = true;
    ui.cursor.x = col;
    ui.cursor.y = row;
    const move = press(state, ui, 49 /* '1' */, 0, 0); // shade
    expect(move).toMatchObject({ kind: "paint", cells: [{ index: i, to: "shade" }] });
    // A '1' on an already-shaded cell is a no-op.
    const shaded = bricksGame.executeMove(state, move as BricksMove);
    expect(press(shaded, ui, 49, 0, 0)).toBeNull();
  });
});

describe("bricks completion and solve (through a real Midend)", () => {
  it("Solve completes the board as solved-with-help", () => {
    const { m, status } = harness();
    expect(m.newGameFromId(FIX_ID)).toBeUndefined();
    expect(m.solve()).toBeUndefined();
    expect(status()).toBe("solved-with-help");
    const text = m.formatAsText();
    expect(text).toBeDefined();
    expect(text).not.toContain("."); // no cell left empty
  });

  it("manually filling the solution sets completed and arms a flash", () => {
    const st = newState(FIX_PARAMS, FIX.desc);
    const grid = st.grid.slice();
    solveGame(grid, st.w, st.h, 2, true, true);
    const cells = [];
    for (let i = 0; i < st.w * st.h; i++) {
      if (!(st.grid[i] & COL_MASK)) continue;
      cells.push({ index: i, to: bitsColor(grid[i]) });
    }
    const done = bricksGame.executeMove(st, { kind: "paint", cells });
    expect(done.completed).toBe(true);
    expect(done.cheated).toBe(false);
    expect(bricksGame.flashLength?.(st, done, 1, bricksGame.newUi(st))).toBeGreaterThan(
      0,
    );
  });

  it("saveGame -> loadGame restores an equivalent game", () => {
    const me = new Midend(bricksGame);
    expect(me.newGameFromId(FIX_ID)).toBeUndefined();
    const blank = newState(FIX_PARAMS, FIX.desc).grid.findIndex(
      (c) => (c & COL_MASK) === F_EMPTY,
    );
    expect(blank).toBeGreaterThanOrEqual(0);
    me.playMoves([
      { kind: "paint", cells: [{ index: blank, to: "shade" }] },
    ] as BricksMove[]);
    const saved = me.saveGame();
    const me2 = new Midend(bricksGame);
    expect(me2.loadGame(saved)).toBeUndefined();
    expect(me2.formatAsText()).toBe(me.formatAsText());
  });
});

describe("bricks generator", () => {
  it("produces a uniquely-solvable board for each preset", () => {
    for (const p of [
      { w: 7, h: 6, diff: 0 },
      { w: 7, h: 6, diff: 1 },
    ] as BricksParams[]) {
      const { desc } = newBricksDesc(p, randomNew(`bricks-unit-${p.diff}`));
      expect(validateDesc(p, desc)).toBeNull();
      const st = newState(p, desc);
      const grid = st.grid.slice();
      expect(solveGame(grid, st.w, st.h, 2, true, true)).toBe("complete");
    }
  });

  // The tier gate (grade-difficulty-tiers-honestly). Upstream probed at Easy
  // whatever tier was asked for, so Normal was gated correctly by accident and
  // Tricky not at all.
  describe("difficulty tiers bind", () => {
    for (const [w, h] of [
      [7, 6],
      [10, 8],
    ]) {
      it(`${w}x${h} Unreasonable needs its own rung, not Easy`, () => {
        const p: BricksParams = { w, h, diff: DIFF_NORMAL };
        const { desc } = newBricksDesc(p, randomNew(`bricks-tier-${w}x${h}`));
        const st = newState(p, desc);
        expect(solveGame(st.grid.slice(), st.w, st.h, DIFF_NORMAL, true, true)).toBe(
          "complete",
        );
        expect(solveGame(st.grid.slice(), st.w, st.h, DIFF_EASY, true, true)).not.toBe(
          "complete",
        );
      });
    }

    it("refuses to generate Tricky, for which no board exists", () => {
      const p: BricksParams = { w: 7, h: 6, diff: DIFF_TRICKY };
      expect(bricksGame.validateParams(p, true)).toMatch(/Tricky/);
      // Loading an existing Tricky description still works.
      expect(bricksGame.validateParams(p, false)).toBeNull();
      // And the generator refuses immediately rather than spinning its retry
      // budget on a tier that can never be satisfied.
      expect(() => newBricksDesc(p, randomNew("bricks-tricky"))).toThrow(
        /no board requires difficulty/,
      );
    });

    it("offers only the difficulties it can generate", () => {
      const titles = (bricksGame.presets().submenu ?? []).map((e) => e.title);
      expect(titles).toEqual([
        "7x6 Easy",
        "7x6 Unreasonable",
        "10x8 Easy",
        "10x8 Unreasonable",
      ]);
    });

    // `audit-guessing-tier-names` D11 dropped upstream's third tier from
    // `DIFF_NAMES`, so `difficulty-contract.test.ts` — which iterates the
    // *declared* tiers — no longer covers it. This is where that guarantee
    // lives now, and it is the whole of what a dropped name must not break: the
    // difficulty character still round-trips, so no game ID or saved game
    // changes meaning.
    it("still round-trips the unnamed third tier through a game ID", () => {
      const p = decodeParams("10x8dt");
      expect(p.diff).toBe(DIFF_TRICKY);
      expect(encodeParams(p, true)).toBe("10x8dt");
    });
  });
});

describe("bricks rendering (tier 2.5)", () => {
  it("draws the opening frame with clue numbers", () => {
    const result = renderScenario({ game: bricksGame, id: FIX_ID });
    const ops = result.recording.ops;
    expect(ops.length).toBeGreaterThan(0);
    expect(ops.some((o) => o.op === "text")).toBe(true);
    expect(ops).toMatchSnapshot();
  });

  it("shows a red error overlay for a three-in-a-row via Check & Save", () => {
    // Three consecutive *playable* cells in one row, shaded — findMistakes
    // reports the violation and the overlay reds those cells.
    const st = newState(FIX_PARAMS, FIX.desc);
    let run3 = -1;
    for (let i = 0; i < st.w * st.h - 2 && run3 < 0; i++) {
      const col = i % st.w;
      if (
        col <= st.w - 3 &&
        (st.grid[i] & COL_MASK) === F_EMPTY &&
        (st.grid[i + 1] & COL_MASK) === F_EMPTY &&
        (st.grid[i + 2] & COL_MASK) === F_EMPTY
      ) {
        run3 = i;
      }
    }
    expect(run3).toBeGreaterThanOrEqual(0);
    const moves: BricksMove[] = [
      {
        kind: "paint",
        cells: [
          { index: run3, to: "shade" },
          { index: run3 + 1, to: "shade" },
          { index: run3 + 2, to: "shade" },
        ],
      },
    ];
    const result = renderScenario({
      game: bricksGame,
      id: FIX_ID,
      moves,
      showMistakes: true,
    });
    expect(result.mistakeCount).toBeGreaterThan(0);
    expect(
      result.recording.ops.some((o) => o.op === "rect" && o.color === COL_ERROR),
    ).toBe(true);
  });
});
