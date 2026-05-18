import { describe, expect, it } from "vitest";
import { type ChangeNotification, PuzzleButton } from "../../../puzzle/types.ts";
import { Midend } from "../../engine/index.ts";
import { randomNew } from "../../random/index.ts";
import { type FlipParams, type FlipState, flipGame } from "./index.ts";

// `solve` is optional on the `Game` interface; Flip always has one.
const solveFlip = flipGame.solve as NonNullable<typeof flipGame.solve>;

const PRESETS: FlipParams[] = [
  { w: 3, h: 3, matrixType: "crosses" },
  { w: 4, h: 4, matrixType: "crosses" },
  { w: 5, h: 5, matrixType: "crosses" },
  { w: 3, h: 3, matrixType: "random" },
  { w: 4, h: 4, matrixType: "random" },
  { w: 5, h: 5, matrixType: "random" },
];

function hasDuplicateRows(m: Uint8Array, wh: number): boolean {
  for (let i = 0; i < wh; i++) {
    for (let j = i + 1; j < wh; j++) {
      let same = true;
      for (let c = 0; c < wh; c++) {
        if (m[i * wh + c] !== m[j * wh + c]) {
          same = false;
          break;
        }
      }
      if (same) return true;
    }
  }
  return false;
}

describe("Flip generation", () => {
  for (const p of PRESETS) {
    it(`${p.w}x${p.h} ${p.matrixType}: solvable, non-trivial, no dup rows`, () => {
      const wh = p.w * p.h;
      const rng = randomNew(`flip-${p.w}${p.h}${p.matrixType}`);
      const { desc } = flipGame.newDesc(p, rng);
      expect(flipGame.validateDesc(p, desc)).toBeNull();
      const state = flipGame.newState(p, desc);

      // Non-trivial start: at least one light is on.
      expect([...state.grid].some((g) => g & 1)).toBe(true);
      // No two identical matrix rows (flip.c's acceptance condition).
      expect(hasDuplicateRows(state.matrix, wh)).toBe(false);

      // The solver finds a flip set that turns every light off.
      const result = solveFlip(state, state);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.move.kind).toBe("solve");
      if (result.move.kind !== "solve") return;

      let s: FlipState = state;
      result.move.mask.forEach((bit, idx) => {
        if (bit) {
          s = flipGame.executeMove(s, {
            kind: "flip",
            x: idx % p.w,
            y: (idx / p.w) | 0,
          });
        }
      });
      expect(s.completed).toBe(true);
      expect(flipGame.status(s)).toBe("solved");
    });
  }
});

describe("Flip button codes", () => {
  it("flip's local button consts still match PuzzleButton", () => {
    // Flip mirrors these as plain consts (enum-free import graph); pin
    // the upstream codes so any drift is caught here, not silently.
    expect(PuzzleButton.LEFT_BUTTON).toBe(0x0200);
    expect(PuzzleButton.CURSOR_UP).toBe(0x0200 + 9);
    expect(PuzzleButton.CURSOR_DOWN).toBe(0x0200 + 10);
    expect(PuzzleButton.CURSOR_LEFT).toBe(0x0200 + 11);
    expect(PuzzleButton.CURSOR_RIGHT).toBe(0x0200 + 12);
    expect(PuzzleButton.CURSOR_SELECT).toBe(0x0200 + 13);
    expect(PuzzleButton.CURSOR_SELECT2).toBe(0x0200 + 14);
  });
});

describe("Flip solver", () => {
  it("reports no solution for an insoluble position", () => {
    const wh = 4;
    // All-zero matrix: clicking does nothing, but a light is on.
    const state: FlipState = {
      w: 2,
      h: 2,
      matrix: new Uint8Array(wh * wh),
      grid: Uint8Array.from([1, 0, 0, 0]),
      moves: 0,
      completed: false,
      cheated: false,
      hintsActive: false,
    };
    const result = solveFlip(state, state);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/No solution/);
  });
});

describe("Flip params", () => {
  it("round-trips and accepts upstream's lenient forms", () => {
    expect(flipGame.decodeParams("5")).toEqual({
      w: 5,
      h: 5,
      matrixType: "crosses",
    });
    expect(flipGame.decodeParams("5x4")).toEqual({
      w: 5,
      h: 4,
      matrixType: "crosses",
    });
    expect(flipGame.decodeParams("5x5r")).toEqual({
      w: 5,
      h: 5,
      matrixType: "random",
    });
    const p: FlipParams = { w: 4, h: 6, matrixType: "random" };
    expect(flipGame.decodeParams(flipGame.encodeParams(p, true))).toEqual(p);
    expect(flipGame.encodeParams(p, false)).toBe("4x6");
    expect(flipGame.validateParams({ w: 0, h: 3, matrixType: "crosses" }, true))
      .toMatch(/greater than zero/);
  });
});

describe("Flip through the midend", () => {
  it("plays to solved-with-help and round-trips a save", () => {
    const params: FlipParams = { w: 3, h: 3, matrixType: "crosses" };
    const { desc } = flipGame.newDesc(params, randomNew("flip-midend-seed"));
    const initial = flipGame.newState(params, desc);
    const solved = solveFlip(initial, initial);
    expect(solved.ok).toBe(true);
    if (!solved.ok || solved.move.kind !== "solve") return;

    const notes: ChangeNotification[] = [];
    const me = new Midend(flipGame);
    me.setCallbacks(
      (m) => notes.push(m),
      () => {},
    );
    expect(
      me.newGameFromId(`${flipGame.encodeParams(params, false)}:${desc}`),
    ).toBeUndefined();

    // Reveal the solution (a hint move; marks usedSolve), then click
    // the hinted cells via processInput at tile centres.
    expect(me.solve()).toBeUndefined();
    const tile = flipGame.preferredTileSize ?? 32;
    const border = tile >> 1;
    solved.move.mask.forEach((bit, idx) => {
      if (bit) {
        const x = idx % params.w;
        const y = (idx / params.w) | 0;
        me.processInput(
          x * tile + border + 1,
          y * tile + border + 1,
          0x0200, // LEFT_BUTTON
        );
      }
    });

    const last = [...notes]
      .reverse()
      .find((n) => n.type === "game-state-change");
    expect(last && last.type === "game-state-change" && last.status).toBe(
      "solved-with-help",
    );

    const saved = me.saveGame();
    const me2 = new Midend(flipGame);
    me2.setCallbacks(
      () => {},
      () => {},
    );
    expect(me2.loadGame(saved)).toBeUndefined();
    expect(me2.formatAsText()).toContain("+");
  });
});
