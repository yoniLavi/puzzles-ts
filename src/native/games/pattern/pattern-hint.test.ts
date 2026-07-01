/**
 * Tier-1 behavioural tests for the Pattern (Nonograms) explained hint.
 *
 * The cross-game guarantees (a hint solves from any mid-game position; a plan
 * step is never a no-op; `hint()` is pure) live in
 * `engine/hint-resume.test.ts`, which already includes `patternGame`. This file
 * covers the Pattern-specific bar: the plan completes the board, every forced
 * cell agrees with the unique solution, the narration teaches (indication-led,
 * necessity voice), the colour-legend roles are disjoint, and refusal +
 * keep-track behave.
 */
import { describe, expect, it } from "vitest";
import { randomNew } from "../../random/index.ts";
import { type PatternHint, patternGame } from "./index.ts";
import { deduceHintPlan, solveState } from "./solver.ts";
import {
  GRID_EMPTY,
  GRID_FULL,
  GRID_UNKNOWN,
  type PatternMove,
  type PatternParams,
  type PatternState,
} from "./state.ts";

const SEEDS = ["ph-a", "ph-b", "ph-c", "ph-d", "ph-e"];
const P: PatternParams = { w: 10, h: 10 };

function freshBoard(seed: string): PatternState {
  const { desc } = patternGame.newDesc(P, randomNew(seed));
  return patternGame.newState(P, desc);
}

/** `hint`/`solve` are optional on `Game`; assert Pattern provides them. */
function doHint(state: PatternState) {
  const r = patternGame.hint?.(state);
  if (!r) throw new Error("pattern has no hint()");
  return r;
}
function doSolve(state: PatternState) {
  const r = patternGame.solve?.(state, state);
  if (!r) throw new Error("pattern has no solve()");
  return r;
}

describe("pattern hint — plan correctness", () => {
  it("the full plan solves every generated board", () => {
    for (const seed of SEEDS) {
      let state = freshBoard(seed);
      const res = doHint(state);
      expect(res.ok, `${seed}: expected a plan from the empty board`).toBe(true);
      if (!res.ok) continue;
      for (const step of res.steps) state = patternGame.executeMove(state, step.move);
      expect(state.completed, `${seed}: plan did not complete the board`).toBe(true);
    }
  });

  it("every forced cell agrees with the unique solution", () => {
    for (const seed of SEEDS) {
      const state = freshBoard(seed);
      const solution = solveState(state);
      expect(solution).not.toBeNull();
      if (!solution) continue;
      const plan = deduceHintPlan(state);
      for (const m of plan) {
        for (const cell of m.cells) {
          expect(
            solution[cell],
            `${seed}: hinted cell ${cell} value ${m.value} contradicts the solution`,
          ).toBe(m.value);
          // A hint only ever forces a currently-undecided cell.
          expect(state.grid[cell]).toBe(GRID_UNKNOWN);
        }
      }
    }
  });

  it("each firing is single-colour (black overlaps, white gaps)", () => {
    for (const seed of SEEDS) {
      const plan = deduceHintPlan(freshBoard(seed));
      for (const m of plan) {
        expect([GRID_FULL, GRID_EMPTY]).toContain(m.value);
        if (m.reason.kind === "overlap") expect(m.value).toBe(GRID_FULL);
        if (m.reason.kind === "unreachable" || m.reason.kind === "lineEmpty") {
          expect(m.value).toBe(GRID_EMPTY);
        }
      }
    }
  });
});

