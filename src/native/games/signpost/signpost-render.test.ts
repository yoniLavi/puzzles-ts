/**
 * Tier-2.5 render scenarios for Signpost: drive a real Midend to a frame
 * and capture `redraw`. Targeted op assertions (background + region-ramp
 * rects, arrow polygons, number text, the grid frame, the red mistake
 * overlay) plus one snapshot so a render regression is a reviewable text
 * diff (`vitest -u` re-baselines an intended change; the targeted
 * assertions survive a careless `-u`).
 */
import { describe, expect, it } from "vitest";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { newSignpostDesc } from "./generator.ts";
import { signpostGame } from "./index.ts";
import { solveState } from "./solver.ts";
import { cloneState, type SignpostMove, type SignpostParams } from "./state.ts";

const COL_GRID = 3;
const COL_ERROR = 5;

function boardId(p: SignpostParams, seed: string): string {
  const { desc } = newSignpostDesc(p, randomNew(seed));
  return `${signpostGame.encodeParams(p, true)}:${desc}`;
}

describe("Signpost render scenarios", () => {
  it("opener frame: backgrounds, arrows, numbers, grid frame", () => {
    const { recording, size } = renderScenario({
      game: signpostGame,
      id: boardId({ w: 5, h: 5, forceCornerStart: true }, "sp-render-open"),
    });

    // Per-tile background rects.
    expect(recording.ops.some((o) => o.op === "rect")).toBe(true);
    // Direction arrows (and the final-cell star) are polygons.
    expect(recording.ops.some((o) => o.op === "polygon")).toBe(true);
    // Immutable numbers are text.
    expect(recording.ops.some((o) => o.op === "text")).toBe(true);
    // The grid frame line.
    expect(recording.ops.some((o) => "colour" in o && o.colour === COL_GRID)).toBe(
      true,
    );
    expect(size.w).toBeGreaterThan(0);

    expect(recording.ops).toMatchSnapshot();
  });

  it("mistake overlay: a wrong link recolours a number COL_ERROR", () => {
    const p: SignpostParams = { w: 5, h: 5, forceCornerStart: true };
    // Find a seed + a legal-but-wrong link from the '1' cell.
    let scenarioId = "";
    let wrongMove: SignpostMove | null = null;
    for (let attempt = 0; attempt < 20 && !wrongMove; attempt++) {
      const { desc } = newSignpostDesc(p, randomNew(`sp-render-mistake-${attempt}`));
      const s0 = signpostGame.newState(p, desc);
      const solved = cloneState(s0);
      if (solveState(solved) !== 1) continue;
      const one = s0.nums.indexOf(1);
      for (let target = 0; target < s0.n; target++) {
        if (target === solved.next[one]) continue;
        const m: SignpostMove = {
          type: "link",
          fromX: one % s0.w,
          fromY: Math.floor(one / s0.w),
          toX: target % s0.w,
          toY: Math.floor(target / s0.w),
        };
        try {
          signpostGame.executeMove(s0, m);
          wrongMove = m;
          scenarioId = `${signpostGame.encodeParams(p, true)}:${desc}`;
          break;
        } catch {
          // illegal — keep scanning
        }
      }
    }
    expect(wrongMove).not.toBeNull();
    if (!wrongMove) return;

    const { recording, mistakeCount } = renderScenario({
      game: signpostGame,
      id: scenarioId,
      moves: [wrongMove],
      showMistakes: true,
    });

    expect(mistakeCount).toBeGreaterThan(0);
    // The offending cell's number is drawn in the error colour.
    expect(recording.ops.some((o) => o.op === "text" && o.colour === COL_ERROR)).toBe(
      true,
    );
  });
});
