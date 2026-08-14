import { describe, expect, it } from "vitest";
import { randomNew } from "../../engine/random/index.ts";
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
        expect(hl.area.some((a) => a.r === hl.target.r && a.c === hl.target.c)).toBe(
          false,
        );
      }
    }
  });

  it("ties 'this cell' to the second mark, on every step of every reason", () => {
    // Every Range step shows a second mark (the test above pins that), so a
    // bare "this cell" would point at neither it nor the target
    // (`disambiguate-hint-deixis`). The tie is geometric — never a colour
    // name, which `docs/games/hints.md` § "Two marks on the board" forbids as
    // scheme-relative and invisible to a colour-blind reader.
    const TIE =
      /right next to the ringed black square|the next one out past the shaded run|along the shaded run as far as this cell|the shaded cells around it/;
    const kinds = new Set<string>();
    let checked = 0;
    for (const seed of ["range-hint-plan", "range-evidence-2", "range-evidence-3"]) {
      let cur = fromSeed("9x6", seed);
      for (let round = 0; round < 40; round++) {
        const res = rangeGame.hint?.(cur);
        if (!res?.ok) break;
        // `hint()` builds one step per plan entry, in order, so the reason and
        // the sentence it produced line up index for index.
        const plan = deduceHintPlan(cur.grid, cur.w, cur.h);
        expect(plan.length).toBe(res.steps.length);
        for (let i = 0; i < res.steps.length; i++) {
          const step = res.steps[i];
          kinds.add(plan[i].reason.kind);
          checked++;
          expect(
            TIE.test(step.explanation),
            `${plan[i].reason.kind}: ${step.explanation} — a second mark is shown but "this cell" is not tied to it`,
          ).toBe(true);
          // Words and picture agree in *both* directions: a sentence saying
          // "the highlighted N" is pointing at a mark, so the mark must exist.
          // The clue is named this way rather than as "clue N" because a clue
          // sits inside its own shaded line of sight and that run can hold a
          // second clue of the same value — seen live on 9x6, two 13s.
          const hl = step.highlights as RangeHint;
          if (/the highlighted \d+/i.test(step.explanation)) {
            expect(hl.clue, `${step.explanation} — no clue is marked`).toBeDefined();
          } else {
            expect(hl.clue).toBeUndefined();
          }
        }
        for (const step of res.steps) cur = rangeGame.executeMove(cur, step.move);
      }
    }
    // Vacuity guards: an empty sweep, or one that only ever reached the
    // adjacency rule (whose sentence was already tied), would pass the
    // assertion above while measuring nothing.
    expect(checked).toBeGreaterThan(50);
    expect([...kinds].sort()).toEqual([
      "adjacency",
      "connect",
      "overrun",
      "reach",
      "satisfied",
    ]);
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
    const blackCell = solved.grid.indexOf(BLACK);
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
