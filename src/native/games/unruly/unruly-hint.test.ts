// Tier-1 hint logic for Unruly: the recording deduction (`deduceHintPlan`)
// names each technique with its premise, the `hint` plan is legal + solves
// the board, refuses on solved / mistaken boards, groups one firing into one
// journey, and every step carries visible evidence. Plus `animLength` for the
// placement animation.
import { describe, expect, it } from "vitest";
import { randomNew } from "../../random/index.ts";
import { newDesc } from "./generator.ts";
import { type UnrulyHint, unrulyGame } from "./index.ts";
import { PLACE_ANIM_TIME } from "./render.ts";
import { deduceHintPlan } from "./solver.ts";
import {
  type Cell,
  EMPTY as E,
  isComplete,
  newState,
  ONE as O,
  type UnrulyMove,
  type UnrulyParams,
  type UnrulyState,
  ZERO as Z,
} from "./state.ts";

/** Build a state directly from a grid of cell values (no immutable clues). */
function craft(rows: Cell[][], unique = false): UnrulyState {
  const h2 = rows.length;
  const w2 = rows[0].length;
  const grid = new Uint8Array(w2 * h2);
  for (let y = 0; y < h2; y++)
    for (let x = 0; x < w2; x++) grid[y * w2 + x] = rows[y][x];
  return {
    w2,
    h2,
    unique,
    grid,
    immutable: new Uint8Array(w2 * h2),
    completed: false,
    cheated: false,
  };
}

const blankRow = (): Cell[] => [E, E, E, E, E, E];
const padTo6 = (top: Cell[][]): Cell[][] => {
  const rows = top.slice();
  while (rows.length < 6) rows.push(blankRow());
  return rows;
};

describe("deduceHintPlan — per-technique reasons", () => {
  it("threes: two same-colour cells force the third opposite", () => {
    const plan = deduceHintPlan(craft(padTo6([[O, O, E, E, E, E]])));
    expect(plan[0].reason.kind).toBe("threes");
    expect(plan[0].value).toBe(Z);
    expect(plan[0].index).toBe(2);
    if (plan[0].reason.kind === "threes") {
      expect([...plan[0].reason.refs].sort((a, b) => a - b)).toEqual([0, 1]);
    }
  });

  it("groups one firing (a line-fill) into one journey, per-cell techniques apart", () => {
    // On a real board the same firing forces several cells (a completed count
    // or a near-complete remainder); they must read as one journey. Find a
    // grouped plan and check every continuation shares its predecessor's
    // firing (same technique + line); the per-cell techniques never continue.
    let found = false;
    for (let s = 0; s < 12 && !found; s++) {
      const st = fromSeed(
        { w2: 14, h2: 14, unique: false, diff: 2 },
        `unruly-group-${s}`,
      );
      const plan = deduceHintPlan(st);
      for (let i = 1; i < plan.length; i++) {
        if (!plan[i].continuesPrevious) continue;
        found = true;
        const a = plan[i - 1].reason;
        const b = plan[i].reason;
        expect(b.kind).toBe(a.kind);
        expect(b.kind === "complete" || b.kind === "nearcomplete").toBe(true);
        if (
          (a.kind === "complete" || a.kind === "nearcomplete") &&
          (b.kind === "complete" || b.kind === "nearcomplete")
        ) {
          expect(b.line).toBe(a.line);
          expect(b.horizontal).toBe(a.horizontal);
        }
      }
      // A threes/unique move (per-cell) is never a continuation.
      for (let i = 0; i < plan.length; i++) {
        if (plan[i].reason.kind === "threes" || plan[i].reason.kind === "unique") {
          expect(plan[i].continuesPrevious).toBe(false);
        }
      }
    }
    expect(found).toBe(true);
  });

  it("single gap: the lone empty in a count-complete line (a 'complete' reason)", () => {
    const plan = deduceHintPlan(craft(padTo6([[O, Z, O, Z, O, E]])));
    expect(plan[0].reason.kind).toBe("complete");
    expect(plan[0].index).toBe(5);
    expect(plan[0].value).toBe(Z);
    expect(plan[0].continuesPrevious).toBe(false);
  });

  it("near-complete: the worked example pins the last odd cell to a window", () => {
    // `1 1 0 . . .`: the last 1 can't go in the final cell (would make 0 0 0),
    // so the remaining cells are forced 0.
    const plan = deduceHintPlan(craft(padTo6([[O, O, Z, E, E, E]])));
    expect(plan[0].reason.kind).toBe("nearcomplete");
    expect(plan[0].value).toBe(Z);
    expect(plan[0].index).toBe(5);
    if (plan[0].reason.kind === "nearcomplete") {
      expect([...plan[0].reason.window].sort((a, b) => a - b)).toEqual([3, 4]);
      expect(plan[0].reason.anchor).toBe(2);
    }
  });

  it("unique: a cell that would duplicate a full row is forbidden", () => {
    // Row 0 full, row 5 matches it except at two empties; the unique-rows rule
    // forces those cells away from duplicating row 0.
    const rows = padTo6([[O, Z, O, Z, O, Z]]);
    rows[5] = [O, Z, O, E, E, Z];
    const plan = deduceHintPlan(craft(rows, true));
    expect(plan[0].reason.kind).toBe("unique");
    if (plan[0].reason.kind === "unique") {
      expect(plan[0].reason.rowA).toBe(0);
      expect(plan[0].reason.rowB).toBe(5);
    }
  });
});

