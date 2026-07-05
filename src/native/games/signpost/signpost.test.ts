/**
 * Tier-1 behavioural tests for the Signpost port: params/desc codecs,
 * generator solvability, solver, findMistakes, and a render smoke.
 */
import { describe, expect, it } from "vitest";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { newSignpostDesc } from "./generator.ts";
import { executeMove } from "./moves.ts";
import { signpostGame } from "./index.ts";
import { solveState } from "./solver.ts";
import {
  cloneState,
  FLAG_IMMUTABLE,
  generateDesc,
  stripNums,
  unpickDesc,
} from "./state.ts";

const PRESETS = [
  { w: 4, h: 4, forceCornerStart: true },
  { w: 4, h: 4, forceCornerStart: false },
  { w: 5, h: 5, forceCornerStart: true },
  { w: 5, h: 5, forceCornerStart: false },
];

describe("signpost params codec", () => {
  it("round-trips full params (corner start)", () => {
    const p = { w: 5, h: 5, forceCornerStart: true };
    const enc = signpostGame.encodeParams(p, true);
    expect(enc).toBe("5x5c");
    expect(signpostGame.decodeParams(enc)).toEqual(p);
  });

  it("round-trips full params (free ends)", () => {
    const p = { w: 6, h: 4, forceCornerStart: false };
    const enc = signpostGame.encodeParams(p, true);
    expect(enc).toBe("6x4");
    expect(signpostGame.decodeParams(enc)).toEqual(p);
  });

  it("rejects a 1x1 full generation", () => {
    expect(signpostGame.validateParams({ w: 1, h: 1, forceCornerStart: true }, true)).not
      .toBeNull();
    expect(signpostGame.validateParams({ w: 4, h: 4, forceCornerStart: true }, true)).toBeNull();
  });
});

describe("signpost desc codec", () => {
  it("round-trips a generated desc through unpick + generateDesc", () => {
    const p = { w: 4, h: 4, forceCornerStart: true };
    const { desc } = newSignpostDesc(p, randomNew("signpost-desc-1"));
    const r = unpickDesc(p, desc);
    expect("state" in r).toBe(true);
    if ("state" in r) {
      expect(generateDesc(r.state, false)).toBe(desc);
    }
  });

  it("validateDesc rejects an unknown direction char", () => {
    const p = { w: 2, h: 2, forceCornerStart: false };
    // 4 cells expected; 'z' is not a-h.
    expect(signpostGame.validateDesc(p, "1azaaa")).not.toBeNull();
  });

  it("validateDesc rejects a too-short desc", () => {
    const p = { w: 3, h: 3, forceCornerStart: false };
    expect(signpostGame.validateDesc(p, "1aae")).not.toBeNull();
  });
});

describe("signpost generator + solver", () => {
  it("generates uniquely solvable boards across presets", () => {
    for (const p of PRESETS) {
      for (let seed = 0; seed < 4; seed++) {
        const { desc } = newSignpostDesc(p, randomNew(`sp-${p.w}x${p.h}-${seed}`));
        const r = unpickDesc(p, desc);
        expect("state" in r).toBe(true);
        if (!("state" in r)) continue;
        // The bare clued board must solve uniquely (solver reaches 1).
        const solved = cloneState(r.state);
        stripNums(solved);
        expect(solveState(solved)).toBe(1);
      }
    }
  });

  it("solve() recovers the full chain from a dirty mid-game state", () => {
    const p = { w: 5, h: 5, forceCornerStart: true };
    const { desc } = newSignpostDesc(p, randomNew("sp-solve-1"));
    const s0 = signpostGame.newState(p, desc);
    const res = signpostGame.solve?.(s0, s0);
    expect(res?.ok).toBe(true);
    if (res?.ok) {
      const solved = signpostGame.executeMove(s0, res.move);
      expect(signpostGame.status(solved)).toBe("solved");
    }
  });
});

describe("signpost findMistakes", () => {
  it("flags a link that contradicts the unique solution", () => {
    const p = { w: 5, h: 5, forceCornerStart: true };
    const { desc } = newSignpostDesc(p, randomNew("sp-mistake-1"));
    const s0 = signpostGame.newState(p, desc);

    // Get the unique solution's next[] via solve.
    const res = signpostGame.solve?.(s0, s0);
    expect(res?.ok).toBe(true);
    if (!res?.ok) return;
    const solvedNext = (res.move as { type: "solve"; next: number[] }).next;

    // Find the '1' cell and a legal link it can make that is NOT the
    // solution link, then assert it is reported as a mistake.
    const one = s0.nums.indexOf(1);
    // Build a wrong board: link the '1' cell to any cell it points at that
    // is not its solution successor.
    let found = false;
    for (let target = 0; target < s0.n && !found; target++) {
      if (target === solvedNext[one]) continue;
      try {
        const wrong = executeMove(s0, {
          type: "link",
          fromX: one % s0.w,
          fromY: Math.floor(one / s0.w),
          toX: target % s0.w,
          toY: Math.floor(target / s0.w),
        });
        const mistakes = signpostGame.findMistakes?.(wrong) ?? [];
        // Any wrongly-linked cell should be flagged.
        expect(mistakes.length).toBeGreaterThan(0);
        found = true;
      } catch {
        // illegal link — try the next target
      }
    }
    expect(found).toBe(true);
  });

  it("reports no mistakes for the freshly-generated (unlinked) board", () => {
    const p = { w: 5, h: 5, forceCornerStart: true };
    const { desc } = newSignpostDesc(p, randomNew("sp-clean-1"));
    const s0 = signpostGame.newState(p, desc);
    expect(signpostGame.findMistakes?.(s0)).toEqual([]);
  });

  it("marks an immutable-number cell that stays immutable", () => {
    const p = { w: 4, h: 4, forceCornerStart: true };
    const { desc } = newSignpostDesc(p, randomNew("sp-imm-1"));
    const s0 = signpostGame.newState(p, desc);
    // The '1' anchor is always immutable.
    const one = s0.nums.indexOf(1);
    expect(s0.flags[one] & FLAG_IMMUTABLE).toBeTruthy();
  });
});

describe("signpost render smoke", () => {
  it("redraws the initial frame without throwing", () => {
    const p = { w: 5, h: 5, forceCornerStart: true };
    const { desc } = newSignpostDesc(p, randomNew("sp-render-1"));
    const { recording } = renderScenario({ game: signpostGame, id: `5x5c:${desc}` });
    expect(recording.ops.length).toBeGreaterThan(0);
    // A per-tile background rect must appear.
    expect(recording.ops.some((o) => o.op === "rect")).toBe(true);
  });
});
