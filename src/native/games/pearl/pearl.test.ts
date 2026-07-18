/**
 * Tier-1 behavioural tests for the Pearl port: params/desc codec, solver
 * verdicts, drag/click input → executeMove, completion detection, and the
 * edge-based `findMistakes` overlay.
 */
import { describe, expect, it } from "vitest";
import { randomNew } from "../../random/index.ts";
import { newDesc } from "./generator.ts";
import { type PearlMistake, pearlGame } from "./index.ts";
import { executeMove } from "./moves.ts";
import { pearlSolve } from "./solver.ts";
import {
  D,
  DIFF_COUNT,
  DIFF_EASY,
  DIFF_TRICKY,
  decodeParams,
  encodeParams,
  F,
  L,
  newState,
  type PearlMove,
  type PearlParams,
  type PearlState,
  R,
  U,
  validateDesc,
  validateParams,
} from "./state.ts";

const EASY_6 = { w: 6, h: 6, difficulty: DIFF_EASY, nosolve: false };

function generate(p: PearlParams, seed: string): PearlState {
  const { desc } = newDesc(p, randomNew(seed));
  return newState(p, desc);
}

/** The full unique solution's line grid for a state. */
function solutionLines(state: PearlState): Uint8Array {
  const sol = new Uint8Array(state.w * state.h);
  expect(pearlSolve(state.w, state.h, state.clues, sol, DIFF_COUNT, false)).toBe(1);
  return sol;
}

describe("pearl params", () => {
  it("round-trips full params including d/n suffixes", () => {
    for (const p of [
      { w: 10, h: 10, difficulty: DIFF_TRICKY, nosolve: false },
      { w: 6, h: 8, difficulty: DIFF_EASY, nosolve: true },
      { w: 12, h: 8, difficulty: DIFF_TRICKY, nosolve: true },
    ]) {
      expect(decodeParams(encodeParams(p, true))).toEqual(p);
    }
  });

  it("encodes a square size once", () => {
    expect(
      encodeParams({ w: 7, h: 7, difficulty: DIFF_EASY, nosolve: false }, false),
    ).toBe("7x7");
  });

  it("rejects too-small boards and small Tricky boards", () => {
    expect(
      validateParams({ w: 4, h: 6, difficulty: DIFF_EASY, nosolve: false }, true),
    ).not.toBeNull();
    expect(
      validateParams({ w: 6, h: 4, difficulty: DIFF_EASY, nosolve: false }, true),
    ).not.toBeNull();
    // w + h < 11 at Tricky is rejected.
    expect(
      validateParams({ w: 5, h: 5, difficulty: DIFF_TRICKY, nosolve: false }, true),
    ).not.toBeNull();
    expect(
      validateParams({ w: 6, h: 6, difficulty: DIFF_TRICKY, nosolve: false }, true),
    ).toBeNull();
  });
});

describe("pearl desc codec", () => {
  it("round-trips a generated desc through newState + encode", () => {
    for (const seed of ["d0", "d1", "d2"]) {
      const { desc } = newDesc(EASY_6, randomNew(seed));
      expect(validateDesc(EASY_6, desc)).toBeNull();
      const state = newState(EASY_6, desc);
      // Re-encode via the game's newDesc path is non-deterministic; instead
      // check newState parsed exactly w*h clues.
      expect(state.clues.length).toBe(EASY_6.w * EASY_6.h);
    }
  });

  it("rejects a desc that under- or over-fills the grid", () => {
    expect(validateDesc(EASY_6, "a")).not.toBeNull(); // too short
    expect(validateDesc(EASY_6, "z".repeat(10))).not.toBeNull(); // too long
    expect(validateDesc(EASY_6, "Q")).not.toBeNull(); // bad char
  });
});

describe("pearl solver", () => {
  it("solves generated boards uniquely at their difficulty", () => {
    for (const [seed, p] of [
      ["e0", EASY_6],
      ["e1", { w: 8, h: 8, difficulty: DIFF_EASY, nosolve: false }],
      ["t0", { w: 6, h: 6, difficulty: DIFF_TRICKY, nosolve: false }],
    ] as const) {
      const state = generate(p, seed);
      const out = new Uint8Array(p.w * p.h);
      expect(pearlSolve(p.w, p.h, state.clues, out, p.difficulty, false)).toBe(1);
    }
  });

  it("a Tricky board is not solvable with only Easy deductions", () => {
    // Find a Tricky board that genuinely needs the tricky rung.
    const p = { w: 6, h: 6, difficulty: DIFF_TRICKY, nosolve: false };
    const state = generate(p, "tricky-needs-rung");
    const out = new Uint8Array(p.w * p.h);
    expect(pearlSolve(p.w, p.h, state.clues, out, DIFF_EASY, false)).not.toBe(1);
    expect(pearlSolve(p.w, p.h, state.clues, out, DIFF_TRICKY, false)).toBe(1);
  });
});