function fromSeed(p: UnrulyParams, seed: string): UnrulyState {
  const { desc } = newDesc(p, randomNew(seed));
  return newState(p, desc);
}

describe("hint", () => {
  const P: UnrulyParams = { w2: 8, h2: 8, unique: false, diff: 1 };

  it("returns a plan whose moves are legal and solve the board", () => {
    const st = fromSeed(P, "unruly-hint-plan");
    const res = unrulyGame.hint?.(st);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    expect(res.steps.length).toBeGreaterThan(0);
    expect(res.steps[0].explanation.length).toBeGreaterThan(0);
    let cur = st;
    for (const step of res.steps) cur = unrulyGame.executeMove(cur, step.move);
    expect(isComplete(cur)).toBe(true);
  });

  it("gives every step visible evidence (a shaded area or a ringed premise)", () => {
    for (const seed of ["unruly-hint-plan", "unruly-ev-2", "unruly-ev-3"]) {
      const st = fromSeed(P, seed);
      const res = unrulyGame.hint?.(st);
      if (!res?.ok) throw new Error("expected a plan");
      for (const step of res.steps) {
        const hl = step.highlights as UnrulyHint;
        expect(hl.area.length > 0 || hl.ring.length > 0).toBe(true);
        // The shaded area never includes the target cell itself.
        const ti = hl.target.y * st.w2 + hl.target.x;
        expect(hl.area.includes(ti)).toBe(false);
      }
    }
  });

  it("refuses on a solved board", () => {
    const st = fromSeed(P, "unruly-hint-solved");
    const res0 = unrulyGame.hint?.(st);
    if (!res0?.ok) throw new Error("expected a plan");
    let cur = st;
    for (const step of res0.steps) cur = unrulyGame.executeMove(cur, step.move);
    expect(unrulyGame.hint?.(cur)?.ok).toBe(false);
  });

  it("refuses when the board has a mistake", () => {
    const st = fromSeed(P, "unruly-hint-mistake");
    // The hint's own first move is correct; play the opposite → a mistake.
    const res = unrulyGame.hint?.(st);
    if (!res?.ok) throw new Error("expected a plan");
    const t = (res.steps[0].highlights as UnrulyHint).target;
    const wrong: Cell = t.value === O ? Z : O;
    const bad = unrulyGame.executeMove(st, {
      type: "place",
      x: t.x,
      y: t.y,
      value: wrong,
    });
    expect(unrulyGame.hint?.(bad)?.ok).toBe(false);
  });
});

describe("hintKeepTrack", () => {
  it("completes when the move sets the hinted cell, off otherwise", () => {
    const st = fromSeed({ w2: 8, h2: 8, unique: false, diff: 1 }, "unruly-track");
    const res = unrulyGame.hint?.(st);
    if (!res?.ok) throw new Error("expected a plan");
    const step = res.steps[0];
    const t = (step.highlights as UnrulyHint).target;

    const right: UnrulyMove = { type: "place", x: t.x, y: t.y, value: t.value };
    expect(unrulyGame.hintKeepTrack?.(right, step, st)).toBe("completed");

    const wrongVal: UnrulyMove = {
      type: "place",
      x: t.x,
      y: t.y,
      value: t.value === O ? Z : O,
    };
    expect(unrulyGame.hintKeepTrack?.(wrongVal, step, st)).toBe("off");

    const elsewhere: UnrulyMove = {
      type: "place",
      x: (t.x + 1) % st.w2,
      y: t.y,
      value: t.value,
    };
    expect(unrulyGame.hintKeepTrack?.(elsewhere, step, st)).toBe("off");
  });
});

describe("animLength", () => {
  const P: UnrulyParams = { w2: 6, h2: 6, unique: false, diff: 0 };
  const ui = { cx: 0, cy: 0, cursor: false };
  const blank = craft(padTo6([]));

  it("animates a single-cell placement", () => {
    const next = unrulyGame.executeMove(blank, { type: "place", x: 1, y: 1, value: O });
    expect(unrulyGame.animLength?.(blank, next, 1, ui)).toBe(PLACE_ANIM_TIME);
  });

  it("does not animate a bulk solve fill", () => {
    const st = fromSeed(P, "unruly-anim-solve");
    const solveRes = unrulyGame.solve?.(st, st);
    if (!solveRes?.ok) throw new Error("expected solvable");
    const solved = unrulyGame.executeMove(st, solveRes.move);
    expect(unrulyGame.animLength?.(st, solved, 1, ui)).toBe(0);
  });

  it("does not animate when nothing changed", () => {
    expect(unrulyGame.animLength?.(blank, blank, 1, ui)).toBe(0);
  });
});
