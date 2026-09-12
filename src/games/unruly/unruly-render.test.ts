// Tier-2 render-ops: drive Unruly's `redraw` against a recording
// `GameDrawing` double — tile fill per color, the 3-in-a-row error bars,
// the count `!`, the immutable-clue bevel, the cursor outline, the
// completion-flash highlight shift, and the cache suppressing unchanged tiles.
import { describe, expect, it } from "vitest";
import type { HintStep } from "../../engine/game.ts";
import { newCursor } from "../../engine/pointer.ts";
import { opsOfKind, RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import { DEFAULT_BACKGROUND } from "../../engine/testing/render-scenario.ts";
import { type Cell, ONE, ZERO } from "./constants.ts";
import type { UnrulyHint } from "./index.ts";
import { unrulyGame } from "./index.ts";
import {
  COL_0,
  COL_0_HIGHLIGHT,
  COL_1,
  COL_1_HIGHLIGHT,
  COL_CURSOR,
  COL_EMPTY,
  COL_ERROR,
  COL_HINT,
  COL_HINT_CELL,
  COL_HINT_REF,
  newDrawState,
  PLACE_ANIM_TIME,
  redraw,
  type UnrulyDrawState,
} from "./render.ts";
import {
  encodeGrid,
  executeMove,
  newState,
  type UnrulyMove,
  type UnrulyParams,
  type UnrulyState,
  type UnrulyUi,
} from "./state.ts";

const PALETTE = unrulyGame.colors(DEFAULT_BACKGROUND);

function recordingDrawing(): { dr: RecordingDrawing; ops: RecordingDrawing["ops"] } {
  const dr = new RecordingDrawing(PALETTE);
  return { dr, ops: dr.ops };
}

const TS = 32;
const P: UnrulyParams = { w2: 6, h2: 6, unique: false, diff: 0 };

function freshUi(): UnrulyUi {
  return { cursor: newCursor() };
}

function freshDs(state: UnrulyState): UnrulyDrawState {
  const ds = newDrawState(state);
  ds.tilesize = TS;
  return ds;
}

/** A blank (no-clue) board of P's size. */
function blank(): UnrulyState {
  const desc = encodeGrid(new Uint8Array(P.w2 * P.h2), P.w2 * P.h2);
  return newState(P, desc);
}

/** A board with one immutable clue of the given color at (0,0). */
function withClue(value: Cell): UnrulyState {
  const grid = new Uint8Array(P.w2 * P.h2);
  grid[0] = value;
  return newState(P, encodeGrid(grid, P.w2 * P.h2));
}

function place(state: UnrulyState, x: number, y: number, value: Cell): UnrulyState {
  return executeMove(state, { type: "place", x, y, value });
}

/** The tile bodies of a frame: full-size rects, narrowed so their color reads. */
const bodies = (ops: RecordingDrawing["ops"]) =>
  opsOfKind(ops, "rect").filter((o) => o.w === TS - 1 && o.h === TS - 1);

describe("Unruly redraw", () => {
  it("fills empty tiles neutral on first draw, plus the outer grid frame", () => {
    const state = blank();
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, state, 1, freshUi(), 0, 0);
    // 36 empty tile bodies.
    expect(bodies(ops).filter((o) => o.color === COL_EMPTY).length).toBe(36);
    // The outer grid edge frame was drawn on first draw.
    expect(ops.some((o) => o.op === "rect" && o.color === 1)).toBe(true);
  });

  it("fills one (black) and zero (white) tiles with their colors", () => {
    let state = blank();
    state = place(state, 1, 1, ONE);
    state = place(state, 2, 2, ZERO);
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, state, 1, freshUi(), 0, 0);
    expect(bodies(ops).some((o) => o.color === COL_1)).toBe(true);
    expect(bodies(ops).some((o) => o.color === COL_0)).toBe(true);
  });

  it("draws error bars across a three-in-a-row", () => {
    let state = blank();
    state = place(state, 0, 0, ONE);
    state = place(state, 1, 0, ONE);
    state = place(state, 2, 0, ONE);
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, state, 1, freshUi(), 0, 0);
    // The error rectangle helper emits 4 strips per affected tile.
    expect(
      ops.filter((o) => o.op === "rect" && o.color === COL_ERROR).length,
    ).toBeGreaterThanOrEqual(4);
  });

  it("marks the count `!` when a row exceeds its color target", () => {
    // 4 ones in a 6-wide row (target 3) → the row's ones count is exceeded.
    let state = blank();
    state = place(state, 0, 0, ONE);
    state = place(state, 2, 0, ONE);
    state = place(state, 4, 0, ONE);
    state = place(state, 5, 0, ONE);
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, state, 1, freshUi(), 0, 0);
    expect(
      ops.some((o) => o.op === "text" && o.text === "!" && o.color === COL_ERROR),
    ).toBe(true);
  });

  it("draws the immutable-clue bevel in highlight/lowlight", () => {
    const state = withClue(ONE);
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, state, 1, freshUi(), 0, 0);
    // COL_1 bevel uses val+1 (highlight) and val+2 (lowlight).
    expect(ops.some((o) => "color" in o && o.color === COL_1_HIGHLIGHT)).toBe(true);
    expect(ops.some((o) => "color" in o && o.color === COL_1 + 2)).toBe(true);
  });

  it("draws the cursor outline in the cursor color", () => {
    const state = blank();
    const ds = freshDs(state);
    const ui = freshUi();
    ui.cursor.visible = true;
    ui.cursor.x = 2;
    ui.cursor.y = 3;
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, state, 1, ui, 0, 0);
    expect(
      ops.filter((o) => "color" in o && o.color === COL_CURSOR).length,
    ).toBeGreaterThanOrEqual(4);
  });

  it("shifts filled tiles to highlight during the flash", () => {
    let state = blank();
    state = place(state, 1, 1, ONE);
    state = place(state, 2, 2, ZERO);
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    // flashTime 0.3 → floor(0.3/0.12)=2 → FF_FLASH1 → +1 (highlight).
    redraw(dr, ds, null, state, 1, freshUi(), 0, 0.3);
    expect(bodies(ops).some((o) => o.color === COL_1_HIGHLIGHT)).toBe(true);
    expect(bodies(ops).some((o) => o.color === COL_0_HIGHLIGHT)).toBe(true);
  });

  it("outlines mistake cells in the error color", () => {
    // A single placed cell (no live 3-in-a-row / count error), flagged as a
    // mistake → only the four inset outline strips are error-colored.
    let state = blank();
    state = place(state, 2, 2, ZERO);
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, state, 1, freshUi(), 0, 0, undefined, [{ x: 2, y: 2 }]);
    const errorRects = ops.filter((o) => o.op === "rect" && o.color === COL_ERROR);
    expect(errorRects.length).toBe(4);
  });

  it("grows the new color from the center during a placement animation", () => {
    const prev = blank();
    const state = place(prev, 0, 0, ONE);
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    // Mid-animation: the previous color beneath, the new color as a smaller
    // centered square (w < TS-1).
    redraw(dr, ds, prev, state, 1, freshUi(), PLACE_ANIM_TIME / 2, 0);
    // The from-color (EMPTY) is painted full-tile beneath at the cell.
    expect(bodies(ops).some((o) => o.color === COL_EMPTY)).toBe(true);
    // The new color appears as a partial (growing) square, not a full body.
    const grow = ops.filter(
      (o) =>
        o.op === "rect" && o.color === COL_1 && (o.w ?? 0) > 0 && (o.w ?? 0) < TS - 1,
    );
    expect(grow.length).toBe(1);
  });

  it("settles to the plain new color once the animation ends (prev null)", () => {
    const prev = blank();
    const state = place(prev, 0, 0, ONE);
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, state, 1, freshUi(), 0, 0);
    expect(bodies(ops).some((o) => o.color === COL_1)).toBe(true);
    // No partial growing square remains.
    expect(
      ops.some(
        (o) =>
          o.op === "rect" && o.color === COL_1 && (o.w ?? 0) < TS - 1 && (o.w ?? 0) > 0,
      ),
    ).toBe(false);
  });

  it("renders a displayed hint: target ring, sibling shade, premise ring", () => {
    // A black clue at (0,0) (a ring premise), an empty target at (2,0) forced
    // black, and an empty sibling at (4,0).
    const state = withClue(ONE);
    const ds = freshDs(state);
    const target = { x: 2, y: 0, value: ONE as Cell };
    const hint: HintStep<UnrulyMove, UnrulyHint> = {
      move: { type: "place", x: 2, y: 0, value: ONE },
      explanation: "test",
      highlights: { target, area: [4], ring: [0] },
    };
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, state, 1, freshUi(), 0, 0, hint);
    // Target cell: a COL_HINT **ring**, and no COL_HINT body. A fill in a game
    // whose move is "make this cell black or white" reads as a third color
    // already placed, so the cell keeps its own color under the mark.
    expect(
      opsOfKind(ops, "rect").filter(
        (o) => o.color === COL_HINT && !(o.w === TS - 1 && o.h === TS - 1),
      ).length,
    ).toBe(4);
    expect(bodies(ops).some((o) => o.color === COL_HINT)).toBe(false);
    // Sibling area cell: a full COL_HINT_CELL body. This one *stays* a fill —
    // the siblings are still-empty cells, so the wash covers nothing.
    expect(bodies(ops).some((o) => o.color === COL_HINT_CELL)).toBe(true);
    // Premise ring: COL_HINT_REF outline strips around the cited clue — a
    // distinct color from the COL_HINT move, so premise and move don't read
    // as the same element type (the element-type color legend).
    expect(
      opsOfKind(ops, "rect").filter(
        (o) => o.color === COL_HINT_REF && !(o.w === TS - 1 && o.h === TS - 1),
      ).length,
    ).toBeGreaterThanOrEqual(4);
  });

  it("suppresses unchanged tiles via the cache", () => {
    const state = blank();
    const ds = freshDs(state);
    const first = recordingDrawing();
    redraw(first.dr, ds, null, state, 1, freshUi(), 0, 0);
    expect(first.ops.length).toBeGreaterThan(0);
    const second = recordingDrawing();
    redraw(second.dr, ds, null, state, 1, freshUi(), 0, 0);
    expect(second.ops.length).toBe(0);
    // One placed cell redraws only its own tile body.
    const moved = place(state, 0, 0, ONE);
    const third = recordingDrawing();
    redraw(third.dr, ds, null, moved, 1, freshUi(), 0, 0);
    expect(bodies(third.ops).length).toBe(1);
  });
});
