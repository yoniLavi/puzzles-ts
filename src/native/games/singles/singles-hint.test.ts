/**
 * Tests for the Singles (Hitori) explained deduction hint.
 *
 * Tier 1: `deduceHintPlan` records the right reason per deduction (crafted
 * boards for the rarer once-only rules, generated boards for the cascade /
 * connectivity / offset rules); `hint()` returns a plan that solves the
 * board, groups a two-cell firing into one step, gives every step visible
 * evidence, and refuses on a solved/mistaken board; `hintKeepTrack`
 * completes/onTracks/offs. Tier 2.5: a render-scenario snapshot of a hint
 * frame (the blue target + evidence, numbers still drawn).
 */
import { describe, expect, it } from "vitest";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { type SinglesHint, singlesGame } from "./index.ts";
import {
  COL_HINT,
  COL_HINT_BLACKREF,
  COL_HINT_CELL,
  COL_HINT_WHITEREF,
} from "./render.ts";
import { deduceHintPlan, solveSpecific } from "./solver.ts";
import {
  DIFF_ANY,
  F_BLACK,
  makeState,
  newState,
  type SinglesMove,
  type SinglesParams,
  type SinglesState,
} from "./state.ts";

function craft(w: number, h: number, nums: number[]): SinglesState {
  return makeState(w, h, Int8Array.from(nums));
}

function fromSeed(p: SinglesParams, seed: string): SinglesState {
  const { desc } = singlesGame.newDesc(p, randomNew(seed));
  return newState(p, desc);
}

describe("deduceHintPlan records the deduction reason", () => {
  it("sandwich: two equal numbers one apart force the middle white", () => {
    // Row 0: 1 2 1  → the '2' between the two '1's must stay white.
    const s = craft(3, 2, [1, 2, 1, 3, 1, 2]);
    const plan = deduceHintPlan(s);
    const r = plan.find((m) => m.reason.kind === "sandwich");
    expect(r).toBeDefined();
    expect(r?.op).toBe(1); // OP_CIRCLE (white)
    expect(r).toMatchObject({ x: 1, y: 0 });
    if (r?.reason.kind === "sandwich") {
      expect(r.reason.ends).toEqual([
        { x: 0, y: 0 },
        { x: 2, y: 0 },
      ]);
    }
  });

  it("pair: an adjacent equal pair shades the other copies in the line", () => {
    // Row 0: 1 1 2 1 → the lone '1' at x=3 must be shaded.
    const s = craft(4, 2, [1, 1, 2, 1, 3, 4, 2, 4]);
    const plan = deduceHintPlan(s);
    const r = plan.find((m) => m.reason.kind === "pair");
    expect(r).toBeDefined();
    expect(r?.op).toBe(0); // OP_BLACK
    expect(r).toMatchObject({ x: 3, y: 0 });
  });

  it("corner3: three matching numbers in a 2x2 corner force the apex black", () => {
    const s = craft(2, 2, [1, 1, 1, 2]);
    const plan = deduceHintPlan(s);
    expect(plan.some((m) => m.reason.kind === "corner3")).toBe(true);
  });

  it("corner2: two matching numbers in a 2x2 corner force a neighbour white", () => {
    const s = craft(2, 2, [1, 1, 2, 3]);
    const plan = deduceHintPlan(s);
    expect(plan.some((m) => m.reason.kind === "corner2")).toBe(true);
  });

  it("corner4: all four matching shade the diagonal via the box-in argument", () => {
    // Whole 2x2 board all equal — only the corner+inner diagonal can be
    // shaded without stranding the grid-corner white. Narration names the
    // value and uses the same box-in language as corner3 (not the old,
    // false "only pair that leaves one white per line" premise).
    const s = craft(2, 2, [4, 4, 4, 4]);
    const plan = deduceHintPlan(s);
    expect(plan.some((m) => m.reason.kind === "corner4")).toBe(true);
    const res = singlesGame.hint?.(s);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    const step = res.steps[0];
    expect(step.explanation).toContain("box it in");
    expect(step.explanation).toContain("4");
    expect(step.explanation).not.toContain("one white per line");
    // One firing forces both diagonal cells, shaded.
    const hl = step.highlights as SinglesHint;
    expect(hl.targets).toHaveLength(2);
    expect(hl.targets.every((t) => t.value === "black")).toBe(true);
  });

  it("covers the cascade / connectivity / offset rules on generated boards", () => {
    const kinds = new Set<string>();
    for (const seed of ["sh-1", "sh-2", "sh-3", "sh-4"]) {
      const s = fromSeed({ w: 6, h: 6, diff: "tricky" }, seed);
      for (const m of deduceHintPlan(s)) kinds.add(m.reason.kind);
    }
    for (const k of ["adjBlack", "sameLine", "boxedIn", "split", "offset"]) {
      expect(kinds.has(k)).toBe(true);
    }
  });
});

