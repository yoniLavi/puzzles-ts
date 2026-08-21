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
import {
  COL_0,
  COL_1,
  COL_HINT,
  COL_HINT_CELL,
  COL_HINT_DANGER,
  COL_HINT_ORDER,
} from "./render.ts";
import {
  type ClustersDeduction,
  COMPLETE,
  clustersStatus,
  deduceHintPlan,
} from "./solver.ts";
import {
  type ClustersFill,
  type ClustersMove,
  type ClustersState,
  COLMASK,
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
  it("solves every generated board, and COMPLETE certifies it", () => {
    for (const seed of ["plan-a", "plan-b", "plan-c"]) {
      const state = generate(seed);
      const plan = deduceHintPlan(state.grid, state.w, state.h);
      expect(plan.verdict).toBe(COMPLETE);
      const grid = state.grid.slice();
      for (const d of plan.deductions) {
        expect(grid[d.index]).toBe(0); // never re-paints a filled cell
        grid[d.index] = d.fill;
      }
      expect(clustersStatus(grid, P.w, P.h)).toBe(COMPLETE);
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

  it("a chain firing: what-if cells are empty, distinct, and the end is adjacent to the last mark", () => {
    const hit = findDeduction((d) => d.reason.kind === "chain");
    expect(hit).not.toBeNull();
    if (!hit || hit.d.reason.kind !== "chain") return;
    const { steps, at } = hit.d.reason;
    expect(steps.length).toBeGreaterThan(0);
    const indices = steps.map((s) => s.index);
    expect(new Set(indices).size).toBe(indices.length);
    for (const s of steps) expect(hit.grid[s.index]).toBe(0);
    // The contradiction surfaces where the last hypothetical fill landed:
    // at that cell or one of its neighbours.
    const last = indices[indices.length - 1];
    expect([last, ...neighboursOf(last, P.w, P.h)]).toContain(at.cell);
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
      if (d.reason.kind === "chain") {
        expect(step.explanation).toMatch(/^Suppose this cell were (red|blue):/);
        expect(hl.chain.length).toBe(d.reason.steps.length);
      } else if (kind === "dotOvercount") {
        expect(step.explanation).toContain("dot touches exactly one tile");
        expect(hl.danger).toBeDefined();
      } else if (kind === "surrounded" && d.reason.at.cell !== d.index) {
        expect(step.explanation).toContain("seal");
      } else if (kind === "reachTwo") {
        expect(step.explanation).toContain("touch two");
      }
      // "ringed" is uttered iff the amber danger ring is on display.
      expect(step.explanation.includes("ringed")).toBe(hl.danger !== undefined);

      // A bare "this cell" points at nothing once a *second* mark is on the
      // board — owner-reported on a frame showing a solid target and a ringed
      // tile side by side. Wherever a second mark exists the sentence must tie
      // the target to it, and the tie is geometric rather than a colour name
      // (`hints.md`: colour is never the only cue). `beside this cell` / `its
      // ringed … neighbour` for the adjacent break, `forced in turn from it`
      // for a chain, whose break is adjacent to the last link instead.
      const secondMark = hl.danger !== undefined || hl.chain.length > 0;
      if (secondMark) {
        expect(
          /beside this cell|its ringed \w+ neighbour|from it/.test(step.explanation),
          `${step.explanation} — a second mark is shown but "this cell" is not tied to it`,
        ).toBe(true);
      }
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
    // Painting a *chain* firing's refuted colour breaks no local rule (the
    // contradiction needs the lookahead), so findMistakes stays empty — but
    // the plan runs into the contradiction and the hint must say so, not
    // deduce onward from a doomed position.
    const hit = findDeduction((d) => d.reason.kind === "chain");
    expect(hit).not.toBeNull();
    if (!hit) return;
    const grid = hit.grid.slice();
    grid[hit.d.index] = hit.d.refuted;
    const wrong: ClustersState = { ...hit.state, grid };
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
  it("shows a step, advances on the followed move, and walks to solved", () => {
    const midend = new Midend(clustersGame);
    expect(midend.newGameFromId(`${ID}#mid-walk`)).toBeUndefined();
    let refusal: string | undefined;
    for (let guard = 0; guard < 100 && !refusal; guard++) {
      refusal = midend.hint();
      if (refusal) break;
      const step = midend.activeHintStep();
      expect(step).toBeDefined();
      if (!step) return;
      midend.playMoves([step.move]);
    }
    // The walk ends at the solved board's refusal — the only way out.
    expect(refusal).toContain("already solved");
  });
});

describe("hint rendering (tier 2.5)", () => {
  // The palette itself, before any frame. Every other assertion in this block
  // compares a recorded op's `colour` against a `COL_*` **index**, which is a
  // proxy: the hint target was painted `COL_HINT` throughout the period when
  // `COL_HINT` resolved to the very same blue as `COL_1`, the tile colour a
  // player paints — so the cell the whole deduction starts from was
  // indistinguishable from a placed tile, and on a firing concluding *red* the
  // board contradicted the sentence. Nothing failed, because an index is not a
  // colour. `colour-collide.test.ts` had been reporting the pair all along and
  // is advisory. This is the non-proxy form.
  it("every hint role is a colour the board does not already use", () => {
    const palette = clustersGame.colours([1, 1, 1]);
    const key = (i: number) => palette[i].join(",");
    const roles = [COL_HINT, COL_HINT_CELL, COL_HINT_DANGER, COL_HINT_ORDER];
    for (const role of roles) {
      for (const tile of [COL_0, COL_1]) {
        expect(
          key(role),
          `hint role ${role} is the same colour as tile ${tile}`,
        ).not.toBe(key(tile));
      }
    }
    // …and the hint roles are distinct from one another, so a target, its
    // evidence, its ordering and its contradiction never collapse into one
    // mark. The ordinal is drawn *on* an evidence cell, so `COL_HINT_ORDER`
    // being distinct from `COL_HINT_CELL` is what keeps it readable at all.
    expect(new Set(roles.map(key)).size).toBe(roles.length);
  });

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

  it("a chain frame paints the what-if marks and the danger double ring", () => {
    // Fixed-seed scan for a board whose plan holds a chain step, then walk
    // the displayed hint to it (§8's idiom).
    let result: ReturnType<typeof renderScenario> | null = null;
    for (let i = 0; i < 40 && !result; i++) {
      const id = `${ID}#chain-frame-${i}`;
      const state = generate(`chain-frame-${i}`);
      const plan = deduceHintPlan(state.grid, P.w, P.h);
      if (!plan.deductions.some((d) => d.reason.kind === "chain")) continue;
      // renderScenario generates from the id-seed; keep them in step.
      result = renderScenario({
        game: clustersGame,
        id,
        showHint: true,
        hintUntil: (step) => step.explanation.startsWith("Suppose"),
      });
    }
    expect(result).not.toBeNull();
    if (!result) return;
    const hl = result.hint?.highlights as ClustersHintHighlights;
    expect(hl.chain.length).toBeGreaterThan(0);
    const ops = result.recording.ops;
    // Every what-if cell shades COL_HINT_CELL and carries its small mark in
    // the tile colour the hypothesis would force.
    expect(ops.some((o) => o.op === "rect" && o.colour === COL_HINT_CELL)).toBe(true);
    expect(
      ops.some((o) => o.op === "rect" && (o.colour === COL_0 || o.colour === COL_1)),
    ).toBe(true);
    if (hl.danger) {
      expect(ops.some((o) => o.op === "rect" && o.colour === COL_HINT_DANGER)).toBe(
        true,
      );
    }

    // …and each carries its **ordinal**, the fact the marks used to omit: an
    // unordered set of shaded cells cannot be checked against a narration that
    // says they fall one after another (`walk-tactic-hint-chains` D5). Asserted
    // as the exact set `1..n` rather than "some text was drawn", so a chain
    // that numbers only its first cell, numbers from 0, or repeats a digit
    // fails — the count is the guard that a snapshot re-baseline cannot erase.
    const digits = ops
      .flatMap((o) => (o.op === "text" && o.colour === COL_HINT_ORDER ? [o.text] : []))
      .sort();
    expect(digits).toEqual(
      Array.from({ length: hl.chain.length }, (_, i) => String(i + 1)).sort(),
    );

    expect(ops).toMatchSnapshot();
  });
});
