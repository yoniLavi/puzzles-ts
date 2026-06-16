// Tier-2 / tier-2.5 render tests for Range: a direct `redraw` against
// the shared recording double for the live error highlight and the
// white dot, plus a `renderScenario` snapshot of a generated board
// (grid outline, clue text, background) so a render regression is a
// reviewable text diff.
import { describe, expect, it } from "vitest";
import { RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { rangeGame } from "./index.ts";
import {
  COL_ERROR,
  COL_GRID,
  colours,
  newDrawState,
  redraw,
  setTileSize,
} from "./render.ts";
import { BLACK, EMPTY, type RangeState, type RangeUi, WHITE } from "./state.ts";

const palette = colours([0.8, 0.8, 0.8]);

function renderState(
  state: RangeState,
  ui: RangeUi,
  mistakes?: { r: number; c: number }[],
): RecordingDrawing {
  const rec = new RecordingDrawing(palette);
  const ds = newDrawState(state);
  setTileSize(ds, 32);
  redraw(rec, ds, null, state, 1, ui, 0, 0, undefined, mistakes);
  return rec;
}

const noCursor: RangeUi = { r: 0, c: 0, cursorShow: false };

function makeState(w: number, h: number, grid: number[]): RangeState {
  return { w, h, grid: Int8Array.from(grid), hasCheated: false, wasSolved: false };
}

describe("live error highlight", () => {
  it("reddens two orthogonally adjacent black cells", () => {
    // 3x1: two adjacent blacks violate the no-touching rule.
    const rec = renderState(makeState(3, 1, [BLACK, BLACK, EMPTY]), noCursor);
    const hasErrorRect = rec.ops.some((o) => o.op === "rect" && o.colour === COL_ERROR);
    expect(hasErrorRect).toBe(true);
  });

  it("reddens a Check & Save mistake cell that is not a live error", () => {
    // A lone black breaks no rule (no live error), but the mistake
    // overlay must still highlight it red.
    const state = makeState(3, 1, [BLACK, EMPTY, EMPTY]);
    const clean = renderState(state, noCursor);
    expect(clean.ops.some((o) => o.op === "rect" && o.colour === COL_ERROR)).toBe(
      false,
    );
    const flagged = renderState(state, noCursor, [{ r: 0, c: 0 }]);
    expect(flagged.ops.some((o) => o.op === "rect" && o.colour === COL_ERROR)).toBe(
      true,
    );
  });

  it("does not redden a legal black", () => {
    const rec = renderState(makeState(3, 1, [BLACK, WHITE, EMPTY]), noCursor);
    const hasError = rec.ops.some(
      (o) => (o.op === "rect" || o.op === "line") && o.colour === COL_ERROR,
    );
    expect(hasError).toBe(false);
  });
});

describe("white dot", () => {
  it("draws a small grid-coloured dot for a white mark", () => {
    // A white (dotted) cell draws a centred dot rect in COL_GRID.
    const recWhite = renderState(makeState(3, 1, [WHITE, EMPTY, EMPTY]), noCursor);
    const recEmpty = renderState(makeState(3, 1, [EMPTY, EMPTY, EMPTY]), noCursor);
    const dots = (rec: RecordingDrawing) =>
      rec.ops.filter((o) => o.op === "rect" && o.colour === COL_GRID && o.w < 32)
        .length;
    expect(dots(recWhite)).toBeGreaterThan(dots(recEmpty));
  });
});

describe("render scenario snapshot", () => {
  it("draws a generated board with grid outline, clues and background", () => {
    const result = renderScenario({ game: rangeGame, id: "9x6#range-render" });
    const ops = result.recording.ops;
    // Background + grid lines + clue text are all present.
    expect(ops.some((o) => o.op === "rect")).toBe(true);
    expect(ops.some((o) => o.op === "line" && o.colour === COL_GRID)).toBe(true);
    expect(ops.some((o) => o.op === "text")).toBe(true);
    expect(result.recording.ops).toMatchSnapshot();
  });
});