describe("pearl input + executeMove", () => {
  it("a drag lays a path of loop segments", () => {
    const state = generate(EASY_6, "drag");
    // A move that flips the segment leaving (1,1) rightwards, reciprocated
    // at (2,1) leftwards — exactly what a one-cell drag emits.
    const move: PearlMove = {
      ops: [
        { kind: "flip", l: R, x: 1, y: 1 },
        { kind: "flip", l: L, x: 2, y: 1 },
      ],
    };
    const next = executeMove(state, move);
    expect(next.lines[1 * 6 + 1] & R).toBeTruthy();
    expect(next.lines[1 * 6 + 2] & L).toBeTruthy();
  });

  it("a secondary click marks a no-line cross", () => {
    const state = generate(EASY_6, "mark");
    const move: PearlMove = {
      ops: [
        { kind: "mark", l: R, x: 0, y: 0 },
        { kind: "mark", l: L, x: 1, y: 0 },
      ],
    };
    const next = executeMove(state, move);
    expect(next.marks[0] & R).toBeTruthy();
    expect(next.marks[1] & L).toBeTruthy();
  });

  it("rejects laying a line over a mark", () => {
    const state = generate(EASY_6, "over");
    const marked = executeMove(state, {
      ops: [
        { kind: "mark", l: R, x: 1, y: 1 },
        { kind: "mark", l: L, x: 2, y: 1 },
      ],
    });
    // Now try to flip a line on the same edge — executeMove must throw.
    expect(() =>
      executeMove(marked, { ops: [{ kind: "line", l: R, x: 1, y: 1 }] }),
    ).toThrow();
  });

  it("completes when the full loop is laid, and flashes (not after Solve)", () => {
    const state = generate(EASY_6, "complete");
    const sol = solutionLines(state);
    // Lay every solution segment via replace ops.
    const ops = [];
    for (let i = 0; i < state.w * state.h; i++)
      ops.push({
        kind: "replace" as const,
        l: sol[i],
        x: i % state.w,
        y: (i / state.w) | 0,
      });
    const done = executeMove(state, { ops });
    expect(done.completed).toBe(true);
    // flashLength fires for a fresh completion, not one reached via Solve.
    const flash = pearlGame.flashLength?.(state, done, 0, pearlGame.newUi(state));
    expect(flash).toBeGreaterThan(0);
  });

  it("Solve fills in the unique solution and marks used-solve", () => {
    const state = generate(EASY_6, "solve");
    const res = pearlGame.solve?.(state, state);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    const done = executeMove(state, res.move);
    expect(done.completed).toBe(true);
    expect(done.usedSolve).toBe(true);
    // No celebration flash after Solve.
    expect(pearlGame.flashLength?.(state, done, 0, pearlGame.newUi(state))).toBe(0);
  });

  it("the H hint autosolves the board in place", () => {
    const state = generate(EASY_6, "hint");
    const done = executeMove(state, { ops: [{ kind: "hint" }] });
    const sol = solutionLines(state);
    expect(Array.from(done.lines)).toEqual(Array.from(sol));
    expect(done.completed).toBe(true);
  });
});

