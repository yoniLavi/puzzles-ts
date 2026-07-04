/**
 * Tier-2.5 render scenarios for the Light Up hint: drive a real Midend to
 * a displayed hint step and capture `redraw`. Targeted op assertions (the
 * blue `COL_HINT` targets, the `COL_HINT_CELL` evidence shade, the amber
 * dark-square ring) plus one snapshot so a render regression is a
 * reviewable text diff (`vitest -u` re-baselines an intended change; the
 * targeted assertions survive a careless `-u`).
 *
 * Seeds were scanned for plans containing each firing type (the
 * fixed-seed-scan idiom); the predicates walk the plan to the frame.
 */
import { describe, expect, it } from "vitest";
import type { HintStep } from "../../engine/game.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { type LightupHint, lightupGame } from "./index.ts";
import {
  COL_GRID,
  COL_HINT,
  COL_HINT_CELL,
  COL_HINT_DARKREF,
  COL_HINT_LITREF,
} from "./render.ts";
import { encodeParams, type LightupParams, SYMM_ROT4 } from "./state.ts";

const EASY: LightupParams = { w: 7, h: 7, blackpc: 20, symm: SYMM_ROT4, difficulty: 0 };
const TRICKY: LightupParams = { ...EASY, difficulty: 1 };

function boardId(params: LightupParams, seed: string): string {
  const { desc } = lightupGame.newDesc(params, randomNew(seed));
  return `${encodeParams(params, true)}:${desc}`;
}

const hl = (step: HintStep<unknown> | undefined): LightupHint | undefined =>
  step?.highlights as LightupHint | undefined;

describe("Light Up hint render scenarios", () => {
  it("opener frame: grouped blue targets, recoloured clue digit, board intact", () => {
    // lrs-easy-0's opener is a clueSaturated firing forcing three bulbs.
    const { recording, hint, size } = renderScenario({
      game: lightupGame,
      id: boardId(EASY, "lrs-easy-0"),
      showHint: true,
    });

    const h = hl(hint);
    expect(h).toBeDefined();
    expect(h?.targets.length).toBeGreaterThan(1);
    expect(h?.clue).toBeDefined();

    // Every target paints the blue COL_HINT fill (highlight only — no
    // bulb circle is drawn on a target).
    const hintRects = recording.ops.filter(
      (o) => o.op === "rect" && o.colour === COL_HINT,
    );
    expect(hintRects.length).toBe(h?.targets.length);
    // The driving clue's digit recolours COL_HINT (the clue↔move tie).
    expect(recording.ops.some((o) => o.op === "text" && o.colour === COL_HINT)).toBe(
      true,
    );
    // Clue digits elsewhere still drawn; the grid frame is present.
    expect(recording.ops.some((o) => o.op === "text")).toBe(true);
    expect(recording.ops.some((o) => "colour" in o && o.colour === COL_GRID)).toBe(
      true,
    );
    expect(size.w).toBeGreaterThan(0);

    expect(recording.ops).toMatchSnapshot();
  });

  it("forcedLight frame: corridor shaded, dark square ringed amber, one blue target", () => {
    const { recording, hint } = renderScenario({
      game: lightupGame,
      id: boardId(EASY, "lrs-easy-0"),
      showHint: true,
      hintUntil: (step) => {
        const h = hl(step);
        return (
          /must hold a bulb/.test(step.explanation ?? "") &&
          (h?.area.length ?? 0) > 0 &&
          h?.dark !== undefined
        );
      },
    });

    const h = hl(hint);
    expect(h?.dark).toBeDefined();
    // One blue target; corridor evidence cues (shade on a dark square,
    // teal ring on a lit one — this frame's corridor is fully lit/crossed,
    // so at least one of the two cues must appear); the amber ring.
    expect(
      recording.ops.filter((o) => o.op === "rect" && o.colour === COL_HINT).length,
    ).toBe(1);
    expect(
      recording.ops.some(
        (o) =>
          (o.op === "rect" && o.colour === COL_HINT_CELL) ||
          (o.op === "line" && o.colour === COL_HINT_LITREF),
      ),
    ).toBe(true);
    expect(
      recording.ops.some((o) => "colour" in o && o.colour === COL_HINT_DARKREF),
    ).toBe(true);
  });

  it("clueSatisfied frame: grouped impossible-mark targets all paint COL_HINT", () => {
    const { recording, hint } = renderScenario({
      game: lightupGame,
      id: boardId(EASY, "lrs-easy-0"),
      showHint: true,
      hintUntil: (step) => {
        const h = hl(step);
        return h?.kind === "impossible" && (h?.targets.length ?? 0) > 1;
      },
    });

    const h = hl(hint);
    expect(h?.kind).toBe("impossible");
    expect(
      recording.ops.filter((o) => o.op === "rect" && o.colour === COL_HINT).length,
    ).toBe(h?.targets.length);
  });

  it("discount frame: the dark square rings amber over its shaded rule-out set", () => {
    // lrs-tricky-1's plan contains a discountUnlit firing.
    const { recording, hint } = renderScenario({
      game: lightupGame,
      id: boardId(TRICKY, "lrs-tricky-1"),
      showHint: true,
      hintUntil: (step) => /rule out every one of them/.test(step.explanation ?? ""),
    });

    const h = hl(hint);
    expect(h?.kind).toBe("impossible");
    expect(h?.targets.length).toBe(1);
    expect(
      recording.ops.some((o) => "colour" in o && o.colour === COL_HINT_DARKREF),
    ).toBe(true);
    expect(
      recording.ops.some((o) => o.op === "rect" && o.colour === COL_HINT_CELL),
    ).toBe(true);
  });
});
