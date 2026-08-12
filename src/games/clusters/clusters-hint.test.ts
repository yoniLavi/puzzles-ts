/**
 * Clusters explained hint (`add-clusters-hint`).
 *
 * Tier 1: the recording deduction pass (`deduceHintPlan`) — every reason kind
 * fires with a true, checkable premise; the plan solves the board; the plan is
 * recompute-stable; refusals are honest. Deductions are located by a
 * fixed-seed scan over generated boards (docs/games/hints.md § "Verifying a hint in-process"'s idiom) rather
 * than hand-crafted grids: the ≥2-same-neighbours rule makes small valid
 * mid-game boards fiddly to craft, and a property checked on a real firing is
 * the stronger assertion anyway.
 *
 * Tier 2.5: render-scenario frames — the COL_HINT target, the danger double
 * ring, and a chain's what-if marks all reach the canvas, plus a snapshot.
 *
 * Cross-game guards (resume walk, overlay-reaches-cache, narration form) run
 * from `engine/testing/hint-games.ts` enrollment, not here.
 */
import { describe, expect, it } from "vitest";
import { Midend } from "../../engine/midend.ts";
import { randomNew } from "../../engine/random/index.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { type ClustersHintHighlights, clustersGame } from "./index.ts";
import { COL_HINT, COL_HINT_CELL } from "./render.ts";
import { type ClustersDeduction, COMPLETE, deduceHintPlan } from "./solver.ts";
import {
  type ClustersFill,
  type ClustersMove,
  type ClustersState,
  COLMASK,
  DIFF_EASY,
  DIFF_TRICKY,
  F_COLOR_0,
  F_COLOR_1,
  F_SINGLE,
  newState,
} from "./state.ts";

const P = { w: 7, h: 7, diff: DIFF_TRICKY };
/** The **full** params string, difficulty included. A hand-written id must
 * carry the tier: `encodeParams(p, false)` omits it, so "7x7" decodes as Easy
 * and a scenario built from it would generate a different board from the one
 * a fixed-seed scan over `P` just found. */
const ID = clustersGame.encodeParams(P, true);

function generate(seed: string): ClustersState {
  const { desc } = clustersGame.newDesc(P, randomNew(seed));
  return newState(P, desc);
}

/** Walk a board's plan, calling `visit` with each deduction and the grid it
 * fired on (deductions applied up to but not including it). */
function walkPlan(
  state: ClustersState,
  visit: (d: ClustersDeduction, grid: Uint8Array) => void,
): void {
  const plan = deduceHintPlan(state.grid, state.w, state.h);
  const grid = state.grid.slice();
  for (const d of plan.deductions) {
    visit(d, grid);
    grid[d.index] = d.fill;
  }
}

/** Fixed-seed scan for the first deduction matching `pred`, with the board it
 * fired on. Deterministic; widen SCAN_SEEDS if a solver change strands one. */
const SCAN_SEEDS = Array.from({ length: 40 }, (_, i) => `ch-scan-${i}`);
function findDeduction(
  pred: (d: ClustersDeduction) => boolean,
): { d: ClustersDeduction; grid: Uint8Array; state: ClustersState } | null {
  for (const seed of SCAN_SEEDS) {
    const state = generate(seed);
    let found: { d: ClustersDeduction; grid: Uint8Array } | null = null;
    walkPlan(state, (d, grid) => {
      if (!found && pred(d)) found = { d, grid: grid.slice() };
    });
    if (found)
      return { ...(found as { d: ClustersDeduction; grid: Uint8Array }), state };
  }
  return null;
}

const neighboursOf = (i: number, w: number, h: number): number[] => {
  const x = i % w;
  const y = (i - x) / w;
  const out: number[] = [];
  if (x > 0) out.push(i - 1);
  if (x < w - 1) out.push(i + 1);
  if (y > 0) out.push(i - w);
  if (y < h - 1) out.push(i + w);
  return out;
};

const sameNeighbours = (grid: Uint8Array, i: number, w: number, h: number): number =>
  neighboursOf(i, w, h).filter((n) => (grid[n] & COLMASK) === (grid[i] & COLMASK))
    .length;

