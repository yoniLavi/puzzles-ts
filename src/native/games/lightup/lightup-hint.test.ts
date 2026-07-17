/**
 * Behavioural tests for the Light Up explained hint (`add-lightup-hint`).
 *
 * The recorder-off byte-match guard is `lightup-differential.test.ts`
 * (unchanged by this change); these tests cover the recorder-on plan:
 * completeness on Easy/Tricky boards, the bleed rule (a step's marks stay
 * inside its narrated evidence), the narration voice guards, refusals,
 * keep-track shrinking, and the honest Unreasonable-tier refusal at the
 * guess point.
 */
import { describe, expect, it } from "vitest";
import type { HintStep } from "../../engine/game.ts";
import { randomNew } from "../../random/index.ts";
import { type LightupHint, lightupGame } from "./index.ts";
import { deduceHintPlan, solveUnique } from "./solver.ts";
import {
  F_BLACK,
  F_LIGHT,
  getSurrounds,
  idx,
  type LightupMove,
  type LightupParams,
  type LightupState,
  SYMM_ROT4,
} from "./state.ts";

type Step = HintStep<LightupMove, LightupHint>;

const EASY: LightupParams = { w: 7, h: 7, blackpc: 20, symm: SYMM_ROT4, difficulty: 0 };
const TRICKY: LightupParams = { ...EASY, difficulty: 1 };
const UNREASONABLE: LightupParams = { ...EASY, difficulty: 2 };

function freshState(p: LightupParams, seed: string): LightupState {
  const { desc } = lightupGame.newDesc(p, randomNew(seed));
  return lightupGame.newState(p, desc);
}

function planSteps(state: LightupState): Step[] {
  const res = lightupGame.hint?.(state);
  if (!res?.ok) throw new Error(`hint refused: ${res?.error}`);
  // The Game interface erases the highlights type; restore it.
  return res.steps as Step[];
}

describe("plan completeness", () => {
  for (const [name, params] of [
    ["easy", EASY],
    ["tricky", TRICKY],
  ] as const) {
    it(`the plan solves every generated ${name} board when applied in order`, () => {
      for (const seed of ["lh-a", "lh-b", "lh-c"]) {
        let state = freshState(params, `${seed}-${name}`);
        const steps = planSteps(state);
        for (const step of steps) state = lightupGame.executeMove(state, step.move);
        expect(state.completed).toBe(true);
      }
    });
  }
});

describe("bleed rule: a step's marks stay inside its narrated evidence", () => {
  it("holds on every firing of easy+tricky plans", () => {
    for (const [params, seed] of [
      [EASY, "lh-bleed-e"],
      [TRICKY, "lh-bleed-t"],
    ] as const) {
      const state = freshState(params, seed);
      const firings = deduceHintPlan(state);
      expect(firings.length).toBeGreaterThan(0);
      for (const f of firings) {
        switch (f.reason.kind) {
          case "forcedLight": {
            // The forced bulb is one of the corridor's candidates.
            expect(f.cells).toHaveLength(1);
            const { corridor } = f.reason;
            expect(
              corridor.some((c) => c.x === f.cells[0].x && c.y === f.cells[0].y),
            ).toBe(true);
            break;
          }
          case "clueSatisfied":
          case "clueSaturated": {
            // Every marked cell is a neighbour of the narrated clue.
            const around = getSurrounds(
              state.w,
              state.h,
              f.reason.clue.x,
              f.reason.clue.y,
            );
            for (const cell of f.cells) {
              expect(around.some((s) => s.x === cell.x && s.y === cell.y)).toBe(true);
            }
            break;
          }
          case "discountUnlit":
          case "discountClue":
            // One discounted square per firing, with a non-empty set.
            expect(f.cells).toHaveLength(1);
            expect(f.reason.set.length).toBeGreaterThan(0);
            break;
        }
      }
    }
  });
});

describe("narration", () => {
  it("every step concludes in the necessity voice and carries visible evidence", () => {
    for (const [params, seed] of [
      [EASY, "lh-narr-e"],
      [TRICKY, "lh-narr-t"],
    ] as const) {
      const steps = planSteps(freshState(params, seed));
      for (const step of steps) {
        expect(step.explanation).toMatch(
          /must (hold a bulb|be a bulb|be crossed out|all be crossed out)/,
        );
        const hl = step.highlights;
        if (!hl) throw new Error("step without highlights");
        expect(hl.targets.length).toBeGreaterThan(0);
        // Visible evidence: an area, a ringed dark square, or a
        // recoloured clue — except the self-lighting forcedLight corner
        // case, whose evidence is the board geometry itself.
        const selfLit =
          hl.kind === "light" && hl.area.length === 0 && !hl.dark && !hl.clue;
        if (!selfLit) {
          expect(
            hl.area.length > 0 || hl.dark !== undefined || hl.clue !== undefined,
          ).toBe(true);
        }
      }
    }
  });

  it("words and picture agree: 'ringed'/'shaded'/'highlighted clue' only when present", () => {
    for (const [params, seed] of [
      [EASY, "lh-wp-e"],
      [TRICKY, "lh-wp-t"],
    ] as const) {
      const steps = planSteps(freshState(params, seed));
      for (const step of steps) {
        const hl = step.highlights;
        if (!hl) throw new Error("step without highlights");
        if (/ringed (dark )?square/.test(step.explanation)) {
          expect(hl.dark).toBeDefined();
        }
        if (step.explanation.includes("shaded square")) {
          expect(hl.area.length).toBeGreaterThan(0);
        }
        if (step.explanation.includes("highlighted clue")) {
          expect(hl.clue).toBeDefined();
        }
      }
    }
  });
});

