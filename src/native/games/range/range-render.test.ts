// Tier-2 / tier-2.5 render tests for Range: a direct `redraw` against
// the shared recording double for the live error highlight and the
// white dot, plus a `renderScenario` snapshot of a generated board
// (grid outline, clue text, background) so a render regression is a
// reviewable text diff.
import { describe, expect, it } from "vitest";
import type { HintStep } from "../../engine/game.ts";
import { RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { type RangeHint, rangeGame } from "./index.ts";
import {
  COL_ERROR,
  COL_GRID,
  COL_HINT,
  COL_HINT_BLACKREF,
  COL_HINT_CELL,
  colours,
  newDrawState,
  redraw,
  setTileSize,
} from "./render.ts";
import {
  BLACK,
  EMPTY,
  type RangeMove,
  type RangeState,
  type RangeUi,
  WHITE,
} from "./state.ts";

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

describe("hint colour legend", () => {
  it("rings a cited black premise in COL_HINT_BLACKREF, distinct from the COL_HINT target", () => {
    // The adjacency deduction shape: a black square (the premise) at the centre
    // forces a neighbour white (the target). The element-type legend must draw
    // the cited black square and the forced cell in *different* colours.
    const grid = [EMPTY, EMPTY, EMPTY, EMPTY, BLACK, EMPTY, EMPTY, EMPTY, EMPTY];
    const state = makeState(3, 3, grid);
    const step: HintStep<RangeMove, RangeHint> = {
      move: { sets: [{ r: 0, c: 1, value: "white" }] },
      explanation: "adjacency",
      highlights: {
        target: { r: 0, c: 1, value: "white" },
        area: [],
        blackRefs: [{ r: 1, c: 1 }],
      },
    };
    const rec = new RecordingDrawing(palette);
    const ds = newDrawState(state);
    setTileSize(ds, 32);
    redraw(rec, ds, null, state, 1, noCursor, 0, 0, step);
    // The cited black square rings COL_HINT_BLACKREF (an outline — `line` ops,
    // not a body fill).
    expect(
      rec.ops.some((o) => o.op === "line" && o.colour === COL_HINT_BLACKREF),
    ).toBe(true);
    // The forced cell fills COL_HINT (a `rect` body) — a different colour from
    // the premise ring.
    expect(rec.ops.some((o) => o.op === "rect" && o.colour === COL_HINT)).toBe(true);
    // The premise ring is NOT drawn in the target's COL_HINT.
    expect(
      rec.ops.some((o) => o.op === "line" && o.colour === COL_HINT),
    ).toBe(false);
  });
});

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

  it("draws the hint target and premise highlight on the first hint step", () => {
    const result = renderScenario({
      game: rangeGame,
      id: "9x6#range-render",
      showHint: true,
    });
    expect(result.hint).toBeDefined();
    const ops = result.recording.ops;
    // The hint target cell is filled COL_HINT; premise cells COL_HINT_CELL.
    expect(ops.some((o) => o.op === "rect" && o.colour === COL_HINT)).toBe(true);
    expect(ops.some((o) => o.op === "rect" && o.colour === COL_HINT_CELL)).toBe(true);
    // Clues are still drawn.
    expect(ops.some((o) => o.op === "text")).toBe(true);
    expect(result.recording.ops).toMatchSnapshot();
  });
});
