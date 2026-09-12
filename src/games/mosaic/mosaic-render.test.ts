// Tier-2 render-ops: drive Mosaic's `redraw` against the engine's shared
// `RecordingDrawing` — tile colors per mark state, clue text and its
// state-dependent color, cursor edge recolor, margin closing lines,
// the completion-flash inversion, the mistake outline, and the cache
// suppressing unchanged tiles.
import { describe, expect, it } from "vitest";
import { newCursor } from "../../engine/pointer.ts";
import { RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import { DEFAULT_BACKGROUND } from "../../engine/testing/render-scenario.ts";
import { mosaicGame } from "./index.ts";
import {
  COL_BLANK,
  COL_CURSOR,
  COL_ERROR,
  COL_GRID,
  COL_MARKED,
  COL_TEXT_SOLVED,
  COL_UNMARKED,
  type MosaicDrawState,
  newDrawState,
  redraw,
} from "./render.ts";
import { executeMove, type MosaicState, type MosaicUi, newState } from "./state.ts";

const PALETTE = mosaicGame.colors(DEFAULT_BACKGROUND);

/** A frame recorded through the shared recorder, which captures every
 * primitive — the local double this replaced dropped `drawPolygon` and
 * `drawCircle` on the floor and kept only a color from each `drawLine`. */
function recordingDrawing(): { dr: RecordingDrawing; ops: RecordingDrawing["ops"] } {
  const dr = new RecordingDrawing(PALETTE);
  return { dr, ops: dr.ops };
}

const TS = 32;
const P3 = { width: 3, height: 3, aggressive: true };
const ALL_BLACK_DESC = "464696464";

function freshUi(): MosaicUi {
  return { lastX: -1, lastY: -1, lastState: 0, cursor: newCursor() };
}

function freshDs(state: MosaicState): MosaicDrawState {
  const ds = newDrawState(state);
  ds.tilesize = TS;
  return ds;
}

describe("Mosaic redraw", () => {
  it("paints unmarked tiles and clue text on first draw", () => {
    const state = newState(P3, ALL_BLACK_DESC);
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, state, 1, freshUi(), 0, 0);

    // 9 full tiles in the unmarked teal.
    const tiles = ops.filter(
      (o) => o.op === "rect" && o.color === COL_UNMARKED && o.w === TS - 1,
    );
    expect(tiles.length).toBe(9);
    // Every clue drawn, dark text on unmarked.
    const texts = ops.filter((o) => o.op === "text");
    expect(texts.length).toBe(9);
    expect(texts.every((o) => o.color === COL_MARKED)).toBe(true);
    expect(texts.map((o) => o.text).join("")).toBe(ALL_BLACK_DESC);
    // Grid lines present.
    expect(ops.some((o) => o.op === "rect" && o.color === COL_GRID && o.h === 1)).toBe(
      true,
    );
  });

  it("draws the closing grid lines from the margin row/column", () => {
    const state = newState(P3, ALL_BLACK_DESC);
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, state, 1, freshUi(), 0, 0);
    const m = Math.floor(TS / 2);
    // The margin column (x=3) draws a vertical closing line at 3*ts+margin-1.
    expect(
      ops.some(
        (o) =>
          o.op === "rect" &&
          o.color === COL_GRID &&
          o.w === 1 &&
          o.x === 3 * TS + m - 1,
      ),
    ).toBe(true);
  });

  it("recolors marked and blank tiles, with solved/error text colors", () => {
    let state = newState(P3, "000000000");
    // Marking (1,1) contradicts every zero clue around it.
    state = executeMove(state, { type: "toggle", x: 1, y: 1, double: false });
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, state, 1, freshUi(), 0, 0);
    // The marked cell body.
    expect(
      ops.some((o) => o.op === "rect" && o.color === COL_MARKED && o.w === TS - 1),
    ).toBe(true);
    // Every clue is contradicted → red clue text appears.
    expect(ops.some((o) => o.op === "text" && o.color === COL_ERROR)).toBe(true);
  });

  it("grays out a solved clue's text", () => {
    let state = newState(P3, ALL_BLACK_DESC);
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        state = executeMove(state, { type: "toggle", x, y, double: false });
      }
    }
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, state, 1, freshUi(), 0, 0);
    const texts = ops.filter((o) => o.op === "text");
    expect(texts.length).toBe(9);
    expect(texts.every((o) => o.color === COL_TEXT_SOLVED)).toBe(true);
  });

  it("draws cursor edges in the cursor color", () => {
    const state = newState(P3, ALL_BLACK_DESC);
    const ds = freshDs(state);
    const ui = freshUi();
    ui.cursor.visible = true;
    ui.cursor.x = 1;
    ui.cursor.y = 1;
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, state, 1, ui, 0, 0);
    expect(
      ops.filter((o) => "color" in o && o.color === COL_CURSOR).length,
    ).toBeGreaterThanOrEqual(4);
  });

  it("inverts marked/blank during the flash thirds", () => {
    // The flash only fires on completion, when every cell is determined:
    // complete the all-black board, then flash.
    let state = newState(P3, ALL_BLACK_DESC);
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        state = executeMove(state, { type: "toggle", x, y, double: false });
      }
    }
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    // flashTime 0.1 ≤ FLASH_TIME/3 → inverted: every marked cell draws blank.
    redraw(dr, ds, null, state, 1, freshUi(), 0, 0.1);
    const bodies = (record: RecordingDrawing["ops"], color: number) =>
      record.filter((o) => o.op === "rect" && o.w === TS - 1 && o.color === color)
        .length;
    expect(bodies(ops, COL_BLANK)).toBe(9);
    expect(bodies(ops, COL_MARKED)).toBe(0);
    // Mid-flash (middle third) the board draws normally again.
    const second = recordingDrawing();
    redraw(second.dr, ds, null, state, 1, freshUi(), 0, 0.25);
    expect(bodies(second.ops, COL_MARKED)).toBe(9);
  });

  it("outlines mistake cells in the error color", () => {
    let state = newState(P3, ALL_BLACK_DESC);
    state = executeMove(state, { type: "toggle", x: 1, y: 0, double: true }); // blank = wrong
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, state, 1, freshUi(), 0, 0, undefined, [{ x: 1, y: 0 }]);
    const errorRects = ops.filter((o) => o.op === "rect" && o.color === COL_ERROR);
    expect(errorRects.length).toBe(4); // four outline strips
  });

  it("suppresses unchanged tiles via the cache", () => {
    const state = newState(P3, ALL_BLACK_DESC);
    const ds = freshDs(state);
    const first = recordingDrawing();
    redraw(first.dr, ds, null, state, 1, freshUi(), 0, 0);
    expect(first.ops.length).toBeGreaterThan(0);
    const second = recordingDrawing();
    redraw(second.dr, ds, null, state, 1, freshUi(), 0, 0);
    expect(second.ops.length).toBe(0);
    // One toggled cell redraws only its own tile (plus nothing else).
    const moved = executeMove(state, { type: "toggle", x: 0, y: 0, double: false });
    const third = recordingDrawing();
    redraw(third.dr, ds, null, moved, 1, freshUi(), 0, 0);
    const redrawn = third.ops.filter((o) => o.op === "rect" && o.w === TS - 1);
    expect(redrawn.length).toBe(1);
    expect(redrawn[0]).toMatchObject({ op: "rect", color: COL_MARKED });
  });
});