describe("pattern hint — narration", () => {
  it("leads with the indication and concludes in the necessity voice", () => {
    for (const seed of SEEDS) {
      const res = doHint(freshBoard(seed));
      if (!res.ok) continue;
      for (const step of res.steps) {
        const t = step.explanation;
        // Opens by naming the board pattern (the row/column being reasoned over).
        expect(t, `bad opener: "${t}"`).toMatch(/^(This|No run|Only one)\b/);
        // Concludes with a modal of necessity, never a bare state-of-being verb.
        expect(t, `no necessity modal: "${t}"`).toMatch(/must (be|stay) (black|white)/);
        expect(t, `flat state-of-being verb: "${t}"`).not.toMatch(
          /\b(is|are|stays|it's)\b/,
        );
      }
    }
  });

  it("re-reads cleanly at the pinned (zero-slack) extreme", () => {
    // A run with no room to slide must not narrate "slide only 0 cells".
    let sawPinned = false;
    for (const seed of SEEDS) {
      const res = doHint(freshBoard(seed));
      if (!res.ok) continue;
      for (const step of res.steps) {
        expect(step.explanation).not.toMatch(/slide only 0 cell/);
        if (/has nowhere to slide/.test(step.explanation)) sawPinned = true;
      }
    }
    expect(sawPinned, "expected at least one zero-slack firing").toBe(true);
  });
});

describe("pattern hint — colour legend", () => {
  it("target / black-ref / white-ref roles are disjoint", () => {
    for (const seed of SEEDS) {
      const res = doHint(freshBoard(seed));
      if (!res.ok) continue;
      for (const step of res.steps) {
        const h = step.highlights as PatternHint;
        const targets = new Set(h.cells);
        for (const b of h.blackRefs) expect(targets.has(b)).toBe(false);
        for (const w of h.whiteRefs) expect(targets.has(w)).toBe(false);
        const blacks = new Set(h.blackRefs);
        for (const w of h.whiteRefs) expect(blacks.has(w)).toBe(false);
      }
    }
  });

  it("a cited ref is an actually-placed mark of its own colour", () => {
    // Rings must sit on decided cells (their colour is the evidence), never on
    // an undecided cell or a forced target.
    for (const seed of SEEDS) {
      const state = freshBoard(seed);
      const plan = deduceHintPlan(state);
      // Walk the plan on a working grid so refs are checked against the board
      // the step actually fires on.
      const working = Uint8Array.from(state.grid);
      for (const m of plan) {
        for (const b of m.blackRefs) expect(working[b]).toBe(GRID_FULL);
        for (const w of m.whiteRefs) expect(working[w]).toBe(GRID_EMPTY);
        for (const c of m.cells) working[c] = m.value;
      }
    }
  });
});

describe("pattern hint — refusal", () => {
  it("refuses on an already-solved board", () => {
    const state = freshBoard("ph-a");
    const sr = doSolve(state);
    expect(sr.ok).toBe(true);
    if (!sr.ok) return;
    const done = patternGame.executeMove(state, sr.move);
    expect(doHint(done).ok).toBe(false);
  });

  it("refuses on a board with a mistake, and flags it", () => {
    const state = freshBoard("ph-b");
    const solution = solveState(state);
    if (!solution) throw new Error("expected solvable");
    // Place the opposite of the solution at cell 0 → a guaranteed mistake.
    const wrong: PatternMove = {
      type: "fillCells",
      value: solution[0] === GRID_FULL ? GRID_EMPTY : GRID_FULL,
      cells: [0],
    };
    const bad = patternGame.executeMove(state, wrong);
    expect((patternGame.findMistakes?.(bad) ?? []).length).toBeGreaterThan(0);
    const res = doHint(bad);
    expect(res.ok).toBe(false);
  });
});

describe("pattern hint — keep track", () => {
  it("completes on a full follow, tracks a partial, drops a deviation", () => {
    const state = freshBoard("ph-c");
    const res = doHint(state);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Find a multi-cell step to exercise the shrink path.
    const step = res.steps.find((s) => (s.highlights as PatternHint).cells.length > 1);
    expect(step).toBeDefined();
    if (!step) return;
    const h = step.highlights as PatternHint;

    // A partial fill of one target cell → onTrack, step shrinks to the rest.
    const partial: PatternMove = {
      type: "fillCells",
      value: h.value,
      cells: [h.cells[0]],
    };
    const clone = { ...step, highlights: { ...h }, move: step.move };
    expect(patternGame.hintKeepTrack?.(partial, clone, state)).toBe("onTrack");
    expect((clone.highlights as PatternHint).cells).toEqual(h.cells.slice(1));

    // Filling all cells at once → completed.
    const fresh = res.steps.find((s) => (s.highlights as PatternHint).cells.length > 1);
    if (fresh) {
      const fh = fresh.highlights as PatternHint;
      const all: PatternMove = {
        type: "fillCells",
        value: fh.value,
        cells: [...fh.cells],
      };
      expect(
        patternGame.hintKeepTrack?.(all, { ...fresh, highlights: { ...fh } }, state),
      ).toBe("completed");
    }

    // Wrong value on a target → off.
    const wrongVal: PatternMove = {
      type: "fillCells",
      value: h.value === GRID_FULL ? GRID_EMPTY : GRID_FULL,
      cells: [h.cells[0]],
    };
    expect(
      patternGame.hintKeepTrack?.(wrongVal, { ...step, highlights: { ...h } }, state),
    ).toBe("off");
  });
});