describe("refusals", () => {
  it("refuses on a solved board", () => {
    let state = freshState(EASY, "lh-solved");
    for (const step of planSteps(state)) {
      state = lightupGame.executeMove(state, step.move);
    }
    expect(state.completed).toBe(true);
    const res = lightupGame.hint?.(state);
    expect(res?.ok).toBe(false);
    if (res && !res.ok) expect(res.error).toMatch(/already solved/);
  });

  it("refuses on a board with mistakes", () => {
    const state = freshState(EASY, "lh-wrong");
    const solution = solveUnique(state);
    if (!solution) throw new Error("board not uniquely solvable?");
    // Place a bulb on a square the solution keeps empty.
    let placed: LightupState | null = null;
    outer: for (let y = 0; y < state.h; y++) {
      for (let x = 0; x < state.w; x++) {
        const i = idx(x, y, state.w);
        if (state.flags[i] & F_BLACK) continue;
        if (solution.flags[i] & F_LIGHT) continue;
        placed = lightupGame.executeMove(state, {
          ops: [{ kind: "light", x, y }],
        });
        break outer;
      }
    }
    if (!placed) throw new Error("no wrong square found");
    const res = lightupGame.hint?.(placed);
    expect(res?.ok).toBe(false);
    if (res && !res.ok) expect(res.error).toMatch(/mistakes/);
  });

  it("an Unreasonable board gets the deductive prefix, then an honest refusal", () => {
    let state = freshState(UNREASONABLE, "lh-unreasonable");
    // Follow freshly-recomputed hints until the guess point.
    for (let moves = 0; moves < 200; moves++) {
      const res = lightupGame.hint?.(state);
      if (!res) throw new Error("no hint()");
      if (!res.ok) {
        expect(res.error).toMatch(/trial and error/);
        expect(state.completed).toBe(false);
        return;
      }
      state = lightupGame.executeMove(state, res.steps[0].move);
    }
    throw new Error("never reached the guess point (board solved deductively?)");
  });
});

describe("hintKeepTrack", () => {
  /** First multi-cell step of a plan, with the state it fires from. */
  function multiCellStep(): { state: LightupState; step: Step } {
    for (const seed of ["lh-kt-a", "lh-kt-b", "lh-kt-c", "lh-kt-d"]) {
      let state = freshState(EASY, seed);
      for (let guard = 0; guard < 200; guard++) {
        const steps = planSteps(state);
        const step = steps[0];
        if (step.highlights && step.highlights.targets.length > 1) {
          return { state, step };
        }
        state = lightupGame.executeMove(state, step.move);
        if (state.completed) break;
      }
    }
    throw new Error("no multi-cell step found in scanned seeds");
  }

  it("a single mark on one target shrinks the step in place (onTrack)", () => {
    const { state, step } = multiCellStep();
    const hl = step.highlights;
    if (!hl) throw new Error("no highlights");
    const before = hl.targets.length;
    const first = hl.targets[0];
    const verdict = lightupGame.hintKeepTrack?.(
      { ops: [{ kind: hl.kind, x: first.x, y: first.y }] },
      step,
      state,
    );
    expect(verdict).toBe("onTrack");
    expect(step.highlights?.targets.length).toBe(before - 1);
    expect(step.move.ops.length).toBe(before - 1);
  });

  it("covering the last remaining target completes; a stray move is off", () => {
    const { state, step } = multiCellStep();
    const hl = step.highlights;
    if (!hl) throw new Error("no highlights");
    // Whole step in one grouped move → completed.
    expect(lightupGame.hintKeepTrack?.(step.move, step, state)).toBe("completed");
    // A move of the wrong kind on a target → off.
    const t = hl.targets[0];
    const wrongKind = hl.kind === "light" ? "impossible" : "light";
    expect(
      lightupGame.hintKeepTrack?.(
        { ops: [{ kind: wrongKind, x: t.x, y: t.y }] },
        step,
        state,
      ),
    ).toBe("off");
    // A move elsewhere → off.
    let elsewhere: { x: number; y: number } | null = null;
    for (let y = 0; y < state.h && !elsewhere; y++) {
      for (let x = 0; x < state.w && !elsewhere; x++) {
        const i = idx(x, y, state.w);
        if (state.flags[i] & F_BLACK) continue;
        if (hl.targets.some((c) => c.x === x && c.y === y)) continue;
        elsewhere = { x, y };
      }
    }
    if (!elsewhere) throw new Error("no non-target square");
    expect(
      lightupGame.hintKeepTrack?.(
        { ops: [{ kind: hl.kind, x: elsewhere.x, y: elsewhere.y }] },
        step,
        state,
      ),
    ).toBe("off");
  });
});

describe("refreshHintStep", () => {
  it("drops already-done targets and resolves to null when all are done", () => {
    let state = freshState(EASY, "lh-refresh");
    const step = planSteps(state)[0];
    const hl = step.highlights;
    if (!hl) throw new Error("no highlights");
    const first = hl.targets[0];
    // The player performs the first target's mark themselves.
    state = lightupGame.executeMove(state, {
      ops: [{ kind: hl.kind, x: first.x, y: first.y }],
    });
    const refreshed = lightupGame.refreshHintStep?.(step, state) as Step | null;
    if (hl.targets.length === 1) {
      expect(refreshed).toBeNull();
    } else {
      expect(refreshed?.highlights?.targets.length).toBe(hl.targets.length - 1);
      expect(refreshed?.move.ops.length).toBe(hl.targets.length - 1);
      // Fully applied → resolved.
      let done = state;
      if (refreshed) done = lightupGame.executeMove(done, refreshed.move);
      expect(lightupGame.refreshHintStep?.(step, done)).toBeNull();
    }
  });
});
