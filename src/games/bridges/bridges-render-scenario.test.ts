/**
 * Tier-2.5 render scenarios for Bridges: drive a real Midend to a hint frame
 * and capture `redraw`. Targeted op assertions plus a snapshot, so a render
 * regression is a reviewable text diff (`vitest -u` re-baselines; the targeted
 * assertions survive a careless `-u`).
 *
 * The frame is what settles this game's answer to `hint-mark.ts`: every mark
 * here is one of the game's own shapes recolored, because neither thing a
 * Bridges deduction points at is a cell whose border box means anything.
 */
import { describe, expect, it } from "vitest";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import type { BridgesHighlights } from "./hint.ts";
import { bridgesGame } from "./index.ts";
import {
  COL_FOREGROUND,
  COL_HINT,
  COL_HINT_CELL,
  PREFERRED_TILE_SIZE,
} from "./render.ts";
import { BRIDGES_PRESETS } from "./state.ts";

const P = BRIDGES_PRESETS[2];
const ID = `${bridgesGame.encodeParams(P, true)}#bridges-scenario`;

describe("Bridges render scenarios", () => {
  it("opener frame: island clues drawn, no bridges yet", () => {
    const { recording } = renderScenario({ game: bridgesGame, id: ID });
    expect(recording.ops.some((o) => o.op === "text")).toBe(true);
    expect(recording.ops.some((o) => o.op === "circle")).toBe(true);
    expect(recording.ops).toMatchSnapshot();
  });

  it("a displayed hint draws the bridge it asks for, and never fills a tile", () => {
    const { recording, hint } = renderScenario({
      game: bridgesGame,
      id: ID,
      showHint: true,
    });
    expect(hint?.explanation.length).toBeGreaterThan(20);

    // The action is a *bridge*, drawn as the bar the game draws, recolored.
    expect(
      recording.ops.some((o) => o.op === "rect" && o.color === COL_HINT),
      "the hint drew no bridge in the action color",
    ).toBe(true);
    // …and the island the sentence is about is its own rim and digit recolored,
    // which is a circle and a piece of text rather than any kind of rect.
    // The rim is an annulus: an `fg` disc with a `bg` disc painted over it, so
    // the color is on the outer circle's `fill`/`outline` and what survives is
    // a ring the width of one line.
    expect(
      recording.ops.some((o) => o.op === "circle" && o.outline === COL_HINT),
      "the focus island's rim is not in the action color",
    ).toBe(true);
    expect(
      recording.ops.some((o) => o.op === "text" && o.color === COL_HINT),
      "the focus island's clue digit is not in the action color",
    ).toBe(true);

    // No hint mark is a fill. The cross-game guard says this too; a
    // frame-level assertion is what survives a careless `vitest -u`
    // (docs/games/hints.md § "Shade vs ring").
    for (const o of recording.ops) {
      if (o.op !== "rect") continue;
      if (o.color !== COL_HINT && o.color !== COL_HINT_CELL) continue;
      const short = Math.min(o.w, o.h);
      expect(
        short * 4 < Math.max(o.w, o.h) || short < PREFERRED_TILE_SIZE / 2,
        `a hint mark is tile-sized in both directions: ${JSON.stringify(o)}`,
      ).toBe(true);
    }
    expect(recording.ops).toMatchSnapshot();
  });

  it("a step that cites other islands outlines exactly those", () => {
    const { recording, hint } = renderScenario({
      game: bridgesGame,
      id: ID,
      showHint: true,
      hintUntil: (s) =>
        ((s as { highlights?: BridgesHighlights }).highlights?.islands.length ?? 0) > 0,
    });
    const cited = (hint as { highlights?: BridgesHighlights } | undefined)?.highlights
      ?.islands;
    expect(cited?.length, "no step in the plan cites another island").toBeGreaterThan(
      0,
    );
    // One recolored rim per cited island. Only the outer circle carries the
    // color, and an island's arcs intrude into its four neighbor tiles, which
    // is why the count is a floor rather than an equality.
    const rims = recording.ops.filter(
      (o) => o.op === "circle" && o.outline === COL_HINT_CELL,
    );
    expect(rims.length).toBeGreaterThanOrEqual(cited?.length ?? 0);
  });

  it("a bridge the step adds to an existing one leaves the first in board ink", () => {
    // The half of "highlight, never perform" a bundle has to get right: raising
    // a span from one bridge to two draws two bars, and only the new one is the
    // hint's (docs/games/hints.md § "Echo the move's shape in the hint color").
    const { recording, hint } = renderScenario({
      game: bridgesGame,
      id: ID,
      showHint: true,
      hintUntil: (s) =>
        ((s as { highlights?: BridgesHighlights }).highlights?.targets ?? []).some(
          (t) => t.bridges > 1,
        ),
    });
    const raised = (
      hint as { highlights?: BridgesHighlights } | undefined
    )?.highlights?.targets.filter((t) => t.bridges > 1);
    expect(raised?.length, "no step in the plan raises a span").toBeGreaterThan(0);
    expect(
      recording.ops.some((o) => o.op === "rect" && o.color === COL_FOREGROUND),
      "the board's own bridges vanished behind the hint",
    ).toBe(true);
  });
});
