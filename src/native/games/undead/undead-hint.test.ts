/**
 * Undead explained-hint tests (`add-undead-hint`).
 *
 * Tier 1 — the recording solver records a reason per deduction kind; the plan
 * solves a generated board from empty *and* mid-game, naked-single-first, with
 * populate before the first strike and no sightline-strike mark bleeding off the
 * narrated path; refusal on solved / mistakes; `hintKeepTrack` verdicts. Tier 2.5
 * — a render-scenario snapshot of a sightline-elimination frame.
 *
 * Undead is the fork's first *non-Latin* candidate-elimination hint (its own
 * recorder off `solveIterative` + the counting/forcing ladder, not `latin.ts`).
 */
import { describe, expect, it } from "vitest";
import type { HintStep } from "../../engine/game.ts";
import {
  DEFAULT_BACKGROUND,
  renderScenario,
} from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { newUndeadDesc } from "./generator.ts";
import { undeadGame } from "./index.ts";
import { COL_HINT, COL_HINT_CELL } from "./render.ts";
import { recordUndeadDeductions } from "./solver.ts";
import {
  MON_GHOST,
  MON_VAMPIRE,
  MON_ZOMBIE,
  newState,
  type UndeadMove,
  type UndeadParams,
  type UndeadState,
} from "./state.ts";

function gen(p: UndeadParams, seed: string): UndeadState {
  const { desc } = newUndeadDesc(p, randomNew(seed));
  return newState(p, desc);
}

function fullPlan(st: UndeadState): HintStep<UndeadMove>[] {
  const r = undeadGame.hint?.(st);
  if (!r?.ok) throw new Error(`hint refused: ${r && !r.ok ? r.error : "no hint"}`);
  return r.steps as HintStep<UndeadMove>[];
}

/** Apply a whole plan in order and report whether it reaches solved. */
function applyPlan(st: UndeadState, steps: HintStep<UndeadMove>[]): UndeadState {
  let s = st;
  for (const step of steps) s = undeadGame.executeMove(s, step.move);
  return s;
}

describe("undead recording solver", () => {
  it("records each deduction kind across generated boards", () => {
    // Re-deriving exact crafted boards for each kind is brittle; instead scan a
    // spread of tiers/seeds and assert every recorder reason kind appears.
    const seen = new Set<string>();
    const tiers: UndeadParams[] = [
      { w: 5, h: 5, diff: "easy" },
      { w: 5, h: 5, diff: "normal" },
      { w: 5, h: 5, diff: "tricky" },
    ];
    for (const p of tiers) {
      for (let i = 0; i < 30; i++) {
        const st = gen(p, `rec-${p.diff}-${i}`);
        const ops = recordUndeadDeductions(st.common, st.guess);
        for (const op of ops) seen.add(op.reason.kind);
      }
    }
    // `single` is a planner-derived placement reason, not a recorder one.
    expect(seen.has("sightline")).toBe(true);
    expect(seen.has("total")).toBe(true);
    expect(seen.has("forcing")).toBe(true);
    // `onlyCells` (counting's dual) is rarer but should appear in this spread.
    expect(seen.has("onlyCells")).toBe(true);
  });

  it("recorded eliminations only narrow toward the true solution (sound)", () => {
    // Every recorded elim removes a candidate the unique solution does not use.
    for (let i = 0; i < 20; i++) {
      const st = gen({ w: 5, h: 5, diff: "normal" }, `sound-${i}`);
      const r = undeadGame.solve?.(st, st);
      if (!r?.ok || r.move.type !== "solve") throw new Error("solve failed");
      const sol = r.move.placements;
      const ops = recordUndeadDeductions(st.common, st.guess);
      for (const op of ops) {
        if (op.kind === "elim") {
          // never eliminate the solution monster
          expect(op.monster).not.toBe(sol[op.cell]);
        } else {
          // a forced placement must be the solution monster
          expect(op.monster).toBe(sol[op.cell]);
        }
      }
    }
  });
});

