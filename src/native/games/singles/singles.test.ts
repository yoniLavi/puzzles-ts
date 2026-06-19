/**
 * Behavioural tests for the Singles (Hitori) port.
 *
 * Tier 1: params/desc codec round-trips, the generator produces uniquely
 * solvable boards at each difficulty, Solve completes a board, and
 * findMistakes flags wrong cells while clean boards report none. Tier 2.5:
 * a `renderScenario` of the initial frame and a black/circle/mistake frame
 * (targeted op assertions + a snapshot). The byte-match C differential
 * lives in `singles-differential.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { Midend } from "../../engine/index.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { newSinglesDesc } from "./generator.ts";
import { COL_ERROR, COL_GRID } from "./render.ts";
import { solveSpecific } from "./solver.ts";
import { singlesGame, type SinglesMistake } from "./index.ts";
import {
  cloneState,
  decodeParams,
  DIFF_ANY,
  diffToLevel,
  encodeParams,
  F_BLACK,
  F_CIRCLE,
  makeState,
  newState,
  type SinglesParams,
  validateDesc,
  validateParams,
} from "./state.ts";

describe("singles params codec", () => {
  it("round-trips full and short encodings", () => {
    const p: SinglesParams = { w: 8, h: 8, diff: "tricky" };
    expect(encodeParams(p, true)).toBe("8x8dk");
    expect(encodeParams(p, false)).toBe("8x8");
    expect(decodeParams("8x8dk")).toEqual(p);
    expect(decodeParams("8x8de")).toEqual({ w: 8, h: 8, diff: "easy" });
  });

  it("decodes a bare square dimension", () => {
    expect(decodeParams("6")).toEqual({ w: 6, h: 6, diff: "easy" });
  });

  it("rejects too-small params", () => {
    expect(validateParams({ w: 1, h: 5, diff: "easy" }, true)).not.toBeNull();
    expect(validateParams({ w: 5, h: 5, diff: "easy" }, true)).toBeNull();
  });
});

describe("singles desc codec", () => {
  it("decodes a desc to the number grid and round-trips validation", () => {
    const p: SinglesParams = { w: 5, h: 5, diff: "easy" };
    const { desc } = newSinglesDesc(p, randomNew("singles-codec"));
    expect(validateDesc(p, desc)).toBeNull();
    const s = newState(p, desc);
    expect(s.n).toBe(25);
    for (let i = 0; i < s.n; i++) {
      expect(s.nums[i]).toBeGreaterThanOrEqual(1);
      expect(s.nums[i]).toBeLessThanOrEqual(5);
      expect(s.flags[i]).toBe(0);
    }
  });

  it("rejects a wrong-length desc", () => {
    const p: SinglesParams = { w: 5, h: 5, diff: "easy" };
    expect(validateDesc(p, "123")).not.toBeNull();
  });
});

const GEN_SPECS: SinglesParams[] = [
  { w: 5, h: 5, diff: "easy" },
  { w: 5, h: 5, diff: "tricky" },
  { w: 6, h: 6, diff: "tricky" },
  { w: 8, h: 8, diff: "easy" },
];

describe("singles generator + solver", () => {
  for (const p of GEN_SPECS) {
    it(`${encodeParams(p, true)} generates a uniquely solvable board`, () => {
      const { desc } = newSinglesDesc(p, randomNew(`gen-${encodeParams(p, true)}`));
      const s = newState(p, desc);
      // Solvable at its difficulty.
      const solved = cloneState(s);
      expect(solveSpecific(solved, diffToLevel(p.diff), false)).toBe(1);
      // A second independent solve from blank yields the same partition,
      // confirming a unique solution.
      const solved2 = makeState(p.w, p.h, s.nums);
      expect(solveSpecific(solved2, DIFF_ANY, false)).toBe(1);
      for (let i = 0; i < s.n; i++) {
        expect(solved.flags[i] & (F_BLACK | F_CIRCLE)).toBe(
          solved2.flags[i] & (F_BLACK | F_CIRCLE),
        );
      }
    });
  }
});

describe("singles solve", () => {
  it("completes a generated board and reports solved", () => {
    const p: SinglesParams = { w: 6, h: 6, diff: "tricky" };
    const { desc } = newSinglesDesc(p, randomNew("solve-test"));
    const s0 = newState(p, desc);
    const res = singlesGame.solve?.(s0, s0);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    const solved = singlesGame.executeMove(s0, res.move);
    expect(singlesGame.status(solved)).toBe("solved");
  });
});

describe("singles findMistakes", () => {
  it("flags a wrong mark and passes a correct partial board", () => {
    const p: SinglesParams = { w: 6, h: 6, diff: "easy" };
    const { desc } = newSinglesDesc(p, randomNew("mistake-test"));
    const s0 = newState(p, desc);
    const sol = makeState(p.w, p.h, s0.nums);
    expect(solveSpecific(sol, DIFF_ANY, false)).toBe(1);

    const blackIdx = sol.flags.findIndex((f) => (f & F_BLACK) !== 0);
    expect(blackIdx).toBeGreaterThanOrEqual(0);

    // Mark a solution-black cell as white (circle) → a mistake.
    const wrong = cloneState(s0);
    wrong.flags[blackIdx] |= F_CIRCLE;
    const mistakes = singlesGame.findMistakes?.(wrong) as SinglesMistake[];
    expect(mistakes.some((m) => m.y * p.w + m.x === blackIdx)).toBe(true);

    // Mark it correctly black → no mistakes.
    const clean = cloneState(s0);
    clean.flags[blackIdx] |= F_BLACK;
    expect(singlesGame.findMistakes?.(clean)).toHaveLength(0);
  });
});

describe("singles save round-trip", () => {
  it("saveGame -> loadGame restores an equivalent game", () => {
    const me = new Midend(singlesGame);
    expect(me.newGameFromId("5x5de#singles-save")).toBeUndefined();
    me.playMoves([{ sets: [{ x: 0, y: 0, value: "black" }] }]);
    const saved = me.saveGame();
    const me2 = new Midend(singlesGame);
    expect(me2.loadGame(saved)).toBeUndefined();
    expect(me2.formatAsText()).toBe(me.formatAsText());
  });
});

describe("singles render", () => {
  it("draws the initial frame with a grid outline", () => {
    const { recording } = renderScenario({
      game: singlesGame,
      id: "5x5de#singles-render",
    });
    expect(recording.ops.length).toBeGreaterThan(0);
    expect(recording.ops.some((o) => o.op === "line" && o.colour === COL_GRID)).toBe(
      true,
    );
    expect(recording.ops).toMatchSnapshot();
  });

  it("renders a Check & Save mistake in the error colour", () => {
    const p: SinglesParams = { w: 5, h: 5, diff: "easy" };
    const { desc } = newSinglesDesc(p, randomNew("render-mistake"));
    const sol = makeState(p.w, p.h, newState(p, desc).nums);
    solveSpecific(sol, DIFF_ANY, false);
    const blackIdx = sol.flags.findIndex((f) => (f & F_BLACK) !== 0);
    const x = blackIdx % p.w;
    const y = (blackIdx / p.w) | 0;
    const { recording, mistakeCount } = renderScenario({
      game: singlesGame,
      id: `5x5de:${desc}`,
      // Mark a solution-black cell white — a mistake.
      moves: [{ sets: [{ x, y, value: "circle" }] }],
      showMistakes: true,
    });
    expect(mistakeCount).toBeGreaterThan(0);
    expect(
      recording.ops.some((o) => "colour" in o && o.colour === COL_ERROR),
    ).toBe(true);
  });
});
