/**
 * Tier-2.5 render scenario + snapshot for the Pattern hint: drive a real
 * Midend to a displayed hint step and capture `redraw`. Targeted op assertions
 * (the `COL_HINT` target, the `COL_HINT_CELL` line-of-sight shade, the clue
 * text, the grid frame) plus a snapshot so a render regression is a reviewable
 * text diff. `vitest -u` re-baselines an intended change — keep the targeted
 * assertions so a careless `-u` can't silently erase them.
 */
import { describe, expect, it } from "vitest";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { type PatternHint, patternGame } from "./index.ts";
import { COL_GRID, COL_HINT, COL_HINT_BLACKREF, COL_HINT_CELL } from "./render.ts";

const P = { w: 10, h: 10 };

function boardId(seed: string): string {
  const { desc } = patternGame.newDesc(P, randomNew(seed));
  return `10x10:${desc}`;
}

describe("Pattern hint render scenarios", () => {
  it("opener frame: a COL_HINT target over a shaded line, clues intact", () => {
    const { recording, hint, size } = renderScenario({
      game: patternGame,
      id: boardId("pattern-hint-opener"),
      showHint: true,
    });

    // A hint step is on display.
    expect(hint).toBeDefined();
    const hl = hint?.highlights as PatternHint | undefined;
    expect(hl).toBeDefined();

    // The forced cell(s) paint COL_HINT (the blue highlight, never the mark).
    expect(recording.ops.some((o) => o.op === "rect" && o.colour === COL_HINT)).toBe(
      true,
    );
    // The reasoned line of sight shades COL_HINT_CELL.
    expect(
      recording.ops.some((o) => o.op === "rect" && o.colour === COL_HINT_CELL),
    ).toBe(true);
    // The clue numbers are still drawn (the hint overlays, it doesn't erase).
    expect(recording.ops.some((o) => o.op === "text")).toBe(true);
    // The outer grid frame is drawn.
    expect(recording.ops.some((o) => o.op === "rect" && o.colour === COL_GRID)).toBe(
      true,
    );
    // The board fills its declared size.
    expect(size.w).toBeGreaterThan(0);

    expect(recording.ops).toMatchSnapshot();
  });

  it("ringed-premise frame: a cited black mark rings COL_HINT_BLACKREF", () => {
    // Walk the plan to the first step that cites an already-placed black mark
    // (an overlap anchored by an earlier deduction), and assert the teal ring.
    const { recording, hint } = renderScenario({
      game: patternGame,
      id: boardId("pattern-hint-ring"),
      showHint: true,
      hintUntil: (step) => {
        const hl = step.highlights as PatternHint | undefined;
        return (hl?.blackRefs.length ?? 0) > 0;
      },
    });

    const hl = hint?.highlights as PatternHint | undefined;
    expect(hl?.blackRefs.length ?? 0).toBeGreaterThan(0);
    // The cited black premise is ringed in the black-reference colour.
    expect(
      recording.ops.some((o) => o.op === "rect" && o.colour === COL_HINT_BLACKREF),
    ).toBe(true);
  });
});
