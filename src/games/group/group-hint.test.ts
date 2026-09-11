/**
 * Group hint tests: the recorded deductions, the plan the hint builds, its
 * refusals, and the keep-track verdicts.
 *
 * The cross-game guards (`hint-resume` / `hint-quality` / `hint-overlay`) already
 * cover convergence, purity, narration form and overlay-reaches-cache once Group
 * is enrolled in `hint-games.ts`; this file covers the Group-specific techniques
 * — the associativity placement, the identity-row/column fill journey, and the
 * identity-hidden identity-mark elimination — which the shared first-leaf preset
 * (6×6 Normal, identity shown) never exercises.
 */

import { describe, expect, it } from "vitest";
import type { HintStep } from "../../engine/game.ts";
import { randomNew } from "../../engine/random/index.ts";
import { groupGame } from "./index.ts";
import { type HintReason, recordGroupDeductions } from "./solver.ts";
import {
  DIFF_EXTREME,
  type GroupMove,
  type GroupParams,
  type GroupState,
  newState,
} from "./state.ts";

const NORMAL: GroupParams = { w: 6, diff: 1, id: true };
const HARD_HIDDEN: GroupParams = { w: 8, diff: 2, id: false };

function board(p: GroupParams, seed: string): GroupState {
  const { desc } = groupGame.newDesc(p, randomNew(seed));
  return newState(p, desc);
}

/** Walk hints from `state`, applying each plan's first step, collecting the
 * narrations seen and whether the board reached solved. */
function walk(
  p: GroupParams,
  seed: string,
): { texts: string[]; solved: boolean; states: GroupState[] } {
  let state = board(p, seed);
  const texts: string[] = [];
  const states: GroupState[] = [state];
  for (let i = 0; i < 500 && groupGame.status(state) === "ongoing"; i++) {
    const res = groupGame.hint?.(state, undefined);
    if (!res?.ok) break;
    for (const s of res.steps) texts.push(s.explanation);
    state = groupGame.executeMove(state, res.steps[0].move);
    states.push(state);
  }
  return { texts, solved: groupGame.status(state) === "solved", states };
}

describe("group hint — recorded deductions", () => {
  it("records each Group technique across generated boards", () => {
    const kinds = new Set<string>();
    for (const [p, seeds] of [
      [NORMAL, ["a1", "a2", "a3", "a4", "a5"]],
      [HARD_HIDDEN, ["h1", "h2", "h3", "h4", "h5", "h6"]],
    ] as const) {
      for (const seed of seeds) {
        const state = board(p, seed);
        const ops = recordGroupDeductions(
          state.grid.slice(),
          p.w,
          Math.min(p.diff, DIFF_EXTREME),
        );
        for (const op of ops) kinds.add((op.reason as HintReason).kind);
      }
    }
    // Group's own three deductions plus the generic Latin single are all fired.
    expect(kinds.has("associativity")).toBe(true);
    expect(kinds.has("identityFill")).toBe(true);
    expect(kinds.has("identityElim")).toBe(true);
    expect(kinds.has("single")).toBe(true);
  });

  it("an associativity record names its triple and the forced fourth product", () => {
    // Find any board whose plan surfaces an associativity step, and assert the
    // narration states the law with concrete element letters.
    let text: string | undefined;
    for (const seed of ["a1", "a2", "a3", "a4", "a5", "a6"]) {
      const { texts } = walk(NORMAL, seed);
      text = texts.find((t) => /in any group/.test(t));
      if (text) break;
    }
    expect(text).toBeDefined();
    // "…Because (a·b)·c = a·(b·c) in any group, <fourth> must also be <v>."
    expect(text).toMatch(/The grid shows .+·.+ = .+, .+·.+ = .+ and/);
    expect(text).toMatch(/Because \(.+·.+\)·.+ = .+·\(.+·.+\) in any group/);
    expect(text).toMatch(/must also be [a-z]\./);
  });
});

