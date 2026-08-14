/**
 * Bricks explained-hint tests (add-bricks-hint). The Easy-tier reason
 * classification is pinned on crafted minimal grids (one rule each), the
 * recursive tier on a stalled fixture, and the whole `hint()` — refusals, plan
 * stability, narration, `hintKeepTrack`, and the render overlay — on a real
 * board.
 */
import { describe, expect, it } from "vitest";
import type { HintStep } from "../../engine/game.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import cReference from "./__fixtures__/bricks-c-reference.json" with { type: "json" };
import { type BricksHint, bricksGame } from "./index.ts";
import { COL_HINT, COL_HINT_CELL } from "./render.ts";
import {
  bricksValidate,
  deduceBricksPlan,
  findMistakes,
  nextForcedMove,
  solveGame,
} from "./solver.ts";
import {
  type BricksMove,
  type BricksParams,
  type BricksState,
  COL_MASK,
  colourBits,
  DIFF_EASY,
  DIFF_TRICKY,
  encodeParams,
  F_EMPTY,
  F_SHADE,
  F_UNSHADE,
  newState,
} from "./state.ts";

interface Fixture {
  seed: string;
  desc: string;
  w: number;
  h: number;
  diff: number;
}
const fixtures = (cReference as { fixtures: Fixture[] }).fixtures;
const FIX = fixtures[0]; // 7x6 easy
const FIX_PARAMS: BricksParams = { w: FIX.w, h: FIX.h, diff: FIX.diff };
const FIX_ID = `${encodeParams(FIX_PARAMS, true)}:${FIX.desc}`;

/** The `Game` interface types hint highlights as `unknown`; the concrete game
 * carries `BricksHint`. */
const hl = (s: HintStep<BricksMove>): BricksHint => s.highlights as BricksHint;

/** Build a raw rectangular grid (no F_BOUND — a full rectangle is a valid
 * grid for the solver) from a compact spec. `S`/`U`/`.`/digit. */
function grid(spec: string[][]): { g: Uint16Array; w: number; h: number } {
  const h = spec.length;
  const w = spec[0].length;
  const g = new Uint16Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = spec[y][x];
      g[y * w + x] =
        c === "S" ? F_SHADE : c === "U" ? F_UNSHADE : c === "." ? F_EMPTY : Number(c);
    }
  return { g, w, h };
}

describe("bricks hint — Easy-tier reason classification", () => {
  it("three-in-a-row forces the middle cell clear", () => {
    // A single row S . S — shading the gap makes three in a row.
    const { g, w, h } = grid([["S", ".", "S"]]);
    const m = nextForcedMove(g, w, h);
    expect(m).toMatchObject({ index: 1, to: "unshade", reason: { kind: "three" } });
  });

  it("an unsupportable cell is forced clear", () => {
    // Target (0,0); its only in-grid support below is an unshade.
    const { g, w, h } = grid([
      [".", "."],
      ["U", "U"],
    ]);
    const m = nextForcedMove(g, w, h);
    expect(m).toMatchObject({
      index: 0,
      to: "unshade",
      reason: { kind: "unsupported" },
    });
  });

  it("an over-filled clue forces a neighbour clear", () => {
    // Clue 0 at (0,0); shading its neighbour would give it a shaded cell.
    const { g, w, h } = grid([
      ["0", ".", "."],
      ["U", ".", "."],
    ]);
    const m = nextForcedMove(g, w, h);
    expect(m).toMatchObject({ index: 1, to: "unshade", reason: { kind: "overcount" } });
  });

  it("a brick's last support is forced shaded", () => {
    // Shaded brick (0,0); its only support is target (0,1). Clearing it strands.
    const { g, w, h } = grid([
      ["S", "."],
      [".", "U"],
    ]);
    const m = nextForcedMove(g, w, h);
    expect(m).toMatchObject({
      index: 2,
      to: "shade",
      reason: { kind: "strandSupport" },
    });
  });

  it("a clue that can no longer reach its count forces a neighbour shaded", () => {
    // Clue 1 at (0,0); its only other neighbour is unshaded, so the target
    // must supply the shade.
    const { g, w, h } = grid([
      ["1", "U"],
      [".", "."],
    ]);
    const m = nextForcedMove(g, w, h);
    expect(m).toMatchObject({ index: 2, to: "shade", reason: { kind: "undercount" } });
  });
});

