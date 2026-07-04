/**
 * Tier-2.5 render scenarios for the Slant hint: drive a real Midend to a
 * displayed hint step and capture `redraw`. Targeted op assertions (the blue
 * `COL_HINT` target fill, the recoloured clue digit, the `COL_HINT_CELL`
 * evidence shade) plus one snapshot so a render regression is a reviewable
 * text diff (`vitest -u` re-baselines an intended change; the targeted
 * assertions survive a careless `-u`).
 */
import { describe, expect, it } from "vitest";
import type { HintStep } from "../../engine/game.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
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
  it("opener frame: blue target(s), recoloured clue digit, board intact", () => {
    const { recording, hint, size } = renderScenario({
      game: slantGame,
      id: boardId({ w: 5, h: 5, diff: DIFF_EASY }, "srs-easy-0"),
      showHint: true,
    });

    const h = hl(hint);
    expect(h).toBeDefined();
    // The opener is a clue firing: it carries a driving clue.
    expect(h?.clue).toBeDefined();

    // At least one blue COL_HINT target fill (target + any siblings).
    const targetRects = recording.ops.filter(
      (o) => o.op === "rect" && o.colour === COL_HINT,
    );
    expect(targetRects.length).toBeGreaterThanOrEqual(1);
    // The driving clue's digit recolours COL_HINT (the clue↔move tie).
    expect(recording.ops.some((o) => o.op === "text" && o.colour === COL_HINT)).toBe(
      true,
    );
    // Other clue digits still drawn; the grid frame is present.
    expect(recording.ops.some((o) => o.op === "text")).toBe(true);
    expect(recording.ops.some((o) => "colour" in o && o.colour === COL_GRID)).toBe(true);
    expect(size.w).toBeGreaterThan(0);

    expect(recording.ops).toMatchSnapshot();
  });

  it("loop frame: the closing chain shades COL_HINT_CELL under one blue target", () => {
    const { recording, hint } = renderScenario({
      game: slantGame,
      id: boardId({ w: 8, h: 8, diff: DIFF_HARD }, "srs-hard-0"),
      showHint: true,
      hintUntil: (step) => /already joined by a chain/.test(step.explanation ?? ""),
    });

    const h = hl(hint);
    expect(h).toBeDefined();
    expect((h?.area?.length ?? 0)).toBeGreaterThan(0);
    // Exactly one blue target (loop firings force a single square).
    expect(
      recording.ops.filter((o) => o.op === "rect" && o.colour === COL_HINT).length,
    ).toBe(1);
    // The chain is shaded.
    expect(
      recording.ops.some((o) => o.op === "rect" && o.colour === COL_HINT_CELL),
    ).toBe(true);
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
    expect(
      recording.ops.filter((o) => o.op === "rect" && o.colour === COL_HINT).length,
    ).toBe(1);
    expect(
      recording.ops.some((o) => "colour" in o && o.colour === COL_HINT_REF),
    ).toBe(true);
  });
});
