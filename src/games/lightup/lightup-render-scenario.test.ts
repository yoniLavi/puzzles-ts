/**
 * Tier-2.5 render scenarios for the Light Up hint: drive a real Midend to
 * a displayed hint step and capture `redraw`. Targeted op assertions (the
 * blue `COL_HINT` targets, the `COL_HINT_CELL` evidence shade, the violet
 * dark-square ring) plus one snapshot so a render regression is a
 * reviewable text diff (`vitest -u` re-baselines an intended change; the
 * targeted assertions survive a careless `-u`).
 *
 * Seeds were scanned for plans containing each firing type (the
 * fixed-seed-scan idiom); the predicates walk the plan to the frame.
 */
import { describe, expect, it } from "vitest";
import type { HintStep } from "../../engine/game.ts";
import { randomNew } from "../../engine/random/index.ts";
import { expectRing } from "../../engine/testing/mark-shape.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { type LightupHint, lightupGame } from "./index.ts";
import {
  COL_GRID,
  COL_HINT,
  COL_HINT_CELL,
  COL_HINT_DARKREF,
  COL_HINT_LITERF,
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
  it("opener frame: grouped ringed targets, recoloured clue digit, board intact", () => {
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

    // Every target is **ringed** COL_HINT (a mark, not the bulb the player must
    // place) — four thin rects each, and no solid one.
    expectRing(recording.ops, COL_HINT, h?.targets.length);
    // The driving clue's digit recolors COL_HINT (the clue↔move tie).
    expect(recording.ops.some((o) => o.op === "text" && o.color === COL_HINT)).toBe(
      true,
    );
    // Clue digits elsewhere still drawn; the grid frame is present.
    expect(recording.ops.some((o) => o.op === "text")).toBe(true);
    expect(recording.ops.some((o) => "color" in o && o.color === COL_GRID)).toBe(true);
    expect(size.w).toBeGreaterThan(0);

    expect(recording.ops).toMatchSnapshot();
  });

  it("forcedLight frame: corridor shaded, dark square ringed violet, one blue target", () => {
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
    // One ringed target; corridor evidence cues (shade on a dark square,
    // green ring on a lit one — this frame's corridor is fully lit/crossed,
    // so at least one of the two cues must appear); the violet ring.
    expectRing(recording.ops, COL_HINT);
    expect(
      recording.ops.some(
        (o) =>
          (o.op === "rect" && o.color === COL_HINT_CELL) ||
          (o.op === "line" && o.color === COL_HINT_LITERF),
      ),
    ).toBe(true);
    expect(
      recording.ops.some((o) => "color" in o && o.color === COL_HINT_DARKREF),
    ).toBe(true);
  });

  it("clueSatisfied frame: grouped impossible-mark targets are all ringed", () => {
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
    expectRing(recording.ops, COL_HINT, h?.targets.length);
  });

  it("discount frame: the dark square rings violet over its shaded rule-out set", () => {
    // lrs-tricky-1's plan contains a discountUnlit firing.
    const { recording, hint } = renderScenario({
      game: lightupGame,
      id: boardId(TRICKY, "lrs-tricky-1"),
      showHint: true,
      // Reach the frame by its *shape*, not by its wording: `discountUnlit` is
      // the only firing that crosses a square out while ringing a dark one, so
      // this predicate survives a rewording of the sentence (which
      // `disambiguate-hint-deixis` then did).
      hintUntil: (step) => {
        const h = hl(step);
        return h?.kind === "impossible" && h?.dark !== undefined;
      },
    });

    const h = hl(hint);
    expect(h?.kind).toBe("impossible");
    expect(h?.targets.length).toBe(1);
    expect(
      recording.ops.some((o) => "color" in o && o.color === COL_HINT_DARKREF),
    ).toBe(true);
    expect(
      recording.ops.some((o) => o.op === "rect" && o.color === COL_HINT_CELL),
    ).toBe(true);
  });
});
