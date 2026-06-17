// Tier-2 render-ops: drive Unruly's `redraw` against a recording
// `GameDrawing` double — tile fill per colour, the 3-in-a-row error bars,
// the count `!`, the immutable-clue bevel, the cursor outline, the
// completion-flash highlight shift, and the cache suppressing unchanged tiles.
import { describe, expect, it } from "vitest";
import type { GameDrawing } from "../../engine/game.ts";
import {
  COL_0,
  COL_0_HIGHLIGHT,
  COL_1,
  COL_1_HIGHLIGHT,
  COL_CURSOR,
  COL_EMPTY,
  COL_ERROR,
  newDrawState,
  redraw,
  type UnrulyDrawState,
} from "./render.ts";
import {
  type Cell,
  encodeGrid,
  executeMove,
  newState,
  ONE,
  type UnrulyParams,
  type UnrulyState,
  type UnrulyUi,
  ZERO,
} from "./state.ts";

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
const P: UnrulyParams = { w2: 6, h2: 6, unique: false, diff: 0 };

function freshUi(): UnrulyUi {
  return { cx: 0, cy: 0, cursor: false };
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

/** A board with one immutable clue of the given colour at (0,0). */
function withClue(value: Cell): UnrulyState {
  const grid = new Uint8Array(P.w2 * P.h2);
  grid[0] = value;
  return newState(P, encodeGrid(grid, P.w2 * P.h2));
}

function place(state: UnrulyState, x: number, y: number, value: Cell): UnrulyState {
  return executeMove(state, { type: "place", x, y, value });
}

const body = (o: Op) => o.op === "drawRect" && o.w === TS - 1 && o.h === TS - 1;

describe("Unruly redraw", () => {
  it("fills empty tiles neutral on first draw, plus the outer grid frame", () => {
    const state = blank();
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, state, 1, freshUi(), 0, 0);
    // 36 empty tile bodies.
    expect(ops.filter((o) => body(o) && o.colour === COL_EMPTY).length).toBe(36);
    // The outer grid edge frame was drawn on first draw.
    expect(ops.some((o) => o.op === "drawRect" && o.colour === 1)).toBe(true);
  });

  it("fills one (black) and zero (white) tiles with their colours", () => {
    let state = blank();
    state = place(state, 1, 1, ONE);
    state = place(state, 2, 2, ZERO);
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, state, 1, freshUi(), 0, 0);
    expect(ops.some((o) => body(o) && o.colour === COL_1)).toBe(true);
    expect(ops.some((o) => body(o) && o.colour === COL_0)).toBe(true);
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
      ops.filter((o) => o.op === "drawRect" && o.colour === COL_ERROR).length,
    ).toBeGreaterThanOrEqual(4);
  });

  it("marks the count `!` when a row exceeds its colour target", () => {
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
      ops.some((o) => o.op === "drawText" && o.text === "!" && o.colour === COL_ERROR),
    ).toBe(true);
  });

  it("draws the immutable-clue bevel in highlight/lowlight", () => {
    const state = withClue(ONE);
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, state, 1, freshUi(), 0, 0);
    // COL_1 bevel uses val+1 (highlight) and val+2 (lowlight).
    expect(ops.some((o) => o.colour === COL_1_HIGHLIGHT)).toBe(true);
    expect(ops.some((o) => o.colour === COL_1 + 2)).toBe(true);
  });

  it("draws the cursor outline in the cursor colour", () => {
    const state = blank();
    const ds = freshDs(state);
    const ui = freshUi();
    ui.cursor = true;
    ui.cx = 2;
    ui.cy = 3;
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, state, 1, ui, 0, 0);
    expect(ops.filter((o) => o.colour === COL_CURSOR).length).toBeGreaterThanOrEqual(4);
  });

  it("shifts filled tiles to highlight during the flash", () => {
    let state = blank();
    state = place(state, 1, 1, ONE);
    state = place(state, 2, 2, ZERO);
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    // flashTime 0.3 → floor(0.3/0.12)=2 → FF_FLASH1 → +1 (highlight).
    redraw(dr, ds, null, state, 1, freshUi(), 0, 0.3);
    expect(ops.some((o) => body(o) && o.colour === COL_1_HIGHLIGHT)).toBe(true);
    expect(ops.some((o) => body(o) && o.colour === COL_0_HIGHLIGHT)).toBe(true);
  });

  it("outlines mistake cells in the error colour", () => {
    // A single placed cell (no live 3-in-a-row / count error), flagged as a
    // mistake → only the four inset outline strips are error-coloured.
    let state = blank();
    state = place(state, 2, 2, ZERO);
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, state, 1, freshUi(), 0, 0, undefined, [{ x: 2, y: 2 }]);
    const errorRects = ops.filter((o) => o.op === "drawRect" && o.colour === COL_ERROR);
    expect(errorRects.length).toBe(4);
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
    expect(third.ops.filter(body).length).toBe(1);
  });
});
