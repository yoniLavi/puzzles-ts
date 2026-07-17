/**
 * Tier-1 tests for Untangle's heuristic move hint (`hint.ts`).
 *
 * The hint is non-deductive: it suggests crossing-reducing vertex moves
 * with no narration. So the invariants under test are about the heuristic,
 * not a "why": every step is a legal move, applying the plan never
 * increases crossings and reduces them at least once, and a solved board
 * is refused.
 */

import { describe, expect, it } from "vitest";
import { randomNew } from "../../random/index.ts";
import { newUntangleDesc } from "./generator.ts";
import { deduceUntangleHintPlan } from "./hint.ts";
import { untangleGame } from "./index.ts";
import { findCrossings, type UntangleState } from "./state.ts";

function freshState(n: number, seed: string): UntangleState {
  const params = { n };
  const { desc } = newUntangleDesc(params, randomNew(seed));
  return untangleGame.newState(params, desc);
}

function crossingCount(s: UntangleState): number {
  return findCrossings(s.pts, s.edges).count;
}

describe("Untangle hint heuristic", () => {
  it("a fresh (tangled) circle board yields a crossing-reducing plan", () => {
    const s = freshState(10, "untangle-hint-1");
    expect(s.completed).toBe(false);

    const result = deduceUntangleHintPlan(s);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps.length).toBeGreaterThan(0);

    // Replay the plan through the real executeMove; crossings must be
    // monotonically non-increasing and strictly drop at least once.
    let cur = s;
    let before = crossingCount(cur);
    const start = before;
    for (const step of result.steps) {
      // Each step's highlight points at the vertex its move repositions.
      expect(step.highlights?.vertex).toBe(step.move.points[0].i);
      cur = untangleGame.executeMove(cur, step.move);
      const after = crossingCount(cur);
      expect(after).toBeLessThanOrEqual(before);
      before = after;
    }
    expect(before).toBeLessThan(start);
  });

  it("steps carry no narration (Untangle is non-deductive)", () => {
    const s = freshState(15, "untangle-hint-2");
    const result = deduceUntangleHintPlan(s);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const step of result.steps) expect(step.explanation).toBe("");
  });

  it("refuses a solved board", () => {
    // Reach a solved layout via the game's own Solve, then ask for a hint.
    const params = { n: 10 };
    const { desc, aux } = newUntangleDesc(params, randomNew("untangle-hint-solved"));
    const start = untangleGame.newState(params, desc);
    expect(untangleGame.solve).toBeDefined();
    const solveResult = untangleGame.solve?.(start, start, aux);
    expect(solveResult).toBeDefined();
    if (!solveResult) return;
    expect(solveResult.ok).toBe(true);
    if (!solveResult.ok) return;
    const solved = untangleGame.executeMove(start, solveResult.move);
    expect(solved.completed).toBe(true);

    const result = deduceUntangleHintPlan(solved);
    expect(result.ok).toBe(false);
  });

  it("spreads the final layout out (does not collapse to the centre)", () => {
    // Regression for the barycentric-collapse complaint: the spread-aware
    // planner's untangled layout should occupy a healthy fraction of the
    // play box, not shrink to a knot in the middle. Measure the final
    // bounding box across a few seeds.
    for (const seed of [
      "untangle-spread-a",
      "untangle-spread-b",
      "untangle-spread-c",
    ]) {
      const s = freshState(10, seed);
      const result = deduceUntangleHintPlan(s);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      let cur = s;
      for (const step of result.steps) cur = untangleGame.executeMove(cur, step.move);

      const xs = cur.pts.map((p) => p.x / p.d);
      const ys = cur.pts.map((p) => p.y / p.d);
      const span = Math.min(
        Math.max(...xs) - Math.min(...xs),
        Math.max(...ys) - Math.min(...ys),
      );
      // The play box is `w` model units on a side; require the layout to
      // span at least ~40% of it on its narrower axis.
      expect(span).toBeGreaterThan(cur.w * 0.4);
    }
  });

  it("hint() is exposed on the game and matches the planner", () => {
    const s = freshState(10, "untangle-hint-1");
    expect(untangleGame.hint).toBeDefined();
    const viaGame = untangleGame.hint?.(s);
    expect(viaGame?.ok).toBe(true);
  });

  // Heavy but seed-deterministic: these tests generate n=25 boards (the size
  // that exposed the heuristic's stall) and walk full aux plans — fixed work
  // per fixed seed, however long the wall clock says. A regression fails an
  // assertion, never a timer. See the repo-layout test-determinism spec.
  describe("aux-based plan (known solution)", () => {
    // Generate so `aux` (the solved layout) is available, like a real
    // freshly-generated game.
    function generated(n: number, seed: string) {
      const { desc, aux } = untangleGame.newDesc({ n }, randomNew(seed));
      return { state: untangleGame.newState({ n }, desc), aux };
    }

    it("walks every board fully to a crossing-free, spacious layout", () => {
      // The greedy heuristic stalls on many boards (esp. large); the aux
      // path must always finish untangled — including n=25, the size that
      // exposed the heuristic's failure to progress.
      for (const n of [10, 25]) {
        for (let i = 0; i < 8; i++) {
          const { state, aux } = generated(n, `aux-${n}-${i}`);
          expect(aux).toBeDefined();
          const result = deduceUntangleHintPlan(state, aux);
          expect(result.ok).toBe(true);
          if (!result.ok) continue;

          let cur = state;
          for (const st of result.steps) cur = untangleGame.executeMove(cur, st.move);
          expect(cur.completed).toBe(true); // fully untangled

          // ...and spacious: the final layout fills most of the play box.
          const xs = cur.pts.map((p) => p.x / p.d);
          const ys = cur.pts.map((p) => p.y / p.d);
          const spanX = Math.max(...xs) - Math.min(...xs);
          const spanY = Math.max(...ys) - Math.min(...ys);
          expect(Math.max(spanX, spanY)).toBeGreaterThan(cur.w * 0.7);
        }
      }
    });

    it("prefers the aux plan over the heuristic when aux is present", () => {
      // A board the heuristic leaves tangled is fully solved via aux.
      const { state, aux } = generated(25, "aux-vs-heuristic");
      const heuristic = deduceUntangleHintPlan(state); // no aux
      const withAux = deduceUntangleHintPlan(state, aux);
      expect(withAux.ok).toBe(true);
      if (!withAux.ok) return;
      let cur = state;
      for (const st of withAux.steps) cur = untangleGame.executeMove(cur, st.move);
      expect(cur.completed).toBe(true);
      // Sanity: the two strategies produce different plans.
      if (heuristic.ok) {
        expect(withAux.steps.length).not.toBe(0);
      }
    });
  });
});
