/**
 * Slant hint (add-slant-hint) — tier-1 behavioural tests: refusal coupling,
 * plan completeness, narration quality (indication-first, necessity voice),
 * visible evidence, and keep-track.
 */
import { describe, expect, test } from "vitest";
import { randomNew } from "../../random/index.ts";
import { newDesc } from "./generator.ts";
import { type SlantHint, slantGame } from "./index.ts";
import { solveFromClues } from "./solver.ts";
import {
  DIFF_EASY,
  DIFF_HARD,
  executeMove,
  newState,
  type SlantMove,
  type SlantState,
} from "./state.ts";

function freshState(w: number, h: number, diff: number, seed: string): SlantState {
  const rs = randomNew(seed);
  const { desc } = newDesc({ w, h, diff }, rs);
  return newState({ w, h, diff }, desc);
}

/** Apply every hint step's move in order; returns the resulting board. */
function applyPlan(state: SlantState): SlantState {
  let s = state;
  const res = slantGame.hint?.(s);
  if (!res?.ok) throw new Error("expected a plan");
  for (const step of res.steps) s = executeMove(s, step.move);
  return s;
}

describe("slant hint", () => {
  test("refuses on a solved board with the overlay-coupling message", () => {
    const s = freshState(5, 5, DIFF_EASY, "solved-1");
    const solved = applyPlan(s);
    expect(solved.completed).toBe(true);
    const res = slantGame.hint?.(solved);
    expect(res?.ok).toBe(false);
  });

  test("refuses on a mistaken board (couples to findMistakes)", () => {
    const s = freshState(8, 8, DIFF_HARD, "mistake-1");
    const sol = solveFromClues(s.w, s.h, s.clues);
    if ("error" in sol) throw new Error("unsolvable");
    // Place a wrong slash: first square, opposite of the solution.
    const wrongV = (sol.soln[0] === 1 ? -1 : 1) as 1 | -1;
    const dirty = executeMove(s, { type: "set", x: 0, y: 0, v: wrongV });
    expect(slantGame.findMistakes?.(dirty)?.length ?? 0).toBeGreaterThan(0);
    const res = slantGame.hint?.(dirty);
    expect(res?.ok).toBe(false);
  });

  test("plan solves every generated board, from empty and mid-solve", () => {
    for (const [w, h, diff] of [
      [5, 5, DIFF_EASY],
      [8, 8, DIFF_HARD],
      [12, 10, DIFF_HARD],
    ] as const) {
      for (let seed = 0; seed < 8; seed++) {
        const s = freshState(w, h, diff, `plan-${w}.${h}.${diff}.${seed}`);
        const solved = applyPlan(s);
        expect(solved.completed).toBe(true);

        // Mid-solve: apply half the plan, re-request, finish.
        const res = slantGame.hint?.(s);
        if (!res?.ok) throw new Error("expected plan");
        let mid = s;
        const half = Math.floor(res.steps.length / 2);
        for (let i = 0; i < half; i++) mid = executeMove(mid, res.steps[i].move);
        const solved2 = applyPlan(mid);
        expect(solved2.completed).toBe(true);
      }
    }
  });

  test("every step is narrated in the necessity voice with visible evidence", () => {
    for (let seed = 0; seed < 12; seed++) {
      const s = freshState(8, 8, DIFF_HARD, `voice-${seed}`);
      const res = slantGame.hint?.(s);
      if (!res?.ok) throw new Error("expected plan");
      for (const step of res.steps) {
        expect(step.explanation.length).toBeGreaterThan(0);
        // Conclusion carries a necessity modal, never a bare "is/stays".
        expect(step.explanation).toMatch(/must (be|slant|stay)/);
        const hl = step.highlights as SlantHint;
        // Visible evidence: an area, a ringed anchor, a driving clue, or the
        // firing's still-to-do siblings (never a bare conclusion).
        const hasEvidence =
          (hl.area?.length ?? 0) > 0 ||
          hl.ref !== undefined ||
          hl.clue !== undefined ||
          (hl.siblings?.length ?? 0) > 0;
        expect(hasEvidence).toBe(true);
      }
    }
  });

  test("clue firings lead with the indication and group as one journey", () => {
    // Scan for a clue-fill/empty opener across seeds.
    let sawClue = false;
    let sawGroupedJourney = false;
    for (let seed = 0; seed < 20 && !(sawClue && sawGroupedJourney); seed++) {
      const s = freshState(8, 8, DIFF_HARD, `clue-${seed}`);
      const res = slantGame.hint?.(s);
      if (!res?.ok) continue;
      for (let i = 0; i < res.steps.length; i++) {
        const e = res.steps[i].explanation;
        if (/^(This \d clue|A [04] clue)/.test(e)) {
          sawClue = true;
          const hl = res.steps[i].highlights as SlantHint;
          expect(hl.clue).toBeDefined();
        }
        if (res.steps[i].continuesPrevious) {
          sawGroupedJourney = true;
          expect(res.steps[i].explanation).toMatch(/^The same clue forces this square/);
        }
      }
    }
    expect(sawClue).toBe(true);
    expect(sawGroupedJourney).toBe(true);
  });

  test("loop / dead-end / equivalence firings each get their narration", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 40 && seen.size < 3; seed++) {
      const s = freshState(12, 10, DIFF_HARD, `adv-${seed}`);
      const res = slantGame.hint?.(s);
      if (!res?.ok) continue;
      for (const step of res.steps) {
        const e = step.explanation;
        if (/already joined by a chain/.test(e)) seen.add("loop");
        if (/boxed in/.test(e)) seen.add("deadend");
        if (/locked to the same slant/.test(e)) {
          seen.add("equiv");
          expect((step.highlights as SlantHint).ref).toBeDefined();
        }
      }
    }
    // Loop and dead-end are common; equivalence appears on most large boards.
    expect(seen.has("loop")).toBe(true);
    expect(seen.has("deadend")).toBe(true);
    expect(seen.has("equiv")).toBe(true);
  });

  test("hintKeepTrack: the hinted move completes, a wrong move drops the plan", () => {
    const s = freshState(8, 8, DIFF_HARD, "track-1");
    const res = slantGame.hint?.(s);
    if (!res?.ok) throw new Error("expected plan");
    const step = res.steps[0];
    expect(slantGame.hintKeepTrack?.(step.move, step, s)).toBe("completed");
    // The opposite slash on the same square is off-plan.
    const m = step.move as Extract<SlantMove, { type: "set" }>;
    const wrong: SlantMove = { type: "set", x: m.x, y: m.y, v: (m.v === 1 ? -1 : 1) as 1 | -1 };
    expect(slantGame.hintKeepTrack?.(wrong, step, s)).toBe("off");
  });
});