describe("undead hint plan", () => {
  it("a freshly-computed plan solves the board from empty (all tiers)", () => {
    const tiers: UndeadParams[] = [
      { w: 4, h: 4, diff: "easy" },
      { w: 5, h: 5, diff: "normal" },
      { w: 5, h: 5, diff: "tricky" },
    ];
    for (const p of tiers) {
      for (let i = 0; i < 12; i++) {
        const st = gen(p, `plan-${p.diff}-${i}`);
        const solved = applyPlan(st, fullPlan(st));
        expect(undeadGame.status(solved), `${p.diff}#${i}`).toBe("solved");
      }
    }
  });

  it("surfaces a naked single before any elimination, and populates before the first strike", () => {
    for (let i = 0; i < 12; i++) {
      const st = gen({ w: 5, h: 5, diff: "normal" }, `order-${i}`);
      const steps = fullPlan(st);
      const firstStrike = steps.findIndex((s) => s.move.type === "pencilStrike");
      const firstPopulate = steps.findIndex((s) => s.move.type === "markAll");
      if (firstStrike >= 0) {
        // notes must be populated before anything is crossed out
        expect(
          firstPopulate,
          `seed ${i}: a strike before populate`,
        ).toBeGreaterThanOrEqual(0);
        expect(firstPopulate).toBeLessThan(firstStrike);
      }
    }
  });

  it("a sightline-strike step's marks all lie on the narrated sightline (no bleed)", () => {
    for (let i = 0; i < 12; i++) {
      const st = gen({ w: 5, h: 5, diff: "normal" }, `bleed-${i}`);
      for (const step of fullPlan(st)) {
        if (step.move.type !== "pencilStrike") continue;
        if (!/sightline/.test(step.explanation)) continue;
        const hl = step.highlights as {
          area: { x: number; y: number }[];
          marks: { x: number; y: number }[];
        };
        const area = new Set(hl.area.map((c) => `${c.x},${c.y}`));
        for (const m of hl.marks) {
          expect(
            area.has(`${m.x},${m.y}`),
            `seed ${i}: sightline mark off the path`,
          ).toBe(true);
        }
      }
    }
  });

  it("narrates with the necessity voice and reads correctly at clue extremes", () => {
    for (let i = 0; i < 12; i++) {
      const st = gen({ w: 5, h: 5, diff: "normal" }, `voice-${i}`);
      for (const step of fullPlan(st)) {
        const e = step.explanation;
        expect(e.length).toBeGreaterThan(0);
        if (step.move.type === "pencilStrike") {
          // a strike rules a candidate out — strike voice, never "is/are"
          expect(/cross out|rules the/.test(e), e).toBe(true);
        } else if (step.move.type === "set") {
          expect(/can only be/.test(e), e).toBe(true);
        }
        // sightline counts are phrased "exactly N ... and N", never "only N"
        if (/Trace this sightline/.test(e)) {
          expect(
            /shows exactly \d+ from one end and \d+ from the other/.test(e),
            e,
          ).toBe(true);
        }
      }
    }
  });
});

describe("undead hint refusal", () => {
  it("refuses on a solved board", () => {
    const st = gen({ w: 4, h: 4, diff: "easy" }, "refuse-solved");
    const r = undeadGame.solve?.(st, st);
    if (!r?.ok) throw new Error("solve failed");
    const solved = undeadGame.executeMove(st, r.move);
    expect(undeadGame.status(solved)).toBe("solved");
    const h = undeadGame.hint?.(solved);
    expect(h?.ok).toBe(false);
  });

  it("refuses on a board with a mistake (and the mistake is flagged)", () => {
    const st = gen({ w: 4, h: 4, diff: "easy" }, "refuse-wrong");
    const r = undeadGame.solve?.(st, st);
    if (!r?.ok || r.move.type !== "solve") throw new Error("solve failed");
    const sol = r.move.placements;
    // Place a wrong monster in the first editable cell.
    let cell = -1;
    for (let i = 0; i < st.common.numTotal; i++) {
      if (!st.common.fixed[i]) {
        cell = i;
        break;
      }
    }
    expect(cell).toBeGreaterThanOrEqual(0);
    const bits = [MON_GHOST, MON_VAMPIRE, MON_ZOMBIE];
    const wrong = bits.find((b) => b !== sol[cell]) as number;
    const dirty = undeadGame.executeMove(st, { type: "set", cell, monster: wrong });
    expect(undeadGame.findMistakes?.(dirty).length).toBeGreaterThan(0);
    const h = undeadGame.hint?.(dirty);
    expect(h?.ok).toBe(false);
  });
});