describe("bricks hint — where the recursive tier used to be", () => {
  it("stops at the single-cell stall instead of narrating the lookahead", () => {
    // Replaces "finds a chain contradiction where no single-cell one exists".
    // `audit-guessing-tier-names` took the recursive rung out of the hint (it
    // assumes a colour and *solves the rest of the board* from it — a
    // multi-step search, never a technique a hint may teach) and deleted its
    // recording twin. `solveGame` keeps the rung, so this asserts exactly the
    // gap that now exists: where the board stalls for the direct rung, the
    // plan ends and the deeper solver still finishes it.
    const tricky = fixtures.find((f) => f.diff === 2) as Fixture;
    const st = newState({ w: tricky.w, h: tricky.h, diff: tricky.diff }, tricky.desc);
    const g = st.grid.slice();
    solveGame(g, st.w, st.h, DIFF_EASY, true, false); // easy fixpoint (no recursion)
    const stalled =
      nextForcedMove(g, st.w, st.h) === null &&
      bricksValidate(g, st.w, st.h, true) === "unfinished";
    if (!stalled) return; // this fixture happened to be Easy-solvable; skip
    // The hint has nothing more to say here…
    expect(deduceBricksPlan(g, st.w, st.h)).toHaveLength(0);
    // …while the solver, which may search, still finishes the board.
    const deeper = g.slice();
    expect(solveGame(deeper, st.w, st.h, DIFF_TRICKY, false, true)).toBe("complete");
  });
});

describe("bricks hint — the full hint()", () => {
  it("returns a non-empty plan whose steps each explain a forced move", () => {
    const st = newState(FIX_PARAMS, FIX.desc);
    const r = bricksGame.hint?.(st);
    expect(r?.ok).toBe(true);
    if (!r?.ok) throw new Error();
    expect(r.steps.length).toBeGreaterThan(0);
    for (const step of r.steps) {
      expect(step.explanation.length).toBeGreaterThan(0);
      expect(step.move).toMatchObject({ kind: "paint" });
      expect(hl(step).target).toBeGreaterThanOrEqual(0);
      // The target is never in its own evidence.
      expect(hl(step).evidence).not.toContain(hl(step).target);
    }
  });

  it("the plan applied in order drives the board to completion", () => {
    const st = newState(FIX_PARAMS, FIX.desc);
    const plan = deduceBricksPlan(st.grid, st.w, st.h);
    const g = st.grid.slice();
    for (const m of plan) g[m.index] = colourBits(m.to);
    // 7x6 easy has fewer than the plan cap of empties, so one plan finishes it.
    expect(bricksValidate(g, st.w, st.h, true)).toBe("complete");
  });

  it("is recompute-stable: a hint after following step 0 continues the plan", () => {
    const st = newState(FIX_PARAMS, FIX.desc);
    const r0 = bricksGame.hint?.(st);
    if (!r0?.ok) throw new Error();
    const s0 = r0.steps[0];
    const next = bricksGame.executeMove(st, s0.move);
    const r1 = bricksGame.hint?.(next);
    if (!r1?.ok) throw new Error();
    // The recomputed plan's first step is what was step 1 before.
    expect(hl(r1.steps[0]).target).toBe(hl(r0.steps[1]).target);
  });
});

describe("bricks hint — a second mark on the board is named", () => {
  /** The phrases that tie the acted-on cell to the ringed evidence, one per
   * reason. Geometric or relational throughout — never a colour name, which
   * `docs/games/hints.md` § "Two marks on the board, one 'this cell'" forbids
   * as scheme-relative and invisible to a colour-blind reader. */
  const TIE =
    /next to the ringed shaded bricks|ringed cells? below this one|ringed \d+ beside (it|this cell)|above rests only on this cell|the unringed one/;

  it("every step that rings a cell says how that cell relates to the target", () => {
    // Sweep partial positions, not just the openers: each fixture is replayed
    // from many random subsets of its own solution, which is what reaches all
    // five reachable reasons (the openers alone reach three of them).
    let seed = 12345;
    const rnd = (n: number): number => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return Math.abs(seed) % n;
    };
    const kinds = new Set<string>();
    let checked = 0;
    let withMark = 0;
    for (const f of fixtures) {
      if (f.w * f.h >= 96) continue; // the 12x8 Tricky fixture is test:slow
      const st = newState({ w: f.w, h: f.h, diff: f.diff }, f.desc);
      const sol = st.grid.slice();
      solveGame(sol, st.w, st.h, DIFF_TRICKY, true, true);
      const empties: number[] = [];
      for (let i = 0; i < st.w * st.h; i++)
        if ((st.grid[i] & COL_MASK) === F_EMPTY) empties.push(i);
      for (let trial = 0; trial < 30; trial++) {
        const g = st.grid.slice();
        const pool = empties.slice();
        for (let j = 0, k = rnd(empties.length); j < k; j++)
          pool.splice(rnd(pool.length), 1).forEach((c) => {
            g[c] = sol[c] & COL_MASK;
          });
        const r = bricksGame.hint?.({ ...st, grid: g });
        if (!r?.ok) continue;
        for (const step of r.steps) {
          checked++;
          if (hl(step).evidence.length === 0) continue;
          withMark++;
          expect(
            TIE.test(step.explanation),
            `${step.explanation} — a cell is ringed but "this cell" is not tied to it`,
          ).toBe(true);
        }
        for (const m of deduceBricksPlan(g, st.w, st.h)) kinds.add(m.reason.kind);
      }
    }
    // Vacuity guards: a sweep that examined nothing, or that reached only the
    // one reason the openers show, would pass the assertion above while
    // measuring nothing (`audit-guessing-tier-names` §3.2).
    expect(checked).toBeGreaterThan(100);
    expect(withMark).toBeGreaterThan(100);
    expect([...kinds].sort()).toEqual([
      "overcount",
      "strandSupport",
      "three",
      "undercount",
      "unsupported",
    ]);
  });
});

