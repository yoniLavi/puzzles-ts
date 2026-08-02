/**
 * Tier-2.5 render scenarios for Pearl: drive a real Midend to a target frame
 * and capture `redraw`. Targeted op assertions (pearls as black/white
 * circles, laid loop segments as thick lines, the `COL_MISTAKE` overlay) plus
 * a snapshot so a render regression is a reviewable text diff. A second
 * scenario switches the `appearance` preference to the loopy style and
 * asserts the centre-dot grid it draws.
 */
import { describe, expect, it } from "vitest";
import { Midend } from "../../engine/midend.ts";
import { RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { pearlGame } from "./index.ts";
import { COL_BLACK, COL_GRID, COL_MISTAKE, COL_WHITE } from "./render.ts";
import { pearlSolve } from "./solver.ts";
import {
  DIFF_COUNT,
  L,
  newState,
  type PearlMove,
  type PearlParams,
  R,
} from "./state.ts";

const P: PearlParams = { w: 6, h: 6, difficulty: 0, nosolve: false };
// A recorded fixture desc (see __fixtures__/pearl-c-reference.json, pearl-0):
// a real 6x6 Easy board with both black (B) and white (W) pearls.
const DESC = "dWbWWcBaWaWdBhBbBaB";
const ID = `${pearlGame.encodeParams(P, true)}:${DESC}`;

/** A reciprocal one-edge line flip (what a one-cell drag commits). */
const flipR = (x: number, y: number): PearlMove => ({
  ops: [
    { kind: "flip", l: R, x, y },
    { kind: "flip", l: L, x: x + 1, y },
  ],
});

describe("Pearl render scenarios", () => {
  it("opener frame draws black and white pearls as circles", () => {
    const { recording } = renderScenario({ game: pearlGame, id: ID });
    const circles = recording.ops.filter((o) => o.op === "circle");
    // Black pearls (CORNER) render with a COL_BLACK fill, white with COL_WHITE.
    expect(circles.some((o) => o.op === "circle" && o.fill === COL_BLACK)).toBe(true);
    expect(circles.some((o) => o.op === "circle" && o.fill === COL_WHITE)).toBe(true);
    expect(recording.ops).toMatchSnapshot();
  });

  it("a laid loop segment draws a thick black line rect", () => {
    const { recording } = renderScenario({
      game: pearlGame,
      id: ID,
      moves: [flipR(1, 1)],
    });
    // draw_lines_specific lays the segment as filled rects in COL_BLACK.
    expect(recording.ops.some((o) => o.op === "rect" && o.colour === COL_BLACK)).toBe(
      true,
    );
  });

  it("a wrong segment shows the COL_MISTAKE overlay", () => {
    // Find a horizontal edge the unique solution does NOT contain.
    const state = newState(P, DESC);
    const sol = new Uint8Array(P.w * P.h);
    expect(pearlSolve(P.w, P.h, state.clues, sol, DIFF_COUNT, false)).toBe(1);
    let wrong: { x: number; y: number } | null = null;
    for (let y = 0; y < P.h && !wrong; y++)
      for (let x = 0; x < P.w - 1 && !wrong; x++)
        if (!(sol[y * P.w + x] & R)) wrong = { x, y };
    expect(wrong).not.toBeNull();
    if (!wrong) return;

    const { recording, mistakeCount } = renderScenario({
      game: pearlGame,
      id: ID,
      moves: [flipR(wrong.x, wrong.y)],
      showMistakes: true,
    });
    expect(mistakeCount).toBeGreaterThan(0);
    expect(recording.ops.some((o) => o.op === "rect" && o.colour === COL_MISTAKE)).toBe(
      true,
    );
  });

  it("the loopy appearance draws centre-dot grid instead of a black border", () => {
    const midend = new Midend(pearlGame);
    expect(midend.newGameFromId(ID)).toBeUndefined();
    // Switch to the loopy appearance (choice index 1).
    expect(midend.setPreferences({ appearance: 1 })).toBeUndefined();
    const palette = pearlGame.colours([0.9, 0.9, 0.9]);
    const recording = new RecordingDrawing(palette);
    midend.redraw(recording);
    // Loopy style draws centre dots (filled COL_GRID circles); traditional
    // draws none.
    expect(recording.ops.some((o) => o.op === "circle" && o.fill === COL_GRID)).toBe(
      true,
    );
    expect(recording.ops).toMatchSnapshot();
  });
});
