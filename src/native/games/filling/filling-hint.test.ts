/**
 * Filling (Fillomino) hint tests. Tier 1 (the grouped deduction, the hint
 * plan, keep-track, refusals) + tier 2.5 (a render scenario of a hint frame).
 * See docs/porting/hint-authoring.md.
 */
import { describe, expect, it } from "vitest";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { type FillingHint, fillingGame } from "./index.ts";
import { COL_HINT, COL_HINT_CELL } from "./render.ts";
import { deduceHintPlan, solveFilling } from "./solver.ts";
import { decodeParams, executeMove, type FillingState, newState } from "./state.ts";

function fromSeed(params: string, seed: string): FillingState {
  const p = decodeParams(params);
  const { desc } = fillingGame.newDesc(p, randomNew(seed));
  return newState(p, desc);
}

const SEEDS = ["filling-hint-a", "filling-hint-b", "filling-hint-c", "filling-hint-d"];

describe("deduceHintPlan", () => {
  it("groups a region's forced completion into one step", () => {
    // "1a2" = clue 1, empty, clue 2. The 2-region (one cell) can only complete
    // through the middle cell — an exact, single-square growth deduction.
    const st = newState({ w: 3, h: 1 }, "1a2");
    const plan = deduceHintPlan(st.board, 3, 1);
    expect(plan.length).toBe(1);
    expect(plan[0].cells).toEqual([1]);
    expect(plan[0].value).toBe(2);
    expect(plan[0].reason).toEqual({ kind: "growth", n: 2, exact: true });
    expect(plan[0].area).toEqual([2]); // the existing clue-2 cell, shaded
  });

  it("can force several squares of one region in a single step", () => {
    // A 4-region (one clue) in a 4x1 strip can only run rightward: the three
    // empty cells are all forced together → one exact multi-square growth step.
    const st = newState({ w: 4, h: 1 }, "4c");
    const plan = deduceHintPlan(st.board, 4, 1);
    expect(plan.length).toBe(1);
    expect([...plan[0].cells].sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(plan[0].reason).toEqual({ kind: "growth", n: 4, exact: true });
  });

  it("only ever emits the four known reason kinds", () => {
    const kinds = new Set<string>();
    for (let s = 0; s < 24; s++) {
      const st = fromSeed("9x7", `filling-kinds-${s}`);
      for (const m of deduceHintPlan(st.board, st.w, st.h)) kinds.add(m.reason.kind);
    }
    for (const k of kinds) {
      expect(["growth", "blocked", "lonely", "bitmap"]).toContain(k);
    }
    expect(kinds.has("growth")).toBe(true); // region growth dominates
  });

  it("every region-based step shows non-empty evidence, never its own targets", () => {
    // The product goal: a hint shows *why*. Region steps (growth / blocked)
    // must carry a shaded region; the global candidate-elimination (bitmap)
    // step may reason non-locally — relaxed. No step shades a target cell.
    for (const seed of SEEDS) {
      const st = fromSeed("9x7", seed);
      const plan = deduceHintPlan(st.board, st.w, st.h);
      expect(plan.length).toBeGreaterThan(0);
      for (const m of plan) {
        for (const c of m.cells) expect(m.area).not.toContain(c);
        if (m.reason.kind === "growth" || m.reason.kind === "blocked") {
          expect(m.area.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("hint", () => {
  it("returns a plan whose moves are legal and solve the board", () => {
    const st = fromSeed("9x7", "filling-hint-plan");
    const res = fillingGame.hint?.(st);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    expect(res.steps.length).toBeGreaterThan(0);

    let cur = st;
    for (const step of res.steps) {
      expect(step.explanation.length).toBeGreaterThan(0);
      cur = fillingGame.executeMove(cur, step.move);
    }
    expect(cur.completed).toBe(true);
  });

  it("never shades a target cell in its own area", () => {
    for (const seed of SEEDS) {
      const st = fromSeed("9x7", seed);
      const res = fillingGame.hint?.(st);
      if (!res?.ok) throw new Error("expected a plan");
      for (const step of res.steps) {
        const hl = step.highlights as FillingHint;
        for (const c of hl.cells) expect(hl.area).not.toContain(c);
      }
    }
  });

  it("refuses on a solved board", () => {
    const st = fromSeed("9x7", "filling-hint-solved");
    const res0 = fillingGame.hint?.(st);
    if (!res0?.ok) throw new Error("expected a plan");
    let cur = st;
    for (const step of res0.steps) cur = fillingGame.executeMove(cur, step.move);
    expect(cur.completed).toBe(true);
    expect(fillingGame.hint?.(cur)?.ok).toBe(false);
  });

  it("refuses when the board has a mistake", () => {
    const st = fromSeed("9x7", "filling-hint-mistake");
    const solution = solveFilling(st.clues, st.w, st.h).board;
    let target = -1;
    for (let i = 0; i < st.w * st.h; i++) {
      if (st.clues[i] === 0) {
        target = i;
        break;
      }
    }
    expect(target).toBeGreaterThanOrEqual(0);
    const wrong = solution[target] === 1 ? 2 : 1;
    const dirty = executeMove(st, { type: "set", cells: [target], value: wrong });
    expect(fillingGame.hint?.(dirty)?.ok).toBe(false);
  });
});

describe("hintKeepTrack", () => {
  it("completes on a full fill, off on the wrong value or an extra cell", () => {
    const st = fromSeed("9x7", "filling-hint-track");
    const res = fillingGame.hint?.(st);
    if (!res?.ok) throw new Error("expected a plan");
    const step = res.steps[0];
    const hl = step.highlights as FillingHint;

    // Filling all the step's cells with the hinted value → completed.
    const all = { type: "set" as const, cells: [...hl.cells], value: hl.value };
    expect(fillingGame.hintKeepTrack?.(all, step, st)).toBe("completed");

    // The hinted cells, but the wrong value → off.
    const wrongValue = {
      type: "set" as const,
      cells: [...hl.cells],
      value: hl.value === 1 ? 2 : 1,
    };
    expect(fillingGame.hintKeepTrack?.(wrongValue, step, st)).toBe("off");

    // A cell outside the step → off.
    const stray = st.clues.findIndex((v, i) => v === 0 && !hl.cells.includes(i));
    const elsewhere = { type: "set" as const, cells: [stray], value: hl.value };
    expect(fillingGame.hintKeepTrack?.(elsewhere, step, st)).toBe("off");
  });

  it("stays on track and shrinks the step on a partial fill of a group", () => {
    // The 4x1 "4c" board forces three squares in one step; filling one of them
    // keeps the step on track with the other two still to go.
    const st = newState({ w: 4, h: 1 }, "4c");
    const res = fillingGame.hint?.(st);
    if (!res?.ok) throw new Error("expected a plan");
    const step = res.steps[0];
    const hl = step.highlights as FillingHint;
    expect(hl.cells.length).toBe(3);

    const one = { type: "set" as const, cells: [hl.cells[0]], value: hl.value };
    expect(fillingGame.hintKeepTrack?.(one, step, st)).toBe("onTrack");
    // The step shrank to the remaining two squares.
    expect((step.highlights as FillingHint).cells).toHaveLength(2);
    expect((step.highlights as FillingHint).cells).not.toContain(hl.cells[0]);
  });
});

describe("filling hint render scenario", () => {
  it("paints the target(s) blue and shades the evidence region", () => {
    let result: ReturnType<typeof renderScenario> | null = null;
    for (let s = 0; s < 20; s++) {
      const r = renderScenario({
        game: fillingGame,
        id: `9x7#filling-render-${s}`,
        showHint: true,
      });
      const hl = r.hint?.highlights as FillingHint | undefined;
      if (hl && hl.area.length > 0) {
        result = r;
        break;
      }
    }
    if (!result) throw new Error("no seed produced an area-carrying first hint");

    const { recording } = result;
    expect(recording.ops.some((o) => o.op === "rect" && o.colour === COL_HINT)).toBe(
      true,
    );
    expect(
      recording.ops.some((o) => o.op === "rect" && o.colour === COL_HINT_CELL),
    ).toBe(true);
    expect(recording.ops.some((o) => o.op === "text")).toBe(true); // clues
    expect(recording.ops).toMatchSnapshot();
  });
});