describe("hint", () => {
  it("returns a plan whose moves are legal and solve the board", () => {
    const s = fromSeed({ w: 6, h: 6, diff: "tricky" }, "hint-plan");
    const res = singlesGame.hint?.(s);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    expect(res.steps.length).toBeGreaterThan(0);
    expect(res.steps[0].explanation.length).toBeGreaterThan(0);

    let cur = s;
    for (const step of res.steps) cur = singlesGame.executeMove(cur, step.move);
    expect(singlesGame.status(cur)).toBe("solved");
  });

  it("emits a two-cell firing (offset / corner-4) as a single step", () => {
    // Offset-pairs force two whites at once; a tricky board reliably has one.
    let found = false;
    for (const seed of ["hint-plan", "sh-1", "sh-2", "sh-3", "two-cell"]) {
      const s = fromSeed({ w: 6, h: 6, diff: "tricky" }, seed);
      const res = singlesGame.hint?.(s);
      if (!res?.ok) continue;
      const multi = res.steps.find((st) => st.move.sets.length > 1);
      if (multi) {
        // Both cells carry a forced value and share the one explanation.
        expect(multi.move.sets.length).toBeGreaterThanOrEqual(2);
        const hl = multi.highlights as SinglesHint;
        expect(hl.targets.length).toBe(multi.move.sets.length);
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("a hint always makes progress from any partial position (resumable solve)", () => {
    // Regression: solveSpecific is written to run from an empty board, and its
    // cascade only propagates from cells it changes this run. Resuming it from
    // the player's marks (the hint path) used to stall — a partially-solved,
    // mistake-free board returned "No further move can be deduced". Walk each
    // board to completion one hinted move at a time, recomputing the plan from
    // scratch after every move so deduceHintPlan is exercised from many
    // arbitrary partial positions; it must never give up before solved.
    for (const seed of ["sh-1", "sh-2", "sh-3", "hint-plan"]) {
      let s = fromSeed({ w: 6, h: 6, diff: "tricky" }, seed);
      let guard = 0;
      while (singlesGame.status(s) !== "solved") {
        expect(guard++).toBeLessThan(200);
        const res = singlesGame.hint?.(s);
        expect(res?.ok).toBe(true); // never "no further move" on a solvable board
        if (!res?.ok) break;
        s = singlesGame.executeMove(s, res.steps[0].move);
      }
      expect(singlesGame.status(s)).toBe("solved");
    }
  });

  it("offset: narration names the pair values and walks the contradiction arc", () => {
    let found = false;
    for (const seed of ["sh-1", "sh-2", "sh-3", "sh-4", "hint-plan"]) {
      const s = fromSeed({ w: 6, h: 6, diff: "tricky" }, seed);
      const res = singlesGame.hint?.(s);
      if (!res?.ok) continue;
      const step = res.steps.find((st) =>
        st.explanation.includes("shaded next to each other"),
      );
      if (step) {
        expect(step.explanation).toMatch(/\d/); // concrete value(s)
        expect(step.explanation).toContain("can't touch");
        expect(step.explanation).not.toContain("across from it");
        // "overlap" was geometrically false — the pairs can span a whole line.
        expect(step.explanation).not.toContain("overlap");
        // Leads with the indication (§1b) — names the spotted pattern first.
        expect(step.explanation).toMatch(/^There's a pair of \d+s in one (column|row)/);
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("gives every step visible evidence (an area to shade or a premise to ring)", () => {
    for (const seed of ["hint-plan", "sh-1", "sh-2", "evidence-3"]) {
      const s = fromSeed({ w: 6, h: 6, diff: "tricky" }, seed);
      const res = singlesGame.hint?.(s);
      if (!res?.ok) throw new Error("expected a plan");
      for (const step of res.steps) {
        const hl = step.highlights as SinglesHint;
        expect(hl.evidence.length + hl.strand.length).toBeGreaterThan(0);
        // The three roles (target / evidence / strand) never overlap.
        const targets = new Set(hl.targets.map((t) => `${t.x},${t.y}`));
        const strand = new Set(hl.strand.map((c) => `${c.x},${c.y}`));
        expect(hl.evidence.some((e) => targets.has(`${e.x},${e.y}`))).toBe(false);
        expect(hl.evidence.some((e) => strand.has(`${e.x},${e.y}`))).toBe(false);
        expect(hl.strand.some((c) => targets.has(`${c.x},${c.y}`))).toBe(false);
      }
    }
  });

  it("separates a corner deduction's protected corner from the matching pair", () => {
    // The user-reported confusion: a 2×2-corner hint shaded the corner cell
    // the same colour as the matching numbers and called them all "corner
    // squares". The corner is now its own `strand` role, disjoint from the
    // shaded matching `evidence`. Reproduce the reported shape directly:
    // top-left 2×2 = [[4,3],[5,3]] → the two 3s match (evidence), the 4 is
    // the protected corner (strand), the 5 is forced white (target).
    const s = craft(2, 2, [4, 3, 5, 3]);
    const res = singlesGame.hint?.(s);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    const cornerStep = res.steps.find(
      (st) => (st.highlights as SinglesHint).strand.length > 0,
    );
    expect(cornerStep).toBeDefined();
    const hl = cornerStep?.highlights as SinglesHint;
    // The corner (4 at 0,0) is the strand; the matching pair (the two 3s)
    // is the shaded evidence; the corner is not among them.
    expect(hl.strand).toEqual([{ x: 0, y: 0 }]);
    expect(hl.evidence.length).toBeGreaterThanOrEqual(1);
    expect(hl.evidence.some((e) => e.x === 0 && e.y === 0)).toBe(false);
    // Narration opens on the spotted pattern (§1b indication-first), names the
    // actual numbers, and follows the contradiction arc (the touching pair →
    // shading the target → trapping the corner), not the old confusing "two
    // corner squares".
    expect(cornerStep?.explanation).toMatch(
      /^A touching pair of 3s sits at the corner/,
    );
    expect(cornerStep?.explanation).toContain("corner 4");
    expect(cornerStep?.explanation).toContain("boxed in");
    expect(cornerStep?.explanation).not.toContain("two corner squares");
  });

  it("refuses on a solved board", () => {
    const s = fromSeed({ w: 6, h: 6, diff: "tricky" }, "hint-solved");
    const res0 = singlesGame.hint?.(s);
    if (!res0?.ok) throw new Error("expected a plan");
    let cur = s;
    for (const step of res0.steps) cur = singlesGame.executeMove(cur, step.move);
    expect(singlesGame.hint?.(cur)?.ok).toBe(false);
  });

  it("refuses when the board has a mistake", () => {
    const p: SinglesParams = { w: 6, h: 6, diff: "tricky" };
    const s = fromSeed(p, "hint-mistake");
    const sol = makeState(p.w, p.h, s.nums);
    expect(solveSpecific(sol, DIFF_ANY, false)).toBe(1);
    // Mark a solution-black cell white → a mistake.
    const blackIdx = sol.flags.findIndex((f) => (f & F_BLACK) !== 0);
    const wrong = singlesGame.executeMove(s, {
      sets: [{ x: blackIdx % p.w, y: (blackIdx / p.w) | 0, value: "circle" }],
    });
    expect(singlesGame.hint?.(wrong)?.ok).toBe(false);
  });
});

describe("hintKeepTrack", () => {
  it("completes on the hinted move, offs on a deviation", () => {
    const s = fromSeed({ w: 6, h: 6, diff: "tricky" }, "hint-track");
    const res = singlesGame.hint?.(s);
    if (!res?.ok) throw new Error("expected a plan");
    // Use a single-cell step (the common case).
    const step = res.steps.find((st) => st.move.sets.length === 1);
    if (!step) throw new Error("expected a single-cell step");
    const t = (step.highlights as SinglesHint).targets[0];

    const right: SinglesMove = { sets: [{ x: t.x, y: t.y, value: t.value }] };
    expect(singlesGame.hintKeepTrack?.(right, step, s)).toBe("completed");

    const wrongValue = t.value === "black" ? "circle" : "black";
    expect(
      singlesGame.hintKeepTrack?.(
        { sets: [{ x: t.x, y: t.y, value: wrongValue }] },
        step,
        s,
      ),
    ).toBe("off");

    expect(
      singlesGame.hintKeepTrack?.(
        { sets: [{ x: (t.x + 1) % s.w, y: t.y, value: t.value }] },
        step,
        s,
      ),
    ).toBe("off");
  });

  it("onTracks a multi-cell step filled one cell at a time, then completes", () => {
    let step: { move: SinglesMove; highlights?: SinglesHint } | undefined;
    let state: SinglesState | undefined;
    for (const seed of ["hint-plan", "sh-1", "sh-2", "sh-3", "two-cell"]) {
      const s = fromSeed({ w: 6, h: 6, diff: "tricky" }, seed);
      const res = singlesGame.hint?.(s);
      if (!res?.ok) continue;
      const multi = res.steps.find((st) => st.move.sets.length === 2);
      if (multi) {
        step = multi as typeof step;
        state = s;
        break;
      }
    }
    if (!step || !state) throw new Error("expected a two-cell step");
    const [a, b] = (step.highlights as SinglesHint).targets;

    // Fill the first cell only → onTrack, step shrinks to the second.
    expect(
      singlesGame.hintKeepTrack?.(
        { sets: [{ x: a.x, y: a.y, value: a.value }] },
        step as never,
        state,
      ),
    ).toBe("onTrack");
    expect(step.move.sets).toEqual([{ x: b.x, y: b.y, value: b.value }]);

    // Now fill the second → completed.
    expect(
      singlesGame.hintKeepTrack?.(
        { sets: [{ x: b.x, y: b.y, value: b.value }] },
        step as never,
        state,
      ),
    ).toBe("completed");
  });
});

describe("singles hint render", () => {
  it("draws the hint target in COL_HINT with evidence and numbers", () => {
    const { recording } = renderScenario({
      game: singlesGame,
      id: "6x6dk#hint-render",
      showHint: true,
    });
    const ops = recording.ops;
    expect(ops.some((o) => "colour" in o && o.colour === COL_HINT)).toBe(true);
    expect(
      ops.some((o) => "colour" in o && o.colour === COL_HINT_CELL) ||
        // a decided premise is ringed in COL_HINT rather than shaded
        ops.filter((o) => "colour" in o && o.colour === COL_HINT).length > 1,
    ).toBe(true);
    // Numbers are still rendered (clue digits not hidden by the overlay).
    expect(ops.some((o) => o.op === "text")).toBe(true);
    expect(ops).toMatchSnapshot();
  });

  it("rings a cited shaded square in COL_HINT_BLACKREF, distinct from the blue target", () => {
    // Walk to an adjBlack frame: a decided black square forces a neighbour
    // white. The black premise must ring in the black-ref legend colour, not
    // the same blue as the forced cell.
    const { recording } = renderScenario({
      game: singlesGame,
      id: "6x6dk#scan-0",
      showHint: true,
      hintUntil: (s) => s.explanation.includes("can't be adjacent"),
    });
    const ops = recording.ops;
    const colour = (c: number) => ops.some((o) => "colour" in o && o.colour === c);
    expect(colour(COL_HINT_BLACKREF)).toBe(true); // cited black premise ring
    expect(colour(COL_HINT)).toBe(true); // forced cell, a different colour
    expect(COL_HINT_BLACKREF).not.toBe(COL_HINT);
  });

  it("rings a cited ringed-white square in COL_HINT_WHITEREF", () => {
    // Walk to a sameLine frame: a circled white square forces line-mates
    // shaded. The white premise rings in the white-ref legend colour.
    const { recording } = renderScenario({
      game: singlesGame,
      id: "6x6dk#scan-0",
      showHint: true,
      // "share a line" is unique to sameLine (boxedIn also cites a "ringed
      // white square", so predicate on the sameLine-only phrase).
      hintUntil: (s) => s.explanation.includes("share a line"),
    });
    const ops = recording.ops;
    expect(ops.some((o) => "colour" in o && o.colour === COL_HINT_WHITEREF)).toBe(true);
  });
});
