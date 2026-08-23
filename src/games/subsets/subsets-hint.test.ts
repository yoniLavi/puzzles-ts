/**
 * Subsets explained hint (add-subsets-hint).
 *
 * Tier 1: the recording deduction pass (`deduceHintPlan`) — every reason kind,
 * completeness and recompute-stability from any position, and the `hint()`
 * narration/refusal contract. Tier 2.5: a hint frame reaches the render cache
 * with its target slot and evidence shading. The from-position resume and the
 * overlay-in-cache guarantees are also covered cross-game via
 * `hint-resume.test.ts` / `hint-overlay.test.ts` (Subsets is enrolled in
 * `testing/hint-games.ts`).
 */
import { describe, expect, it } from "vitest";
import { UI_UPDATE } from "../../engine/game.ts";
import { Midend } from "../../engine/index.ts";
import { CURSOR_DOWN, LEFT_BUTTON } from "../../engine/pointer.ts";
import { randomNew } from "../../engine/random/index.ts";
import { RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { newSubsetsDesc } from "./generator.ts";
import { type SubsetsHintHighlights, subsetsGame } from "./index.ts";
import {
  COL_HINT,
  COL_HINT_CELL,
  COL_HINT_SPOT,
  newDrawState,
  redraw,
  setTileSize,
} from "./render.ts";
import {
  candidateCells,
  candidateSets,
  deduceHintPlan,
  findMistakes,
  pickExclusion,
  type SubsetsDeduction,
  solveCopy,
  subsetsValidate,
  whyCantPlace,
} from "./solver.ts";
import {
  cloneState,
  DIFF_EASY,
  newState,
  type SubsetsMove,
  type SubsetsState,
} from "./state.ts";

const P = { w: 4, h: 4, n: 4, diff: DIFF_EASY };

function gen(seed: string): SubsetsState {
  const { desc } = newSubsetsDesc(P, randomNew(seed));
  return newState(P, desc);
}

/** Apply one firing (every letter it decides) to a copy of `state`. */
function applyFiring(state: SubsetsState, d: SubsetsDeduction): SubsetsState {
  const next = cloneState(state);
  for (const set of d.sets) {
    const b = 1 << set.bit;
    if (set.type === "known") {
      next.known[d.pos] |= b;
      next.mask[d.pos] |= b;
    } else {
      next.known[d.pos] &= ~b;
      next.mask[d.pos] &= ~b;
    }
  }
  return next;
}

/** Scan seeds × walked positions for the first firing matching `pred`. */
function findFiring(
  pred: (d: SubsetsDeduction, state: SubsetsState) => boolean,
): { state: SubsetsState; d: SubsetsDeduction } | null {
  for (let s = 0; s < 30; s++) {
    let state = gen(`find-${s}`);
    for (let step = 0; step < 200; step++) {
      const plan = deduceHintPlan(state);
      if (plan.deductions.length === 0) break;
      const d = plan.deductions[0];
      if (pred(d, state)) return { state, d };
      state = applyFiring(state, d);
    }
  }
  return null;
}

describe("deduceHintPlan", () => {
  it("solves every generated board from the givens; complete certifies it", () => {
    for (let s = 0; s < 30; s++) {
      const state = gen(`plan-${s}`);
      const plan = deduceHintPlan(state);
      expect(plan.status).toBe("complete");

      // Apply the whole plan → a complete board; no firing ever re-decides a
      // letter already decided before it fired.
      let work = cloneState(state);
      for (const d of plan.deductions) {
        for (const set of d.sets) {
          const b = 1 << set.bit;
          // The letter must be undecided (unknown) before this firing.
          const known = (work.known[d.pos] & b) !== 0;
          const cleared = (work.mask[d.pos] & b) === 0;
          expect(known || cleared).toBe(false);
        }
        work = applyFiring(work, d);
      }
      expect(subsetsValidate(work)).toBe("complete");
    }
  });

  it("is recompute-stable: applying the first firing leaves the rest of the plan", () => {
    for (let s = 0; s < 12; s++) {
      const state = gen(`stable-${s}`);
      const plan = deduceHintPlan(state);
      if (plan.deductions.length < 2) continue;
      const next = applyFiring(state, plan.deductions[0]);
      const replan = deduceHintPlan(next);
      expect(replan.deductions).toEqual(plan.deductions.slice(1));
    }
  });

  it("an arrowKnown firing propagates the subset's marked letters up the arrow", () => {
    const hit = findFiring((d) => d.reason.kind === "arrowKnown");
    expect(hit).not.toBeNull();
    if (!hit) return;
    const r = hit.d.reason;
    if (r.kind !== "arrowKnown") return;
    expect(hit.d.pos).toBe(r.from); // the superset gains the letters
    // The arrow really points from -> to, and every gained letter is confirmed
    // in the subset `to`.
    const { w } = hit.state;
    const fromXY = { x: r.from % w, y: Math.floor(r.from / w) };
    const toXY = { x: r.to % w, y: Math.floor(r.to / w) };
    expect(Math.abs(fromXY.x - toXY.x) + Math.abs(fromXY.y - toXY.y)).toBe(1);
    for (const set of hit.d.sets) {
      expect(set.type).toBe("known");
      expect(hit.state.known[r.to] & (1 << set.bit)).toBeTruthy();
    }
  });

  it("an arrowMask firing propagates the superset's exclusions down the arrow", () => {
    const hit = findFiring((d) => d.reason.kind === "arrowMask");
    expect(hit).not.toBeNull();
    if (!hit) return;
    const r = hit.d.reason;
    if (r.kind !== "arrowMask") return;
    expect(hit.d.pos).toBe(r.to); // the subset loses the letters
    for (const set of hit.d.sets) {
      expect(set.type).toBe("cleared");
      // The letter is ruled out of the superset `from`.
      expect(hit.state.mask[r.from] & (1 << set.bit)).toBeFalsy();
    }
  });

  it("a collapse firing's survivors really agree on every decided letter", () => {
    const hit = findFiring((d) => d.reason.kind === "collapse");
    expect(hit).not.toBeNull();
    if (!hit) return;
    const r = hit.d.reason;
    if (r.kind !== "collapse") return;
    expect(r.survivors.length).toBeGreaterThan(0);
    for (const set of hit.d.sets) {
      const b = 1 << set.bit;
      if (set.type === "known") {
        // every surviving set contains the letter
        for (const v of r.survivors) expect(v & b).toBeTruthy();
      } else {
        // no surviving set contains it
        for (const v of r.survivors) expect(v & b).toBeFalsy();
      }
    }
  });

  it("a hidden single places a set whose only candidate cell is the target", () => {
    const hit = findFiring((d) => d.reason.kind === "hiddenSingle");
    expect(hit).not.toBeNull();
    if (!hit) return;
    const r = hit.d.reason;
    if (r.kind !== "hiddenSingle") return;
    // The set can go in exactly one cell — the target — per the shallow aid.
    const cells = candidateCells(hit.state, r.value);
    expect(cells).toEqual([hit.d.pos]);
    // After the firing the cell holds exactly `value`.
    const after = applyFiring(hit.state, hit.d);
    expect(after.known[hit.d.pos]).toBe(r.value);
    expect(after.mask[hit.d.pos]).toBe(r.value);
  });

  it("a singlePosition firing places a set with exactly one candidate cell", () => {
    const hit = findFiring((d) => d.reason.kind === "singlePosition");
    // singlePosition is a rare deep fallback — may not appear in the scan.
    if (!hit) return;
    const r = hit.d.reason;
    if (r.kind !== "singlePosition") return;
    const after = applyFiring(hit.state, hit.d);
    expect(after.known[hit.d.pos]).toBe(r.value);
    expect(after.mask[hit.d.pos]).toBe(r.value);
  });
});

describe("candidateCells (reference aid + hidden single)", () => {
  it("only lists cells where the set breaks no visible rule, and a placed set returns its home", () => {
    for (let s = 0; s < 20; s++) {
      const state = gen(`cc-${s}`);
      for (let v = 0; v < 16; v++) {
        const cells = candidateCells(state, v);
        for (const i of cells) {
          // Either the cell already holds v, or v is consistent with its marks.
          const decided = state.known[i] === state.mask[i];
          if (decided) {
            expect(state.known[i]).toBe(v);
          } else {
            expect(state.known[i] & v).toBe(state.known[i]); // has every known letter
            expect(v & state.mask[i]).toBe(v); // no cleared letter
          }
        }
      }
      // A given (decided) cell's own value lists that cell among its candidates.
      for (let i = 0; i < 16; i++) {
        if (state.known[i] === state.mask[i]) {
          expect(candidateCells(state, state.known[i])).toContain(i);
        }
      }
      // A placed set can go nowhere else — its candidate cells are all decided.
      const placedValues = new Set<number>();
      for (let i = 0; i < 16; i++)
        if (state.known[i] === state.mask[i]) placedValues.add(state.known[i]);
      for (const v of placedValues)
        for (const i of candidateCells(state, v))
          expect(state.known[i]).toBe(state.mask[i]);
    }
  });

  it("candidateSets is the reverse: a cell's still-possible sets, none placed elsewhere", () => {
    for (let s = 0; s < 20; s++) {
      const state = gen(`cs-${s}`);
      for (let i = 0; i < 16; i++) {
        const sets = candidateSets(state, i);
        if (state.known[i] === state.mask[i]) {
          expect(sets).toEqual([state.known[i]]); // decided → just its own set
          continue;
        }
        for (const v of sets) {
          // Consistent with the cell, and reciprocally the cell is a candidate.
          expect(candidateCells(state, v)).toContain(i);
        }
      }
    }
  });

  it("pickExclusion returns a competitor a visible rule really blocks", () => {
    let checked = 0;
    for (let s = 0; s < 40 && checked < 5; s++) {
      let state = gen(`px-${s}`);
      for (let step = 0; step < 200; step++) {
        const plan = deduceHintPlan(state);
        const d = plan.deductions[0];
        if (!d) break;
        if (d.reason.kind === "collapse") {
          const ex = pickExclusion(state, d.pos, d.reason.survivors);
          if (ex) {
            checked++;
            // The competitor is not a survivor, and its block is real.
            expect(d.reason.survivors).not.toContain(ex.value);
            if (ex.block.kind === "placed") {
              expect(state.known[ex.block.cell]).toBe(state.mask[ex.block.cell]);
              expect(state.known[ex.block.cell]).toBe(ex.value);
            } else {
              expect(whyCantPlace(state, d.pos, ex.value)).not.toBeNull();
            }
          }
        }
        state = applyFiring(state, d);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("hint", () => {
  it("narrates each firing with premise and conclusion, and highlights", () => {
    const state = gen("narrate-a");
    const res = subsetsGame.hint?.(state);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    for (const step of res.steps) {
      expect(step.explanation.length).toBeGreaterThan(20);
      const hl = step.highlights as SubsetsHintHighlights | undefined;
      expect(hl?.target).toBeDefined();
      // Every leg is one slot with its own action; the lead leg also names the
      // highlighted thing it reasons from (attention → deduction → action).
      expect(step.explanation).toMatch(/(mark .*present|clear)/i);
      if (!step.continuesPrevious) {
        expect(step.explanation).toMatch(/highlighted (cell|set)/i);
      }
    }
  });

  it("groups a multi-letter firing into one continuesPrevious journey", () => {
    // Find a firing that decides >1 letter, then check hint emits it as a lead
    // + continuation legs sharing one highlight object.
    const hit = findFiring((d) => d.sets.length > 1);
    expect(hit).not.toBeNull();
    if (!hit) return;
    const res = subsetsGame.hint?.(hit.state);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    // The opening firing is the first one hint emits; its legs 2+ are flagged.
    const firstLen = deduceHintPlan(hit.state).deductions[0].sets.length;
    for (let k = 1; k < firstLen; k++) {
      expect(res.steps[k].continuesPrevious).toBe(true);
      expect(res.steps[k].highlights).toBe(res.steps[0].highlights);
    }
    expect(res.steps[0].continuesPrevious).toBeUndefined();
  });

  it("refuses on a solved board", () => {
    const state = gen("refuse-solved");
    const { solved } = solveCopy(state);
    solved.completed = true;
    const res = subsetsGame.hint?.(solved);
    expect(res?.ok).toBe(false);
    if (res?.ok !== false) return;
    expect(res.error).toContain("already solved");
  });

  it("refuses on a rule-violating board, pointing at Check & Save", () => {
    // Place one set-value into two decided cells: a duplicate findMistakes flags.
    const state = gen("refuse-dup");
    const { solved } = solveCopy(state);
    // Copy one solved blank cell's value onto another blank cell so the value
    // appears twice.
    const blanks: number[] = [];
    for (let i = 0; i < P.w * P.h; i++) if (!state.immutable[i]) blanks.push(i);
    const dup = cloneState(state);
    dup.known[blanks[0]] = solved.known[blanks[1]];
    dup.mask[blanks[0]] = solved.mask[blanks[1]];
    dup.known[blanks[1]] = solved.known[blanks[1]];
    dup.mask[blanks[1]] = solved.mask[blanks[1]];
    expect(findMistakes(dup).length).toBeGreaterThan(0);
    const res = subsetsGame.hint?.(dup);
    expect(res?.ok).toBe(false);
    if (res?.ok !== false) return;
    expect(res.error).toContain("mistakes");
  });

  it("refuses honestly on a wrong-but-locally-clean mark", () => {
    const state = gen("refuse-clean");
    const { solved } = solveCopy(state);
    // Set one letter of a blank cell to the opposite of the solution, leaving
    // the cell otherwise undecided — no local rule breaks, findMistakes empty.
    let wrong: SubsetsState | null = null;
    for (let i = 0; i < P.w * P.h && !wrong; i++) {
      if (state.immutable[i]) continue;
      for (let b = 0; b < P.n; b++) {
        const bit = 1 << b;
        const w2 = cloneState(state);
        if (solved.known[i] & bit) {
          // solution has it → clear it (wrong)
          w2.known[i] &= ~bit;
          w2.mask[i] &= ~bit;
        } else {
          // solution lacks it → mark known (wrong)
          w2.known[i] |= bit;
          w2.mask[i] |= bit;
        }
        // Cell must stay undecided so no local rule fires.
        if (w2.known[i] !== w2.mask[i] && findMistakes(w2).length === 0) {
          wrong = w2;
          break;
        }
      }
    }
    expect(wrong).not.toBeNull();
    if (!wrong) return;
    const res = subsetsGame.hint?.(wrong);
    expect(res?.ok).toBe(false);
    if (res?.ok !== false) return;
    expect(res.error).toContain("contradicts the solution");
  });
});

describe("hintKeepTrack", () => {
  const step = {
    move: { kind: "set" as const, type: "known" as const, pos: 5, bit: 2 },
    explanation: "",
  };
  it("completes on the exact letter toggle, off otherwise", () => {
    expect(
      subsetsGame.hintKeepTrack?.(
        { kind: "set", type: "known", pos: 5, bit: 2 },
        step,
        {} as SubsetsState,
      ),
    ).toBe("completed");
    expect(
      subsetsGame.hintKeepTrack?.(
        { kind: "set", type: "cleared", pos: 5, bit: 2 },
        step,
        {} as SubsetsState,
      ),
    ).toBe("off");
    expect(
      subsetsGame.hintKeepTrack?.(
        { kind: "set", type: "known", pos: 6, bit: 2 },
        step,
        {} as SubsetsState,
      ),
    ).toBe("off");
  });
});

describe("highlights", () => {
  it("arrows point at a neighbour cell; a collapse points at tally sets", () => {
    const arrow = findFiring((d) => d.reason.kind === "arrowKnown");
    const collapse = findFiring((d) => d.reason.kind === "collapse");
    expect(arrow).not.toBeNull();
    expect(collapse).not.toBeNull();
    if (!arrow || !collapse) return;
    const aHl = subsetsGame.hint?.(arrow.state);
    const cHl = subsetsGame.hint?.(collapse.state);
    if (aHl?.ok) {
      const hl = aHl.steps[0].highlights as SubsetsHintHighlights;
      expect(hl.cells.length).toBeGreaterThan(0);
      expect(hl.sets.length).toBe(0);
      expect(hl.spotlight.length).toBe(0);
    }
    if (cHl?.ok) {
      const hl = cHl.steps[0].highlights as SubsetsHintHighlights;
      expect(hl.sets.length).toBeGreaterThan(0);
      // A collapse points at the surviving sets in the tally, plus at most one
      // grid cell — the excluded competitor's blocker (#2).
      expect(hl.cells.length).toBeLessThanOrEqual(1);
      expect(hl.spotlight.length).toBe(0);
    }
  });

  it("a hidden single spotlights its set's one candidate cell (the target)", () => {
    const hit = findFiring((d) => d.reason.kind === "hiddenSingle");
    expect(hit).not.toBeNull();
    if (!hit) return;
    const res = subsetsGame.hint?.(hit.state);
    if (!res?.ok) return;
    const hl = res.steps[0].highlights as SubsetsHintHighlights;
    // The spotlight is the set's single home, which is the acted cell.
    expect(hl.spotlight).toEqual([hl.target]);
    expect(hl.sets.length).toBe(1);
  });
});

describe("reference-aid affordance", () => {
  it("clicking a tally set toggles its spotlight in the ui", () => {
    const state = gen("aff-a");
    const ui = subsetsGame.newUi(state);
    expect(ui.highlightSet).toBeNull();
    // The tally entry for set-value cn=x*h+y sits below the grid. Compute the
    // click point for cn=0 (top-left tally entry) from the render layout.
    const ts = 36;
    const cw = 2;
    const ch = 2;
    const tallyPoint = (cn: number): { x: number; y: number } => {
      const x = Math.floor(cn / state.h);
      const y = cn % state.h;
      return {
        x: x * (cw + 1) * ts + Math.floor(cw * ts * 0.75),
        y: Math.floor(y * 0.75 * ts) + (state.h + 2) * ch * ts,
      };
    };
    const ds = newDrawState(state);
    setTileSize(ds, ts);
    const r1 = subsetsGame.interpretMove(state, ui, ds, tallyPoint(5), LEFT_BUTTON);
    expect(r1).toBe(UI_UPDATE);
    expect(ui.highlightSet).toBe(5);
    // Clicking the same entry again clears it.
    const r2 = subsetsGame.interpretMove(state, ui, ds, tallyPoint(5), LEFT_BUTTON);
    expect(r2).toBe(UI_UPDATE);
    expect(ui.highlightSet).toBeNull();
  });

  it("moving the cursor focuses that cell for the reverse aid, clearing a set spotlight", () => {
    const state = gen("aff-b");
    const ui = subsetsGame.newUi(state);
    ui.highlightSet = 3;
    const ds = newDrawState(state);
    setTileSize(ds, 36);
    const r = subsetsGame.interpretMove(state, ui, ds, { x: 0, y: 0 }, CURSOR_DOWN);
    expect(r).toBe(UI_UPDATE);
    expect(ui.highlightSet).toBeNull();
    expect(ui.highlightCell).not.toBeNull();
  });

  it("clicking a cell's inspect icon focuses it without editing; editing a slot does not", () => {
    const state = gen("aff-c");
    const ui = subsetsGame.newUi(state);
    const ds = newDrawState(state);
    const ts = 36;
    setTileSize(ds, ts);
    // The inspect icon sits in the margin above the block's left edge
    // (index.ts iconHit).
    const cell = 5;
    const cx = cell % state.w;
    const cy = Math.floor(cell / state.w);
    const bx = (cx * 3 + 0.5) * ts;
    const by = (cy * 3 + 0.5) * ts;
    const iconPoint = { x: bx + ts * 0.22, y: by - ts * 0.28 };
    const r = subsetsGame.interpretMove(state, ui, ds, iconPoint, LEFT_BUTTON);
    expect(r).toBe(UI_UPDATE);
    expect(ui.highlightCell).toBe(cell);
    // Clicking the same icon again clears it.
    expect(subsetsGame.interpretMove(state, ui, ds, iconPoint, LEFT_BUTTON)).toBe(
      UI_UPDATE,
    );
    expect(ui.highlightCell).toBeNull();
    // Editing a slot (the top-left slot centre, below the icon) does NOT focus.
    const slotPoint = { x: cx * 3 * ts + ts, y: cy * 3 * ts + ts };
    subsetsGame.interpretMove(state, ui, ds, slotPoint, LEFT_BUTTON);
    expect(ui.highlightCell).toBeNull();
  });

  it("touching the reference aid dismisses a displayed hint (uiUpdateClearsHint)", () => {
    // Regression: a displayed hint suppressed the aid, so aid clicks did
    // nothing visible. Now a UI_UPDATE (aid interaction) clears the hint.
    const midend = new Midend(subsetsGame);
    expect(midend.newGameFromId("4x4n4#aid-dismiss")).toBeUndefined();
    expect(midend.hint()).toBeUndefined();
    expect(midend.activeHintStep()).toBeDefined();
    // A tally click is a UI_UPDATE; it must clear the hint.
    const ts = 36;
    const tallyPoint = {
      x: 0 * 3 * ts + Math.floor(2 * ts * 0.75),
      y: Math.floor(0 * 0.75 * ts) + (4 + 2) * 2 * ts,
    };
    midend.processInput(tallyPoint.x, tallyPoint.y, LEFT_BUTTON);
    expect(midend.activeHintStep()).toBeUndefined();
  });
});

describe("subgoal continuation narration", () => {
  it("every continuation leg names its referent (never a bare pronoun) and the subgoal", () => {
    let checked = 0;
    for (let s = 0; s < 30 && checked < 8; s++) {
      let state = gen(`cont-${s}`);
      for (let step = 0; step < 200; step++) {
        if (subsetsGame.status(state) === "solved") break;
        const res = subsetsGame.hint?.(state);
        if (!res?.ok) break;
        for (const st of res.steps) {
          if (!st.continuesPrevious) continue;
          checked++;
          // The referent is explicit — "the highlighted cell/set(s)" — never a
          // sentence-leading bare "It"/"They"/"None of them".
          expect(st.explanation).toMatch(/the highlighted (cell|sets?)/);
          expect(st.explanation).toMatch(/Still filling this cell/);
          expect(st.explanation).not.toMatch(/^(It|They|None of them)\b/);
        }
        state = applyFiring(state, deduceHintPlan(state).deductions[0]);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("collapse exclusion (#2 — why not X)", () => {
  it("a collapse hint explains why a competitor set can't go there", () => {
    // Walk to a collapse whose competitor set is illustrable.
    let found = false;
    for (let s = 0; s < 60 && !found; s++) {
      let state = gen(`whynot-${s}`);
      for (let step = 0; step < 200; step++) {
        const plan = deduceHintPlan(state);
        const d = plan.deductions[0];
        if (!d) break;
        if (
          d.reason.kind === "collapse" &&
          pickExclusion(state, d.pos, d.reason.survivors)
        ) {
          const res = subsetsGame.hint?.(state);
          if (res?.ok) {
            expect(res.steps[0].explanation).toMatch(
              /For instance, .* (can't go here|already placed)/,
            );
            const hl = res.steps[0].highlights as SubsetsHintHighlights;
            // The blocker cell is highlighted so the clause has a referent.
            expect(hl.cells.length).toBeGreaterThan(0);
            found = true;
          }
          break;
        }
        state = applyFiring(state, d);
      }
    }
    expect(found).toBe(true);
  });
});

describe("hint rendering (tier 2.5)", () => {
  /** Build the moves that walk a seed's plan to the first firing of `kind`. */
  function movesToKind(seed: string, kind: string): SubsetsMove[] | null {
    let state = gen(seed);
    const moves: SubsetsMove[] = [];
    for (let step = 0; step < 60; step++) {
      const d = deduceHintPlan(state).deductions[0];
      if (!d) return null;
      if (d.reason.kind === kind) return moves;
      for (const set of d.sets)
        moves.push({ kind: "set", type: set.type, pos: d.pos, bit: set.bit });
      state = applyFiring(state, d);
    }
    return null;
  }

  it("an arrow hint frame paints the COL_HINT target slot and the COL_HINT_CELL neighbour", () => {
    let seed: string | null = null;
    for (let s = 0; s < 40 && !seed; s++) {
      const d = deduceHintPlan(gen(`render-${s}`)).deductions[0];
      if (d && (d.reason.kind === "arrowKnown" || d.reason.kind === "arrowMask"))
        seed = `render-${s}`;
    }
    expect(seed).not.toBeNull();
    if (!seed) return;
    const result = renderScenario({
      game: subsetsGame,
      id: `4x4n4#${seed}`,
      showHint: true,
    });
    expect(result.hint).toBeDefined();
    const ops = result.recording.ops;
    expect(ops.some((o) => o.op === "rect" && o.colour === COL_HINT)).toBe(true);
    expect(ops.some((o) => o.op === "rect" && o.colour === COL_HINT_CELL)).toBe(true);
    expect(ops).toMatchSnapshot();
  });

  it("a collapse hint frame boxes the highlighted set in the tally band", () => {
    // Reach a collapse frame by replaying prior firings, then show the hint.
    let seed: string | null = null;
    let moves: SubsetsMove[] | null = null;
    for (let s = 0; s < 60 && !moves; s++) {
      const m = movesToKind(`tally-${s}`, "collapse");
      if (m) {
        seed = `tally-${s}`;
        moves = m;
      }
    }
    expect(moves).not.toBeNull();
    if (!seed || !moves) return;
    const result = renderScenario({
      game: subsetsGame,
      id: `4x4n4#${seed}`,
      moves,
      showHint: true,
    });
    expect(result.hint).toBeDefined();
    const hl = result.hint?.highlights as SubsetsHintHighlights;
    // A collapse boxes the surviving sets in the tally (COL_HINT_CELL), and may
    // also frame one blocker cell for the "why not X" clause (#2). A box rather
    // than a tint: the label's own colour carries the state (error red, used-up
    // grey), so a fill behind it competes with what has to be read.
    expect(hl.sets.length).toBeGreaterThan(0);
    const ops = result.recording.ops;
    expect(ops.some((o) => o.op === "rect" && o.colour === COL_HINT)).toBe(true);
    expect(ops.some((o) => o.op === "rect" && o.colour === COL_HINT_CELL)).toBe(true);
    expect(ops).toMatchSnapshot();
  });

  it("a hidden-single hint frame spotlights the set's candidate cell (COL_HINT_SPOT)", () => {
    let seed: string | null = null;
    let moves: SubsetsMove[] | null = null;
    for (let s = 0; s < 60 && !moves; s++) {
      const m = movesToKind(`hs-render-${s}`, "hiddenSingle");
      if (m) {
        seed = `hs-render-${s}`;
        moves = m;
      }
    }
    expect(moves).not.toBeNull();
    if (!seed || !moves) return;
    const result = renderScenario({
      game: subsetsGame,
      id: `4x4n4#${seed}`,
      moves,
      showHint: true,
    });
    expect(result.hint).toBeDefined();
    const hl = result.hint?.highlights as SubsetsHintHighlights;
    expect(hl.spotlight.length).toBe(1);
    const ops = result.recording.ops;
    expect(ops.some((o) => o.op === "rect" && o.colour === COL_HINT)).toBe(true);
    expect(ops.some((o) => o.op === "rect" && o.colour === COL_HINT_SPOT)).toBe(true);
    expect(ops).toMatchSnapshot();
  });
});

describe("reference-aid rendering (tier 2.5)", () => {
  it("a spotlit set lights its candidate cells COL_HINT_SPOT and tints its tally entry", () => {
    // A partial board with a set clicked: drive redraw directly with the ui.
    let state = gen("aff-render");
    for (let step = 0; step < 5; step++) {
      const d = deduceHintPlan(state).deductions[0];
      if (!d) break;
      state = applyFiring(state, d);
    }
    // Pick an unplaced set with ≥2 candidate cells.
    let pick = -1;
    for (let v = 0; v < 16 && pick < 0; v++) {
      if (candidateCells(state, v).length >= 2) pick = v;
    }
    expect(pick).toBeGreaterThanOrEqual(0);
    const palette = subsetsGame.colours([0.827, 0.827, 0.827]);
    const rec = new RecordingDrawing(palette);
    const ds = newDrawState(state);
    setTileSize(ds, 36);
    const ui = { cx: 0, cy: 0, cshow: false, highlightSet: pick, highlightCell: null };
    redraw(rec, ds, null, state, 0, ui, 0, 0, undefined, undefined);
    expect(rec.ops.some((o) => o.op === "rect" && o.colour === COL_HINT_SPOT)).toBe(
      true,
    );
    expect(rec.ops.some((o) => o.op === "rect" && o.colour === COL_HINT_CELL)).toBe(
      true,
    );
  });
});
