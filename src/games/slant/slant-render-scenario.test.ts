/**
 * Tier-2.5 render scenarios for the Slant hint: drive a real Midend to a
 * displayed hint step and capture `redraw`. Targeted op assertions (the blue
 * `COL_HINT` target fill, the recolored clue digit, the `COL_HINT_CELL`
 * evidence shade) plus one snapshot so a render regression is a reviewable
 * text diff (`vitest -u` re-baselines an intended change; the targeted
 * assertions survive a careless `-u`).
 */
import { describe, expect, it } from "vitest";
import type { HintStep } from "../../engine/game.ts";
import { randomNew } from "../../engine/random/index.ts";
import { expectRing, isThin, markSides } from "../../engine/testing/mark-shape.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { type SlantHint, slantGame } from "./index.ts";
import { COL_GRID, COL_HINT, COL_HINT_CELL, COL_HINT_REF } from "./render.ts";
import { DIFF_EASY, DIFF_HARD, encodeParams, type SlantParams } from "./state.ts";

function boardId(params: SlantParams, seed: string): string {
  const { desc } = slantGame.newDesc(params, randomNew(seed));
  return `${encodeParams(params, true)}:${desc}`;
}

const hl = (step: HintStep<unknown> | undefined): SlantHint | undefined =>
  step?.highlights as SlantHint | undefined;

describe("Slant hint render scenarios", () => {
  it("opener frame: ringed target(s), recoloured clue digit, board intact", () => {
    const { recording, hint, size } = renderScenario({
      game: slantGame,
      id: boardId({ w: 5, h: 5, diff: DIFF_EASY }, "srs-easy-0"),
      showHint: true,
    });

    const h = hl(hint);
    expect(h).toBeDefined();
    // The opener is a clue firing: it carries a driving clue.
    expect(h?.clue).toBeDefined();

    // The target and any siblings are **ringed**, four thin rects each and none
    // solid: a blue square in Slant would read as a slash already placed.
    expectRing(recording.ops, COL_HINT, 1 + (h?.siblings?.length ?? 0));
    // The driving clue's digit recolors COL_HINT (the clue↔move tie).
    expect(recording.ops.some((o) => o.op === "text" && o.color === COL_HINT)).toBe(
      true,
    );
    // Other clue digits still drawn; the grid frame is present.
    expect(recording.ops.some((o) => o.op === "text")).toBe(true);
    expect(recording.ops.some((o) => "color" in o && o.color === COL_GRID)).toBe(true);
    expect(size.w).toBeGreaterThan(0);

    expect(recording.ops).toMatchSnapshot();
  });

  it("loop frame: the closing chain outlines COL_HINT_CELL under one ringed target", () => {
    const { recording, hint } = renderScenario({
      game: slantGame,
      id: boardId({ w: 8, h: 8, diff: DIFF_HARD }, "srs-hard-0"),
      showHint: true,
      hintUntil: (step) => /already joined by a chain/.test(step.explanation ?? ""),
    });

    const h = hl(hint);
    expect(h).toBeDefined();
    expect(h?.area?.length ?? 0).toBeGreaterThan(0);
    // Exactly one ringed target (loop firings force a single square).
    expectRing(recording.ops, COL_HINT);
    // The chain is **outlined**, not shaded: its squares carry the very
    // diagonals the deduction reasons from.
    const chain = markSides(recording.ops, COL_HINT_CELL);
    expect(chain.length).toBeGreaterThan(0);
    for (const s of chain) expect(isThin(s)).toBe(true);
  });

  it("equivalence frame: the cited anchor rings COL_HINT_REF", () => {
    const { recording, hint } = renderScenario({
      game: slantGame,
      id: boardId({ w: 12, h: 10, diff: DIFF_HARD }, "srs-hard-eq"),
      showHint: true,
      hintUntil: (step) => /locked to the same slant/.test(step.explanation ?? ""),
    });

    const h = hl(hint);
    expect(h?.ref).toBeDefined();
    expectRing(recording.ops, COL_HINT);
    expect(recording.ops.some((o) => "color" in o && o.color === COL_HINT_REF)).toBe(
      true,
    );
  });
});