describe("group hint — plan solves boards", () => {
  it("solves a Normal (identity-shown) board by following hints", () => {
    const { solved } = walk(NORMAL, "solve-normal");
    expect(solved).toBe(true);
  });

  it("solves an identity-hidden Hard board, teaching an identity-mark elimination", () => {
    // The identity-hidden `DIFF_HARD` (Tricky) tier is the one that exercises
    // solverHard, which the shared first-leaf resume never reaches.
    let sawElim = false;
    let anySolved = false;
    for (const seed of ["h1", "h2", "h3", "h4", "h5", "h6"]) {
      const { texts, solved } = walk(HARD_HIDDEN, seed);
      if (solved) anySolved = true;
      if (texts.some((t) => /can't be the identity/.test(t)) && solved) {
        sawElim = true;
        break;
      }
    }
    expect(anySolved).toBe(true);
    expect(sawElim).toBe(true);
  });

  it("a hint resumes from a self-played mid-game position (identity-hidden)", () => {
    // Reach a mid-game position by following ~1/3 of a solve, then confirm a
    // fresh hint still makes progress and drives to solved.
    const { states } = walk(HARD_HIDDEN, "h2");
    const mid = states[Math.floor(states.length / 3)];
    let state = mid;
    let progressed = false;
    for (let i = 0; i < 500 && groupGame.status(state) === "ongoing"; i++) {
      const res = groupGame.hint?.(state, undefined);
      expect(res?.ok, `refused mid-game after ${i} moves`).toBe(true);
      if (!res?.ok) break;
      state = groupGame.executeMove(state, res.steps[0].move);
      progressed = true;
    }
    expect(progressed).toBe(true);
    expect(groupGame.status(state)).toBe("solved");
  });
});

describe("group hint — refusals", () => {
  it("refuses on a solved board", () => {
    const orig = board(NORMAL, "refuse-solved");
    const sr = groupGame.solve?.(orig, orig, undefined);
    expect(sr?.ok).toBe(true);
    if (!sr?.ok) return;
    const solved = groupGame.executeMove(orig, sr.move);
    const res = groupGame.hint?.(solved, undefined);
    expect(res?.ok).toBe(false);
  });

  it("refuses on a board with a mistake (and findMistakes flags it)", () => {
    const orig = board(NORMAL, "refuse-mistake");
    const sr = groupGame.solve?.(orig, orig, undefined);
    if (!sr?.ok || sr.move.type !== "solve") throw new Error("solve() failed");
    const soln = sr.move.grid;
    // Fill the first empty cell with a *wrong* value.
    const w = orig.w;
    let target = -1;
    for (let i = 0; i < w * w; i++)
      if (!orig.immutable[i]) {
        target = i;
        break;
      }
    expect(target).toBeGreaterThanOrEqual(0);
    const wrong = (soln[target] % w) + 1; // any value != the solution's
    const bad = groupGame.executeMove(orig, {
      type: "set",
      cells: [{ x: target % w, y: (target / w) | 0 }],
      n: wrong,
    });
    expect(groupGame.findMistakes?.(bad).length ?? 0).toBeGreaterThan(0);
    const res = groupGame.hint?.(bad, undefined);
    expect(res?.ok).toBe(false);
  });
});

describe("group hint — keepTrack", () => {
  it("a placement move completes a set step; a wrong one drops the plan", () => {
    const state = board(NORMAL, "kt-place");
    const res = groupGame.hint?.(state, undefined);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    // Find the first placement step in the plan.
    const step = res.steps.find((s) => (s.move as GroupMove).type === "set");
    expect(step).toBeDefined();
    if (!step) return;
    const m = step.move as Extract<GroupMove, { type: "set" }>;
    const cell = m.cells[0];
    expect(
      groupGame.hintKeepTrack?.(
        { type: "set", cells: [{ x: cell.x, y: cell.y }], n: m.n },
        step,
        state,
      ),
    ).toBe("completed");
    // A different value at the same cell is off-plan.
    expect(
      groupGame.hintKeepTrack?.(
        { type: "set", cells: [{ x: cell.x, y: cell.y }], n: (m.n % state.w) + 1 },
        step,
        state,
      ),
    ).toBe("off");
  });

  it("a pencil toggle clearing a strike mark tracks the plan", () => {
    // Reach a pencilStrike step on an identity-hidden Tricky board whose first
    // mark is live against the current board, then follow it with a toggle.
    let found: { state: GroupState; step: HintStep<GroupMove> } | null = null;
    for (const seed of ["h1", "h2", "h3", "h4", "h5"]) {
      let s = board(HARD_HIDDEN, seed);
      for (let i = 0; i < 500 && groupGame.status(s) === "ongoing" && !found; i++) {
        const res = groupGame.hint?.(s, undefined);
        if (!res?.ok) break;
        const strike = res.steps.find((st) => {
          const mv = st.move as GroupMove;
          if (mv.type !== "pencilStrike") return false;
          const k = mv.marks[0];
          return (s.pencil[k.y * s.w + k.x] & (1 << k.n)) !== 0;
        });
        if (strike) found = { state: s, step: strike };
        else s = groupGame.executeMove(s, res.steps[0].move);
      }
      if (found) break;
    }
    expect(found).not.toBeNull();
    if (!found) return;
    const mv = found.step.move as Extract<GroupMove, { type: "pencilStrike" }>;
    const k = mv.marks[0];
    const verdict = groupGame.hintKeepTrack?.(
      { type: "pencil", cells: [{ x: k.x, y: k.y }], n: k.n },
      found.step,
      found.state,
    );
    // Clearing one of several marks is onTrack; the sole mark would be completed.
    expect(verdict === "onTrack" || verdict === "completed").toBe(true);
  });

  it("a Mark-all completes a populate step", () => {
    // Force a populate step by taking an identity-hidden Tricky plan that needs it.
    for (const seed of ["h1", "h2", "h3", "h4", "h5"]) {
      let s = board(HARD_HIDDEN, seed);
      for (let i = 0; i < 500 && groupGame.status(s) === "ongoing"; i++) {
        const res = groupGame.hint?.(s, undefined);
        if (!res?.ok) break;
        const pop = res.steps.find((st) => (st.move as GroupMove).type === "pencilAll");
        if (pop) {
          expect(groupGame.hintKeepTrack?.({ type: "pencilAll" }, pop, s)).toBe(
            "completed",
          );
          expect(
            groupGame.hintKeepTrack?.(
              { type: "set", cells: [{ x: 0, y: 0 }], n: 1 },
              pop,
              s,
            ),
          ).toBe("off");
          return;
        }
        s = groupGame.executeMove(s, res.steps[0].move);
      }
    }
    throw new Error("no populate step reached on any identity-hidden Hard seed");
  });
});