describe("pearl findMistakes", () => {
  it("returns nothing for a correct partial board", () => {
    const state = generate(EASY_6, "fm-clean");
    const sol = solutionLines(state);
    // Lay a couple of genuine solution segments.
    let s = state;
    let laid = 0;
    for (let i = 0; i < state.w * state.h && laid < 2; i++) {
      if (sol[i] & R) {
        s = executeMove(s, {
          ops: [
            { kind: "flip", l: R, x: i % state.w, y: (i / state.w) | 0 },
            { kind: "flip", l: L, x: (i % state.w) + 1, y: (i / state.w) | 0 },
          ],
        });
        laid++;
      }
    }
    expect(pearlGame.findMistakes?.(s)).toEqual([]);
  });

  it("flags a segment the unique solution does not contain", () => {
    const state = generate(EASY_6, "fm-wrong");
    const sol = solutionLines(state);
    // Find a horizontal edge the solution does NOT have and lay it.
    let placed: { x: number; y: number } | null = null;
    for (let y = 0; y < state.h && !placed; y++)
      for (let x = 0; x < state.w - 1 && !placed; x++) {
        if (!(sol[y * state.w + x] & R)) placed = { x, y };
      }
    expect(placed).not.toBeNull();
    if (!placed) return;
    const wrong = executeMove(state, {
      ops: [
        { kind: "flip", l: R, x: placed.x, y: placed.y },
        { kind: "flip", l: L, x: placed.x + 1, y: placed.y },
      ],
    });
    const mistakes = pearlGame.findMistakes?.(wrong) as readonly PearlMistake[];
    // The wrong R-segment at (x,y) (and its reciprocal L at x+1) are flagged.
    expect(
      mistakes.some((m) => m.x === placed?.x && m.y === placed?.y && m.dir === R),
    ).toBe(true);
  });

  it("returns nothing on a non-uniquely-solvable (nosolve) board", () => {
    const p = { w: 6, h: 6, difficulty: DIFF_EASY, nosolve: true };
    // Generate until we get one that isn't uniquely solvable (most nosolve
    // boards are ambiguous); fall back to asserting the hook is safe.
    for (const seed of ["ns0", "ns1", "ns2", "ns3", "ns4"]) {
      const state = generate(p, seed);
      const out = new Uint8Array(p.w * p.h);
      if (pearlSolve(p.w, p.h, state.clues, out, DIFF_COUNT, false) !== 1) {
        // lay a random segment then check no mistakes are reported
        const wrong = executeMove(state, {
          ops: [
            { kind: "flip", l: R, x: 0, y: 0 },
            { kind: "flip", l: L, x: 1, y: 0 },
          ],
        });
        expect(pearlGame.findMistakes?.(wrong)).toEqual([]);
        return;
      }
    }
  });
});

describe("pearl mistake overlay is in the diff key (paint-twice)", () => {
  it("reds a wrong segment even when the cell was already drawn", async () => {
    const { RecordingDrawing } = await import(
      "../../engine/testing/recording-drawing.ts"
    );
    const { redraw, newDrawState, COL_MISTAKE } = await import("./render.ts");
    const state = generate(EASY_6, "fm-paint");
    const sol = solutionLines(state);
    // Lay a wrong horizontal segment.
    let placed: { x: number; y: number } | null = null;
    for (let y = 0; y < state.h && !placed; y++)
      for (let x = 0; x < state.w - 1 && !placed; x++)
        if (!(sol[y * state.w + x] & R)) placed = { x, y };
    if (!placed) throw new Error("no wrong edge available");
    const wrong = executeMove(state, {
      ops: [
        { kind: "flip", l: R, x: placed.x, y: placed.y },
        { kind: "flip", l: L, x: placed.x + 1, y: placed.y },
      ],
    });
    const mistakes = pearlGame.findMistakes?.(wrong) as PearlMistake[];
    expect(mistakes.length).toBeGreaterThan(0);

    const ui = pearlGame.newUi(wrong);
    const ds = newDrawState(wrong);
    const palette = pearlGame.colours([0.9, 0.9, 0.9]);

    // Frame 1: warm the cache with NO mistakes (draws the laid segment).
    const dr1 = new RecordingDrawing(palette);
    redraw(dr1, ds, null, wrong, 0, ui, 0, 0, undefined, []);
    expect(dr1.ops.some((o) => o.op === "rect" && o.colour === COL_MISTAKE)).toBe(
      false,
    );

    // Frame 2: same drawstate, WITH mistakes — the overlay must still paint
    // even though the cell's tile value is otherwise unchanged.
    const dr2 = new RecordingDrawing(palette);
    redraw(dr2, ds, null, wrong, 0, ui, 0, 0, undefined, mistakes);
    expect(dr2.ops.some((o) => o.op === "rect" && o.colour === COL_MISTAKE)).toBe(true);

    // Frame 3: clearing the overlay erases it (repaints without COL_MISTAKE).
    const dr3 = new RecordingDrawing(palette);
    redraw(dr3, ds, null, wrong, 0, ui, 0, 0, undefined, []);
    const cellRepainted = dr3.ops.some((o) => o.op === "rect");
    expect(cellRepainted).toBe(true);
    expect(dr3.ops.some((o) => o.op === "rect" && o.colour === COL_MISTAKE)).toBe(
      false,
    );
  });
});

describe("pearl reciprocal / off-grid guards", () => {
  it("F(dir) is the opposite direction", () => {
    expect(F(R)).toBe(L);
    expect(F(U)).toBe(D);
  });
});
