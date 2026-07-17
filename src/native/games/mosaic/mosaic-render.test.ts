// Tier-2 render-ops: drive Mosaic's `redraw` against a recording
// `GameDrawing` double — tile colours per mark state, clue text and its
// state-dependent colour, cursor edge recolour, margin closing lines,
// the completion-flash inversion, the mistake outline, and the cache
// suppressing unchanged tiles.
import { describe, expect, it } from "vitest";
import type { GameDrawing } from "../../engine/game.ts";
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

interface Op {
  op: string;
  colour?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  text?: string;
}

function recordingDrawing(): { dr: GameDrawing; ops: Op[] } {
  const ops: Op[] = [];
  const dr = {
    startDraw: () => {},
    endDraw: () => {},
    drawUpdate: () => {},
    clip: () => {},
    unclip: () => {},
    drawRect: (r: { x: number; y: number; w: number; h: number }, c: number) =>
      ops.push({ op: "drawRect", colour: c, x: r.x, y: r.y, w: r.w, h: r.h }),
    drawLine: (_a: unknown, _b: unknown, c: number) =>
      ops.push({ op: "drawLine", colour: c }),
    drawPolygon: () => {},
    drawCircle: () => {},
    drawText: (_p: unknown, _o: unknown, c: number, text: string) =>
      ops.push({ op: "drawText", colour: c, text }),
    blitterNew: () => ({}),
    blitterFree: () => {},
    blitterSave: () => {},
    blitterLoad: () => {},
  } as unknown as GameDrawing;
  return { dr, ops };
}

const TS = 32;
const P3 = { width: 3, height: 3, aggressive: true };
const ALL_BLACK_DESC = "464696464";

function freshUi(): MosaicUi {
  return { lastX: -1, lastY: -1, lastState: 0, curX: 0, curY: 0, cursorVisible: false };
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
      (o) => o.op === "drawRect" && o.colour === COL_UNMARKED && o.w === TS - 1,
    );
    expect(tiles.length).toBe(9);
    // Every clue drawn, dark text on unmarked.
    const texts = ops.filter((o) => o.op === "drawText");
    expect(texts.length).toBe(9);
    expect(texts.every((o) => o.colour === COL_MARKED)).toBe(true);
    expect(texts.map((o) => o.text).join("")).toBe(ALL_BLACK_DESC);
    // Grid lines present.
    expect(
      ops.some((o) => o.op === "drawRect" && o.colour === COL_GRID && o.h === 1),
    ).toBe(true);
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
          o.op === "drawRect" &&
          o.colour === COL_GRID &&
          o.w === 1 &&
          o.x === 3 * TS + m - 1,
      ),
    ).toBe(true);
  });

  it("recolours marked and blank tiles, with solved/error text colours", () => {
    let state = newState(P3, "000000000");
    // Blank (0,0) → its clue gets closer to solved; mark (1,1) → errors.
    state = executeMove(state, { type: "toggle", x: 1, y: 1, double: false });
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, state, 1, freshUi(), 0, 0);
    // The marked cell body.
    expect(
      ops.some((o) => o.op === "drawRect" && o.colour === COL_MARKED && o.w === TS - 1),
    ).toBe(true);
    // Every clue is contradicted → red clue text appears.
    expect(ops.some((o) => o.op === "drawText" && o.colour === COL_ERROR)).toBe(true);
  });

  it("greys out a solved clue's text", () => {
    let state = newState(P3, ALL_BLACK_DESC);
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        state = executeMove(state, { type: "toggle", x, y, double: false });
      }
    }
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, state, 1, freshUi(), 0, 0);
    const texts = ops.filter((o) => o.op === "drawText");
    expect(texts.length).toBe(9);
    expect(texts.every((o) => o.colour === COL_TEXT_SOLVED)).toBe(true);
  });

  it("draws cursor edges in the cursor colour", () => {
    const state = newState(P3, ALL_BLACK_DESC);
    const ds = freshDs(state);
    const ui = freshUi();
    ui.cursorVisible = true;
    ui.curX = 1;
    ui.curY = 1;
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, state, 1, ui, 0, 0);
    expect(ops.filter((o) => o.colour === COL_CURSOR).length).toBeGreaterThanOrEqual(4);
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
    const body = (o: Op) => o.op === "drawRect" && o.w === TS - 1;
    expect(ops.filter((o) => body(o) && o.colour === COL_BLANK).length).toBe(9);
    expect(ops.filter((o) => body(o) && o.colour === COL_MARKED).length).toBe(0);
    // Mid-flash (middle third) the board draws normally again.
    const second = recordingDrawing();
    redraw(second.dr, ds, null, state, 1, freshUi(), 0, 0.25);
    expect(second.ops.filter((o) => body(o) && o.colour === COL_MARKED).length).toBe(9);
  });

  it("outlines mistake cells in the error colour", () => {
    let state = newState(P3, ALL_BLACK_DESC);
    state = executeMove(state, { type: "toggle", x: 1, y: 0, double: true }); // blank = wrong
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, state, 1, freshUi(), 0, 0, undefined, [{ x: 1, y: 0 }]);
    const errorRects = ops.filter((o) => o.op === "drawRect" && o.colour === COL_ERROR);
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
    const bodies = third.ops.filter((o) => o.op === "drawRect" && o.w === TS - 1);
    expect(bodies.length).toBe(1);
    expect(bodies[0].colour).toBe(COL_MARKED);
  });
});
