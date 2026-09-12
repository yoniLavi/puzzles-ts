// Tier-2 render test: drive Flood's `redraw` against the engine's shared
// `RecordingDrawing` and assert the draw-call structure — play-color
// tiles, separator borders between differing-color cells, the cursor
// outline, the hint SOLNNEXT circle, and victory/defeat flash overlays.
import { describe, expect, it } from "vitest";
import type { HintStep } from "../../engine/game.ts";
import { newCursor } from "../../engine/pointer.ts";
import { opsOfKind, RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import { DEFAULT_BACKGROUND } from "../../engine/testing/render-scenario.ts";
import { floodGame } from "./index.ts";
import { type FloodDrawState, redraw } from "./render.ts";
import { type FloodMove, type FloodState, newState } from "./state.ts";

const PALETTE = floodGame.colors(DEFAULT_BACKGROUND);

/** A frame recorded through the shared recorder. The local double this
 * replaced kept only the fill color and first vertex of a polygon, only the
 * color of a line, and nothing at all from a `drawText`. */
function recordingDrawing(): { dr: RecordingDrawing; ops: RecordingDrawing["ops"] } {
  const dr = new RecordingDrawing(PALETTE);
  return { dr, ops: dr.ops };
}

const TS = 32; // sepWidth = 1, cursorInset = 4, both > 0.
const UI = { cursor: newCursor() };

function freshDs(state: FloodState): FloodDrawState {
  const ds = floodGame.newDrawState?.(state) as FloodDrawState;
  floodGame.setTileSize?.(ds, TS);
  return ds;
}

describe("Flood redraw", () => {
  it("paints play-color tiles and a recessed bevel on first draw", () => {
    const state = newState({ w: 2, h: 2, colors: 3, leniency: 0 }, "0112,9");
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, state, 1, UI, 0, 0);

    // Two recessed-bevel polygons (highlight + lowlight).
    expect(ops.filter((o) => o.op === "polygon").length).toBe(2);
    // A full-tile rect in a play color (COL_1 = palette index 2) for the
    // corner cell (color 0).
    expect(ops.some((o) => o.op === "rect" && o.color === 2 && o.w === TS)).toBe(true);
  });

  it("draws separator borders (COL_SEPARATOR) between differing cells", () => {
    const state = newState({ w: 2, h: 1, colors: 3, leniency: 0 }, "01,9");
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, state, 1, UI, 0, 0);
    // A thin (w = sepWidth = 1) separator-color rect appears.
    expect(ops.some((o) => o.op === "rect" && o.color === 1 && o.w === 1)).toBe(true);
  });

  it("draws the cursor outline when the cursor is visible", () => {
    const state = newState({ w: 2, h: 2, colors: 3, leniency: 0 }, "0112,9");
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, state, 1, { cursor: newCursor(0, 0, true) }, 0, 0);
    // The cursor outline is four separator-color lines.
    expect(ops.filter((o) => o.op === "line" && o.color === 1).length).toBe(4);
  });

  it("draws the hint SOLNNEXT circle on the next-fill squares", () => {
    const state = newState({ w: 3, h: 1, colors: 3, leniency: 0 }, "010,9");
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    const hint: HintStep<FloodMove> = {
      move: { type: "fill", color: 1 },
      explanation: "Fill with yellow",
    };
    redraw(dr, ds, null, state, 1, UI, 0, 0, hint);
    // The shared recorder keeps a circle's fill AND outline separately, where
    // the local double kept one number called `color` — so this now says which.
    expect(ops.some((o) => o.op === "circle" && o.fill === 1)).toBe(true);
  });

  it("superimposes the victory rainbow when a completed board flashes", () => {
    // A solved single-color board; the rainbow recolors cells near the
    // corner, so multiple distinct play colors are drawn.
    const base = newState(
      { w: 5, h: 5, colors: 6, leniency: 0 },
      `${"0".repeat(25)},9`,
    );
    // A one-color desc decodes to `colors: 1`; a real win keeps the colors
    // the board started with, and those are what the rainbow cycles through.
    const state: FloodState = { ...base, colors: 6, completed: true, moves: 3 };
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    // 0.12 / VICTORY_FLASH_FRAME (0.03) floors to frame 3, so cells within
    // Manhattan distance 3 of the corner take colors 0..3.
    redraw(dr, ds, null, state, 1, UI, 0, 0.12);
    // Whole-tile rects only: a separator strip along a tile's edge is TS wide.
    const tiles = opsOfKind(ops, "rect").filter((o) => o.w === TS && o.h === TS);
    expect(new Set(tiles.map((o) => o.color)).size).toBeGreaterThan(1);
  });

  it("blinks the board to the separator color on a defeat flash", () => {
    const base = newState({ w: 3, h: 3, colors: 3, leniency: 0 }, "012120201,1");
    // Lost: moves at the limit, not complete.
    const state: FloodState = { ...base, moves: 1 };
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    // flashTime / DEFEAT_FLASH_FRAME(0.1) = 0 (≠ 1) → BADFLASH → every
    // tile painted in the separator color at full size.
    redraw(dr, ds, null, state, 1, UI, 0, 0.05);
    const tiles = opsOfKind(ops, "rect").filter((o) => o.w === TS && o.h === TS);
    expect(tiles).toHaveLength(9);
    expect(tiles.every((o) => o.color === 1)).toBe(true);
  });
});