describe("deduceHintPlan", () => {
  it("certifies every generated board COMPLETE, and its steps are sound as far as they go", () => {
    // The verdict comes from the walk, which runs the lookahead; the
    // *deductions* stop at the first stall and so need not finish the board
    // (`audit-guessing-tier-names`, design D8). Both halves matter: COMPLETE is
    // what proves no placed tile is wrong, and `hint` refuses without it.
    for (const seed of ["plan-a", "plan-b", "plan-c"]) {
      const state = generate(seed);
      const plan = deduceHintPlan(state.grid, state.w, state.h);
      expect(plan.verdict).toBe(COMPLETE);
      const grid = state.grid.slice();
      for (const d of plan.deductions) {
        expect(grid[d.index]).toBe(0); // never re-paints a filled cell
        grid[d.index] = d.fill;
      }
      // Every step it did narrate agrees with the real solution.
      const solved = clustersGame.solve?.(state, state);
      expect(solved?.ok).toBe(true);
      if (!solved?.ok || solved.move.kind !== "solve") return;
      for (const d of plan.deductions) expect(solved.move.fills[d.index]).toBe(d.fill);
    }
  });

  it("is recompute-stable: applying the first move leaves the rest of the plan", () => {
    const state = generate("plan-a");
    const plan = deduceHintPlan(state.grid, state.w, state.h);
    const grid = state.grid.slice();
    for (let i = 0; i < Math.min(8, plan.deductions.length - 1); i++) {
      grid[plan.deductions[i].index] = plan.deductions[i].fill;
      const replan = deduceHintPlan(grid, state.w, state.h);
      expect(replan.deductions).toEqual(plan.deductions.slice(i + 1));
    }
  });

  it("a surrounded-at-target firing really has every neighbour the forced colour", () => {
    const hit = findDeduction(
      (d) =>
        d.reason.kind === "direct" &&
        d.reason.at.kind === "surrounded" &&
        d.reason.at.cell === d.index,
    );
    expect(hit).not.toBeNull();
    if (!hit) return;
    for (const n of neighboursOf(hit.d.index, P.w, P.h)) {
      expect(hit.grid[n] & COLMASK).toBe(hit.d.fill);
    }
  });

  it("a reachTwo-at-target firing: the refuted colour really cannot reach two", () => {
    const hit = findDeduction(
      (d) =>
        d.reason.kind === "direct" &&
        d.reason.at.kind === "reachTwo" &&
        d.reason.at.cell === d.index,
    );
    expect(hit).not.toBeNull();
    if (!hit) return;
    // At most one neighbour could ever share the refuted colour.
    const friendly = neighboursOf(hit.d.index, P.w, P.h).filter(
      (n) => hit.grid[n] === 0 || (hit.grid[n] & COLMASK) === hit.d.refuted,
    );
    expect(friendly.length).toBeLessThanOrEqual(1);
  });

  it("a dotOvercount firing: the danger dot is adjacent and already has its one", () => {
    const hit = findDeduction(
      (d) => d.reason.kind === "direct" && d.reason.at.kind === "dotOvercount",
    );
    expect(hit).not.toBeNull();
    if (!hit) return;
    const dot = hit.d.reason.at.cell;
    expect(neighboursOf(hit.d.index, P.w, P.h)).toContain(dot);
    expect(hit.grid[dot] & F_SINGLE).toBeTruthy();
    expect(hit.grid[dot] & COLMASK).toBe(hit.d.refuted);
    expect(sameNeighbours(hit.grid, dot, P.w, P.h)).toBe(1);
  });

  it("plans only single-cell deductions — never a lookahead chain", () => {
    // The guarantee that replaced "a chain firing …" when
    // `audit-guessing-tier-names` removed the lookahead from the hint: a
    // multi-step search with backtracking is non-deductive, permitted only on an
    // `Unreasonable` *board*, and never something a hint may narrate as a
    // technique. `solveGame` keeps the rung, so no board changed.
    //
    // Asserted over Unreasonable boards specifically — an Easy board could
    // satisfy this vacuously, since it never needs the rung in the first place.
    for (const seed of ["plan-a", "plan-b", "plan-c"]) {
      const state = generate(seed);
      const plan = deduceHintPlan(state.grid, state.w, state.h);
      expect(plan.deductions.length).toBeGreaterThan(0);
      for (const d of plan.deductions) expect(d.reason.kind).toBe("direct");
    }
  });

  it("stops at the stall rather than solving through it", () => {
    // The other half of the same change, and the one that would catch a silent
    // reintroduction of the rung: on an Unreasonable board the plan *must* run
    // out before the board is finished, because such a board needs the
    // lookahead at least once by construction. Measured when the rung was
    // removed: the plan still covers 94–96% of the board, and the stall is
    // never the first step.
    const state = generate("plan-a");
    const plan = deduceHintPlan(state.grid, state.w, state.h);
    const blanks = [...state.grid].filter((b) => (b & COLMASK) === 0).length;
    expect(plan.deductions.length).toBeGreaterThan(0);
    // Short of the whole board — an Unreasonable board needs the lookahead at
    // least once by construction, and the plan stops there rather than
    // narrating past a step the player was never shown. Measured across sizes:
    // 61–74% of the blanks are covered.
    expect(plan.deductions.length).toBeLessThan(blanks);
    // …and the verdict is still COMPLETE, because the *walk* went the whole way.
    // That separation is the design: the search may certify, never teach.
    expect(plan.verdict).toBe(COMPLETE);
  });
});