describe("bricks hint — refusals", () => {
  it("refuses a solved board", () => {
    const st = newState(FIX_PARAMS, FIX.desc);
    const g = st.grid.slice();
    solveGame(g, st.w, st.h, DIFF_TRICKY, true, true);
    const solved: BricksState = { ...st, grid: g, completed: true };
    const r = bricksGame.hint?.(solved);
    expect(r?.ok).toBe(false);
    if (r?.ok === false) expect(r.error).toMatch(/already solved/i);
  });

  it("refuses a board with a rule violation", () => {
    const st = newState(FIX_PARAMS, FIX.desc);
    // Force three shaded in a row somewhere.
    let run = -1;
    for (let i = 0; i < st.w * st.h - 2; i++) {
      if (
        i % st.w <= st.w - 3 &&
        (st.grid[i] & COL_MASK) === F_EMPTY &&
        (st.grid[i + 1] & COL_MASK) === F_EMPTY &&
        (st.grid[i + 2] & COL_MASK) === F_EMPTY
      ) {
        run = i;
        break;
      }
    }
    const g = st.grid.slice();
    g[run] = g[run + 1] = g[run + 2] = F_SHADE;
    const r = bricksGame.hint?.({ ...st, grid: g });
    expect(r?.ok).toBe(false);
    if (r?.ok === false) expect(r.error).toMatch(/mistake/i);
    expect(findMistakes({ ...st, grid: g }).length).toBeGreaterThan(0);
  });

  it("refuses a wrong-but-legal mark (contradicts the solution, no rule broken)", () => {
    const st = newState(FIX_PARAMS, FIX.desc);
    const sol = st.grid.slice();
    solveGame(sol, st.w, st.h, DIFF_TRICKY, true, true);
    // Find a cell the solution shades where placing an unshade breaks no rule.
    let cell = -1;
    for (let i = 0; i < st.w * st.h; i++) {
      if ((sol[i] & COL_MASK) !== F_SHADE) continue;
      if ((st.grid[i] & COL_MASK) !== F_EMPTY) continue;
      const g = st.grid.slice();
      g[i] = F_UNSHADE;
      if (findMistakes({ ...st, grid: g }).length === 0) {
        cell = i;
        break;
      }
    }
    expect(cell).toBeGreaterThanOrEqual(0);
    const g = st.grid.slice();
    g[cell] = F_UNSHADE;
    const r = bricksGame.hint?.({ ...st, grid: g });
    expect(r?.ok).toBe(false);
    if (r?.ok === false) expect(r.error).toMatch(/solution|wrong position/i);
  });
});

describe("bricks hint — hintKeepTrack", () => {
  it("completes on the hinted move and is off for a different one", () => {
    const st = newState(FIX_PARAMS, FIX.desc);
    const r = bricksGame.hint?.(st);
    if (!r?.ok) throw new Error();
    const step = r.steps[0];
    expect(bricksGame.hintKeepTrack?.(step.move, step, st)).toBe("completed");
    const target = hl(step).target ?? -1;
    const wrong: BricksMove = {
      kind: "paint",
      cells: [{ index: target, to: hl(step).forced === "shade" ? "unshade" : "shade" }],
    };
    expect(bricksGame.hintKeepTrack?.(wrong, step, st)).toBe("off");
  });
});

describe("bricks hint — rendering (tier 2.5)", () => {
  it("draws the target COL_HINT and evidence COL_HINT_CELL", () => {
    const result = renderScenario({
      game: bricksGame,
      id: FIX_ID,
      showHint: true,
    });
    const ops = result.recording.ops;
    expect(ops.some((o) => o.op === "rect" && o.colour === COL_HINT)).toBe(true);
    // Some first-step deductions have evidence off-board (edge walls); the
    // 7x6 easy opener's first step should carry at least one evidence cell.
    const hasEvidence = ops.some((o) => o.op === "rect" && o.colour === COL_HINT_CELL);
    expect(
      hasEvidence || (result.hint ? hl(result.hint).evidence.length : 0) === 0,
    ).toBe(true);
    expect(ops).toMatchSnapshot();
  });
});