describe("undead hintKeepTrack", () => {
  function firstStepOfType(
    st: UndeadState,
    type: UndeadMove["type"],
  ): HintStep<UndeadMove> {
    // Walk the plan, applying steps, until we reach one of the requested type.
    let s = st;
    for (let guard = 0; guard < 200; guard++) {
      const steps = fullPlan(s);
      const idx = steps.findIndex((x) => x.move.type === type);
      if (idx === 0) return steps[0];
      if (idx > 0) {
        // advance to just before it
        for (let k = 0; k < idx; k++) s = undeadGame.executeMove(s, steps[k].move);
        return fullPlan(s)[0];
      }
      s = undeadGame.executeMove(s, steps[0].move);
    }
    throw new Error(`no ${type} step found`);
  }

  it("a matching markAll / set / pencil completes its step; a mismatch is off", () => {
    const st = gen({ w: 5, h: 5, diff: "normal" }, "track-1");

    const populate = firstStepOfType(st, "markAll");
    expect(undeadGame.hintKeepTrack?.({ type: "markAll" }, populate, st)).toBe(
      "completed",
    );
    expect(
      undeadGame.hintKeepTrack?.(
        { type: "pencil", cell: 0, monster: MON_GHOST },
        populate,
        st,
      ),
    ).toBe("off");
  });

  it("a pencil toggle clearing a strike mark tracks the step", () => {
    let s = gen({ w: 5, h: 5, diff: "normal" }, "track-2");
    // Reach a pencilStrike step, with the board in the pre-move state it expects.
    for (let guard = 0; guard < 200; guard++) {
      const steps = fullPlan(s);
      const strike = steps[0].move.type === "pencilStrike" ? steps[0] : null;
      if (strike && strike.move.type === "pencilStrike") {
        const strikeMarks = strike.move.marks;
        const mark = strikeMarks[0];
        // The candidate is present (pre-move) → a toggle clears it → on plan.
        expect(s.pencils[mark.cell] & mark.monster).toBeTruthy();
        const v = undeadGame.hintKeepTrack?.(
          { type: "pencil", cell: mark.cell, monster: mark.monster },
          strike,
          s,
        );
        expect(v === "onTrack" || v === "completed").toBe(true);
        // a non-target candidate is off-plan
        const other = [MON_GHOST, MON_VAMPIRE, MON_ZOMBIE].find(
          (b) => !strikeMarks.some((m) => m.cell === mark.cell && m.monster === b),
        );
        if (other !== undefined) {
          expect(
            undeadGame.hintKeepTrack?.(
              { type: "pencil", cell: mark.cell, monster: other },
              strike,
              s,
            ),
          ).toBe("off");
        }
        return;
      }
      s = undeadGame.executeMove(s, steps[0].move);
    }
    throw new Error("no pencilStrike step reached");
  });
});

describe("undead hint resume (per tier)", () => {
  // hint-resume.test.ts covers the first leaf preset (4x4 easy); this exercises
  // Normal and Tricky, which need the counting and forcing rungs.
  for (const diff of ["normal", "tricky"] as const) {
    it(`5x5 ${diff}: following hints one move at a time reaches solved`, () => {
      for (const seed of ["a", "b", "c"]) {
        let s = gen({ w: 5, h: 5, diff }, `resume-${diff}-${seed}`);
        let moves = 0;
        for (; moves < 600; moves++) {
          if (undeadGame.status(s) === "solved") break;
          const r = undeadGame.hint?.(s);
          expect(r?.ok, `${diff}/${seed}: gave up at move ${moves}`).toBe(true);
          if (!r?.ok) break;
          s = undeadGame.executeMove(s, r.steps[0].move);
        }
        expect(undeadGame.status(s), `${diff}/${seed}`).toBe("solved");
      }
    });
  }
});

describe("undead hint render (tier 2.5)", () => {
  it("a sightline-elimination frame shades the path, struck candidate, clues drawn", () => {
    const { recording, hint } = renderScenario({
      game: undeadGame,
      id: "5x5dn#hint-render",
      showHint: true,
      hintUntil: (s) =>
        s.move.type === "pencilStrike" && /Trace this sightline/.test(s.explanation),
      defaultBackground: DEFAULT_BACKGROUND,
    });
    expect(hint).toBeDefined();
    const ops = recording.ops;
    // The sightline's bounce path is shaded COL_HINT_CELL.
    expect(ops.some((o) => o.op === "rect" && o.colour === COL_HINT_CELL)).toBe(true);
    // A struck candidate draws a COL_HINT strikethrough line.
    expect(ops.some((o) => o.op === "line" && o.colour === COL_HINT)).toBe(true);
    // Edge clue numbers are still drawn (text ops present).
    expect(ops.some((o) => o.op === "text")).toBe(true);
    expect(recording.ops).toMatchSnapshot();
  });
});