describe("hint", () => {
  it("narrates each reason kind with its rule and highlights the danger tile", () => {
    const state = generate("plan-a");
    const res = clustersGame.hint?.(state);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    const plan = deduceHintPlan(state.grid, state.w, state.h);
    res.steps.forEach((step, i) => {
      const d = plan.deductions[i];
      const hl = step.highlights as ClustersHintHighlights;
      expect(hl.target).toEqual({ x: d.index % P.w, y: Math.floor(d.index / P.w) });
      const kind = d.reason.at.kind;
      if (kind === "dotOvercount") {
        expect(step.explanation).toContain("dot touches exactly one tile");
        expect(hl.danger).toBeDefined();
      } else if (kind === "surrounded" && d.reason.at.cell !== d.index) {
        expect(step.explanation).toContain("seal");
      } else if (kind === "reachTwo") {
        expect(step.explanation).toContain("touch two");
      }
      // "ringed" is uttered iff the amber danger ring is on display.
      expect(step.explanation.includes("ringed")).toBe(hl.danger !== undefined);
      // The conclusion names the forced colour in the necessity voice.
      expect(step.explanation).toContain(
        `must be ${d.fill === F_COLOR_0 ? "red" : "blue"}`,
      );
    });
  });

  it("refuses on a solved board", () => {
    const state = generate("plan-a");
    const plan = deduceHintPlan(state.grid, state.w, state.h);
    const grid = state.grid.slice();
    for (const d of plan.deductions) grid[d.index] = d.fill;
    const solved: ClustersState = { ...state, grid, completed: true };
    const res = clustersGame.hint?.(solved);
    expect(res?.ok).toBe(false);
    if (res?.ok !== false) return;
    expect(res.error).toContain("already solved");
  });

  it("refuses on a rule-violating board, pointing at Check & Save's overlay", () => {
    // Painting the refuted colour of a *direct* firing trips the rule
    // immediately, so findMistakes flags it.
    const hit = findDeduction((d) => d.reason.kind === "direct");
    expect(hit).not.toBeNull();
    if (!hit) return;
    // The firing's board, with the refuted move made for real.
    const grid = hit.grid.slice();
    grid[hit.d.index] = hit.d.refuted;
    const res = clustersGame.hint?.({ ...hit.state, grid });
    expect(res?.ok).toBe(false);
    if (res?.ok !== false) return;
    expect(res.error).toContain("mistakes");
  });

  it("refuses honestly on a wrong-but-locally-clean board", () => {
    // A square painted against the solution whose wrongness no *local* rule
    // catches, so `findMistakes` stays empty. The hint must still refuse: the
    // plan's certifying walk runs the lookahead (design D8 — the search may
    // check a position even though it may not teach one), reaches INVALID, and
    // says so rather than deducing onward from a doomed board.
    //
    // Built from the solution rather than from a plan firing: this used to look
    // for a `chain`-reason deduction, and that reason no longer exists now the
    // lookahead is unnarratable. Constructing it directly is also the stronger
    // form — it does not depend on the planner's internals at all.
    let wrong: ClustersState | null = null;
    for (const seed of SCAN_SEEDS) {
      const state = generate(seed);
      const solved = clustersGame.solve?.(state, state);
      if (!solved?.ok || solved.move.kind !== "solve") continue;
      for (let i = 0; i < state.grid.length && !wrong; i++) {
        if ((state.grid[i] & COLMASK) !== 0) continue;
        const grid = state.grid.slice();
        grid[i] = solved.move.fills[i] === F_COLOR_0 ? F_COLOR_1 : F_COLOR_0;
        const candidate: ClustersState = { ...state, grid };
        if (clustersGame.findMistakes?.(candidate)?.length === 0) wrong = candidate;
      }
      if (wrong) break;
    }
    expect(wrong).not.toBeNull();
    if (!wrong) return;
    expect(clustersGame.findMistakes?.(wrong)).toHaveLength(0);
    const res = clustersGame.hint?.(wrong);
    expect(res?.ok).toBe(false);
    if (res?.ok !== false) return;
    expect(res.error).toContain("contradiction");
  });
});

