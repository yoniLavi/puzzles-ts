import { describe, expect, it } from "vitest";
import { randomNew } from "../../random/index.ts";
import { type RangeHint, rangeGame } from "./index.ts";
import { deduceHintPlan, findErrors } from "./solver.ts";
import {
  BLACK,
  decodeParams,
  EMPTY,
  newState,
  type RangeCellValue,
  type RangeMove,
  type RangeState,
  WHITE,
} from "./state.ts";

function fromSeed(params: string, seed: string): RangeState {
  const p = decodeParams(params);
  const { desc } = rangeGame.newDesc(p, randomNew(seed));
  return newState(p, desc);
}

describe("deduceHintPlan", () => {
  it("records an adjacency reason for a black cell's neighbour", () => {
    // 3x3, centre black, no clues — adjacency forces the 4 neighbours white.
    const grid = Int8Array.from([
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      BLACK,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
    ]);
    const plan = deduceHintPlan(grid, 3, 3);
    const adj = plan.find((m) => m.reason.kind === "adjacency");
    expect(adj).toBeDefined();
    expect(adj?.value).toBe(WHITE);
    if (adj?.reason.kind === "adjacency") {
      expect(adj.reason.from).toEqual({ r: 1, c: 1 });
    }
  });

  it("records a clue reason on a generated board", () => {
    const st = fromSeed("9x6", "range-hint-reason");
    const plan = deduceHintPlan(st.grid, st.w, st.h);
    expect(plan.length).toBeGreaterThan(0);
    expect(
      plan.some((m) => ["satisfied", "overrun", "reach"].includes(m.reason.kind)),
    ).toBe(true);
  });
});

describe("hint", () => {
  it("returns a plan whose moves are legal and solve the board", () => {
    const st = fromSeed("9x6", "range-hint-plan");
    const res = rangeGame.hint?.(st);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    expect(res.steps.length).toBeGreaterThan(0);
    expect(res.steps[0].explanation.length).toBeGreaterThan(0);

    // Apply every step move in order — the board ends error-free (solved).
    let cur = st;
    for (const step of res.steps) {
      cur = rangeGame.executeMove(cur, step.move);
    }
    expect(findErrors(cur.grid, cur.w, cur.h)).toBe(false);
    expect(cur.wasSolved).toBe(true);
  });

  it("gives every step visible evidence (an area to shade or a black to ring)", () => {
    // The product goal: a hint shows *why*, not just *what*. Across the
    // whole plan, no step may be a bare conclusion — each carries either a
    // shaded area (a clue's line of sight / a reach run / the white cells a
    // cut would isolate) or a ringed black premise cell.
    for (const seed of ["range-hint-plan", "range-evidence-2", "range-evidence-3"]) {
      const st = fromSeed("9x6", seed);
      const res = rangeGame.hint?.(st);
      if (!res?.ok) throw new Error("expected a plan");
      for (const step of res.steps) {
        const hl = step.highlights as RangeHint;
        const hasEvidence = hl.area.length > 0 || (hl.blackRefs?.length ?? 0) > 0;
        expect(hasEvidence).toBe(true);
        // The area never includes the target cell itself.
        expect(
          hl.area.some((a) => a.r === hl.target.r && a.c === hl.target.c),
        ).toBe(false);
      }
    }
  });

  it("refuses on a solved board", () => {
    const st = fromSeed("9x6", "range-hint-solved");
    const res0 = rangeGame.hint?.(st);
    if (!res0?.ok) throw new Error("expected a plan");
    let cur = st;
    for (const step of res0.steps) cur = rangeGame.executeMove(cur, step.move);
    const res = rangeGame.hint?.(cur);
    expect(res?.ok).toBe(false);
  });

  it("refuses when the board has a mistake", () => {
    const st = fromSeed("9x6", "range-hint-mistake");
    const solution = rangeGame.solve?.(st, st);
    if (!solution?.ok) throw new Error("expected solvable");
    const solved = rangeGame.executeMove(st, solution.move);
    const blackCell = solved.grid.findIndex((v) => v === BLACK);
    const r = Math.floor(blackCell / st.w);
    const c = blackCell % st.w;
    // Dot a solution-black cell white on the fresh board → a mistake.
    const wrong = rangeGame.executeMove(st, { sets: [{ r, c, value: "white" }] });
    expect(rangeGame.hint?.(wrong)?.ok).toBe(false);
  });
});

describe("hintKeepTrack", () => {
  it("completes when the move sets the hinted cell, off otherwise", () => {
    const st = fromSeed("9x6", "range-hint-track");
    const res = rangeGame.hint?.(st);
    if (!res?.ok) throw new Error("expected a plan");
    const step = res.steps[0];
    const target = (step.highlights as RangeHint | undefined)?.target;
    if (!target) throw new Error("expected a target");

    // The move that sets the hinted cell to the hinted value → completed.
    const right: RangeMove = {
      sets: [{ r: target.r, c: target.c, value: target.value }],
    };
    expect(rangeGame.hintKeepTrack?.(right, step, st)).toBe("completed");

    // The hinted cell, but the wrong value → off.
    const wrongValue: RangeCellValue = target.value === "black" ? "white" : "black";
    const wrong: RangeMove = {
      sets: [{ r: target.r, c: target.c, value: wrongValue }],
    };
    expect(rangeGame.hintKeepTrack?.(wrong, step, st)).toBe("off");

    // A different cell → off.
    const elsewhere: RangeMove = {
      sets: [{ r: (target.r + 1) % st.h, c: target.c, value: target.value }],
    };
    expect(rangeGame.hintKeepTrack?.(elsewhere, step, st)).toBe("off");
  });
});
