/**
 * Tier-1 + tier-2.5 tests for the dominosa explained hint.
 */
import { describe, expect, it } from "vitest";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { newDominosaDesc } from "./generator.ts";
import { dominosaGame } from "./index.ts";
import { COL_HINT } from "./render.ts";
import { solveNumbers } from "./solver.ts";
import {
  DIFF_AMBIGUOUS,
  DIFF_HARD,
  DIFF_TRIVIAL,
  DIFFCOUNT,
  type DominosaState,
  encodeParams,
  newState,
} from "./state.ts";

function freshState(n: number, diff: number, seed: string): DominosaState {
  const { desc } = newDominosaDesc({ n, diff }, randomNew(seed));
  return newState({ n, diff }, desc);
}

describe("dominosa hint — refusal", () => {
  it("refuses on a solved board", () => {
    const state = freshState(4, DIFF_TRIVIAL, "hint-solved");
    const { pairs } = solveNumbers(4, state.numbers, DIFFCOUNT);
    let s = state;
    for (const [a, b] of pairs)
      s = dominosaGame.executeMove(s, { type: "domino", d1: a, d2: b });
    expect(dominosaGame.status(s)).toBe("solved");
    const res = dominosaGame.hint?.(s);
    expect(res?.ok).toBe(false);
  });

  it("refuses on an Ambiguous (non-unique) board", () => {
    const state = freshState(6, DIFF_AMBIGUOUS, "hint-ambig");
    // Only test the ones that are genuinely non-unique (Ambiguous usually is).
    if (solveNumbers(6, state.numbers, DIFFCOUNT).result === 1) return;
    const res = dominosaGame.hint?.(state);
    expect(res?.ok).toBe(false);
  });

  it("refuses when the board has a mistake", () => {
    const state = freshState(4, DIFF_TRIVIAL, "hint-mistake");
    const { pairs } = solveNumbers(4, state.numbers, DIFFCOUNT);
    const solutionSet = new Set(pairs.map(([a, b]) => a * 1000 + b));
    const w = state.w;
    const h = state.h;
    let wrong: [number, number] | null = null;
    for (let y = 0; y < h && !wrong; y++)
      for (let x = 0; x < w && !wrong; x++) {
        const i = y * w + x;
        if (x + 1 < w && !solutionSet.has(i * 1000 + (i + 1))) wrong = [i, i + 1];
      }
    const [a, b] = wrong as [number, number];
    const bad = dominosaGame.executeMove(state, { type: "domino", d1: a, d2: b });
    const res = dominosaGame.hint?.(bad);
    expect(res?.ok).toBe(false);
    expect(res && !res.ok && res.error).toMatch(/mistake/i);
  });
});

describe("dominosa hint — narration + plan", () => {
  it("a placement step names the domino and uses the necessity voice", () => {
    const state = freshState(4, DIFF_TRIVIAL, "hint-narr");
    const res = dominosaGame.hint?.(state);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    const place = res.steps.find((s) => s.move.type === "domino");
    expect(place).toBeDefined();
    // Necessity voice: forced move.
    expect(place?.explanation).toMatch(/must go here/);
    // Names a domino value (e.g. "3–4").
    expect(place?.explanation).toMatch(/\d[–-]\d/);
  });

  it("the plan solves a Hard board from empty, one recomputed step at a time", () => {
    const state = freshState(6, DIFF_HARD, "hint-hard-plan");
    let s = state;
    let barrierSeen = false;
    for (let i = 0; i < 800; i++) {
      if (dominosaGame.status(s) === "solved") break;
      const res = dominosaGame.hint?.(s);
      expect(res?.ok, `stuck at move ${i}`).toBe(true);
      if (!res?.ok) break;
      if (res.steps[0].move.type === "edge") barrierSeen = true;
      s = dominosaGame.executeMove(s, res.steps[0].move);
    }
    expect(dominosaGame.status(s)).toBe("solved");
    // A Hard board should require at least one teaching barrier along the way.
    expect(barrierSeen).toBe(true);
  }, 30000);
});

describe("dominosa hint — render", () => {
  it("draws the forced domino's cells in COL_HINT", () => {
    const p = { n: 4, diff: DIFF_TRIVIAL };
    const { desc } = newDominosaDesc(p, randomNew("hint-render"));
    const { recording } = renderScenario({
      game: dominosaGame,
      id: `${encodeParams(p, true)}:${desc}`,
      showHint: true,
    });
    const hasHint = recording.ops.some((o) => o.op === "rect" && o.colour === COL_HINT);
    expect(hasHint).toBe(true);
  });
});