describe("hintKeepTrack", () => {
  const step = {
    move: {
      kind: "paint",
      cells: [{ index: 5, fill: F_COLOR_0 as ClustersFill }],
    } as ClustersMove,
    explanation: "",
  };
  const state = {} as ClustersState;
  const track = clustersGame.hintKeepTrack;

  it("completes on exactly the hinted paint", () => {
    expect(
      track?.({ kind: "paint", cells: [{ index: 5, fill: F_COLOR_0 }] }, step, state),
    ).toBe("completed");
  });

  it("drops the plan on the wrong colour, wrong cell, or a multi-cell drag", () => {
    expect(
      track?.({ kind: "paint", cells: [{ index: 5, fill: F_COLOR_1 }] }, step, state),
    ).toBe("off");
    expect(
      track?.({ kind: "paint", cells: [{ index: 6, fill: F_COLOR_0 }] }, step, state),
    ).toBe("off");
    expect(
      track?.(
        {
          kind: "paint",
          cells: [
            { index: 5, fill: F_COLOR_0 },
            { index: 6, fill: F_COLOR_0 },
          ],
        },
        step,
        state,
      ),
    ).toBe("off");
  });
});

describe("hint through the midend", () => {
  it("shows a step, advances on the followed move, and walks to solved (Easy)", () => {
    // Easy: the deductive rung finishes the board, so the walk ends at the
    // solved board's refusal — the only way out.
    const easyId = clustersGame.encodeParams({ ...P, diff: DIFF_EASY }, true);
    const midend = new Midend(clustersGame);
    expect(midend.newGameFromId(`${easyId}#mid-walk`)).toBeUndefined();
    let refusal: string | undefined;
    let steps = 0;
    for (let guard = 0; guard < 200 && !refusal; guard++) {
      refusal = midend.hint();
      if (refusal) break;
      const step = midend.activeHintStep();
      expect(step).toBeDefined();
      if (!step) return;
      midend.playMoves([step.move]);
      steps++;
    }
    expect(steps).toBeGreaterThan(0);
    expect(refusal).toContain("already solved");
  });

  it("walks an Unreasonable board until deduction runs out, then says so", () => {
    // The tier's contract after `audit-guessing-tier-names`: such a board needs
    // a multi-step search at least once, the hint will not narrate one, so the
    // walk ends on the deduction-ran-out refusal instead of on "solved".
    // Measured coverage before it stops: 61–74% of the blanks.
    const midend = new Midend(clustersGame);
    expect(midend.newGameFromId(`${ID}#mid-walk`)).toBeUndefined();
    let refusal: string | undefined;
    let steps = 0;
    for (let guard = 0; guard < 200 && !refusal; guard++) {
      refusal = midend.hint();
      if (refusal) break;
      const step = midend.activeHintStep();
      expect(step).toBeDefined();
      if (!step) return;
      midend.playMoves([step.move]);
      steps++;
    }
    expect(steps).toBeGreaterThan(0);
    expect(refusal).toContain("No further move can be deduced");
  });
});

describe("hint rendering (tier 2.5)", () => {
  it("a direct hint frame paints the COL_HINT target", () => {
    const result = renderScenario({
      game: clustersGame,
      id: `${ID}#render-hint`,
      showHint: true,
    });
    expect(result.hint).toBeDefined();
    const ops = result.recording.ops;
    expect(ops.some((o) => o.op === "rect" && o.colour === COL_HINT)).toBe(true);
    expect(result.recording.ops).toMatchSnapshot();
  });

  it("no frame ever paints a what-if mark", () => {
    // Replaces "a chain frame paints the what-if marks and the danger double
    // ring". `audit-guessing-tier-names` removed the lookahead from the hint,
    // so there is no hypothetical to draw and `COL_HINT_CELL` — which only ever
    // shaded a what-if cell in this game — must appear on no frame at all.
    //
    // Asserted by *walking every step of a real plan* rather than by grepping
    // the render source: the guarantee is about what a frame contains, and a
    // leftover render path reachable from some other overlay bit would pass a
    // source check and fail here.
    let checked = 0;
    for (let i = 0; i < 12 && checked < 6; i++) {
      const id = `${ID}#no-whatif-${i}`;
      // ~3% of Unreasonable boards stall at the very first step, and there the
      // hint refuses rather than rendering; skip those rather than let one
      // decide the test either way.
      const state = generate(`no-whatif-${i}`);
      if (deduceHintPlan(state.grid, P.w, P.h).deductions.length === 0) continue;
      const result = renderScenario({ game: clustersGame, id, showHint: true });
      checked++;
      const ops = result.recording.ops;
      expect(
        ops.some((o) => o.op === "rect" && o.colour === COL_HINT_CELL),
        `${id}: a what-if mark was painted`,
      ).toBe(false);
      // …while the ordinary hint overlay is still there, so this is not passing
      // because the hint failed to render at all.
      expect(ops.some((o) => o.op === "rect" && o.colour === COL_HINT)).toBe(true);
    }
    // The "how many did I actually look at?" guard — without it a scan that
    // skipped everything would pass while asserting nothing.
    expect(checked).toBe(6);
  });
});
