// Tier-2 render test: drive Twiddle's `redraw` against a recording
// `GameDrawing` double and assert the structure of the draw calls — a
// first-draw background + recessed border + numbered tiles, a
// mid-rotation frame that draws the block's tiles at rotated coordinates
// (and settles them at animation end), and a completion-flash frame.
import { describe, expect, it } from "vitest";
import type { GameDrawing } from "../../engine/game.ts";
import { executeMove, twiddleGame } from "./index.ts";
import { animLength, COL_HIGHLIGHT, COL_LOWLIGHT } from "./render.ts";
import { newState, type TwiddleParams, type TwiddleState } from "./state.ts";

interface Op {
  op: string;
  colour?: number;
  outline?: number;
  x?: number;
  y?: number;
  text?: string;
}

function recordingDrawing(): { dr: GameDrawing; ops: Op[] } {
  const ops: Op[] = [];
  const dr = {
    startDraw: () => ops.push({ op: "startDraw" }),
    endDraw: () => ops.push({ op: "endDraw" }),
    drawUpdate: (r: { x: number; y: number; w: number; h: number }) =>
      ops.push({ op: "drawUpdate", x: r.x, y: r.y }),
    clip: () => ops.push({ op: "clip" }),
    unclip: () => ops.push({ op: "unclip" }),
    drawRect: (r: { x: number; y: number; w: number; h: number }, c: number) =>
      ops.push({ op: "drawRect", colour: c, x: r.x, y: r.y }),
    drawLine: (_a: unknown, _b: unknown, c: number) =>
      ops.push({ op: "drawLine", colour: c }),
    drawPolygon: (p: { x: number; y: number }[], f: number, o: number) =>
      ops.push({ op: "drawPolygon", colour: f, outline: o, x: p[0].x, y: p[0].y }),
    drawCircle: (_p: unknown, _r: number, f: number) =>
      ops.push({ op: "drawCircle", colour: f }),
    drawText: (p: { x: number; y: number }, _o: unknown, c: number, text: string) =>
      ops.push({ op: "drawText", colour: c, x: p.x, y: p.y, text }),
    blitterNew: () => ({}),
    blitterFree: () => {},
    blitterSave: () => {},
    blitterLoad: () => {},
  } as unknown as GameDrawing;
  return { dr, ops };
}

const newDrawState = twiddleGame.newDrawState as NonNullable<
  typeof twiddleGame.newDrawState
>;
const setTileSize = twiddleGame.setTileSize as NonNullable<
  typeof twiddleGame.setTileSize
>;
const redraw = twiddleGame.redraw as NonNullable<typeof twiddleGame.redraw>;

const TS = 48;

function params(): TwiddleParams {
  return { w: 3, h: 3, n: 2, rowsonly: false, orientable: false, movetarget: 0 };
}

const UI = { curX: 0, curY: 0, curVisible: false };

function fresh(state: TwiddleState) {
  const ds = newDrawState(state);
  setTileSize(ds, TS);
  return ds;
}

function solved3x3(): TwiddleState {
  return newState(params(), "1,2,3,4,5,6,7,8,9");
}

describe("Twiddle rendering", () => {
  it("first draw paints a background, the recessed border, and numbered tiles", () => {
    const state = solved3x3();
    const ds = fresh(state);
    const { dr, ops } = recordingDrawing();

    redraw(dr, ds, null, state, 0, UI, 0, 0);

    // Background rect at the origin.
    expect(ops.some((o) => o.op === "drawRect" && o.x === 0 && o.y === 0)).toBe(true);
    // The two recessed-border bevels (highlight then lowlight) before tiles.
    const firstPolys = ops.filter((o) => o.op === "drawPolygon").slice(0, 2);
    expect(firstPolys.map((o) => o.colour)).toEqual([COL_HIGHLIGHT, COL_LOWLIGHT]);
    // One number per cell.
    const numbers = ops.filter((o) => o.op === "drawText").map((o) => o.text);
    expect(numbers.length).toBe(9);
    expect(numbers).toContain("1");
    expect(numbers).toContain("9");
  });

  it("draws the rotated block's tiles off-grid mid-rotation and clips", () => {
    const prev = solved3x3();
    // Rotate block (0,0) clockwise: state.lastX/Y/R = 0,0,+1.
    const state = executeMove(prev, { type: "rotate", x: 0, y: 0, dir: 1 });
    const ds = fresh(state);
    // Prime the cache with a static draw.
    redraw(recordingDrawing().dr, ds, null, state, 0, UI, 0, 0);

    const { dr, ops } = recordingDrawing();
    const half = animLength(state.n) / 2;
    redraw(dr, ds, prev, state, 1, UI, half, 0);

    // Rotation clips the block region per tile.
    expect(ops.some((o) => o.op === "clip")).toBe(true);

    // "1" sits at cell (0,1) in the rotated state; its *static* centre is
    // coord(0)+ts/2 = 48, coord(1)+ts/2 = 96. Mid-rotation it is rotated
    // about the block centre, so it is drawn away from (48, 96).
    const moving = ops.find((o) => o.op === "drawText" && o.text === "1");
    expect(moving).toBeDefined();
    expect(moving?.x === 48 && moving?.y === 96).toBe(false);
  });

  it("settles the block tiles on their cells at animation end", () => {
    const prev = solved3x3();
    const state = executeMove(prev, { type: "rotate", x: 0, y: 0, dir: 1 });
    const ds = fresh(state);
    redraw(recordingDrawing().dr, ds, null, state, 0, UI, 0, 0);

    const { dr, ops } = recordingDrawing();
    // animTime == animMax → angle 0 → tiles back on their grid cells.
    redraw(dr, ds, prev, state, 1, UI, animLength(state.n), 0);
    const settled = ops.find((o) => o.op === "drawText" && o.text === "1");
    expect(settled?.x).toBe(48); // coord(0) + ts/2
    expect(settled?.y).toBe(96); // coord(1) + ts/2
  });

  it("flashes the background on a completion frame", () => {
    const state = solved3x3();
    const ds = fresh(state);
    redraw(recordingDrawing().dr, ds, null, state, 0, UI, 0, 0);

    const { dr, ops } = recordingDrawing();
    // flashTime within the first frame → COL_HIGHLIGHT background.
    redraw(dr, ds, null, state, 0, UI, 0, 0.05);
    // A tile centre is repainted with the flash background colour.
    expect(ops.some((o) => o.op === "drawRect" && o.colour === COL_HIGHLIGHT)).toBe(
      true,
    );
  });

  it("draws cursor-coloured edges around the cursor region", () => {
    const state = solved3x3();
    const ds = fresh(state);
    redraw(recordingDrawing().dr, ds, null, state, 0, UI, 0, 0);

    const { dr, ops } = recordingDrawing();
    // Cursor visible at origin (0,0): the region's edge bevels recolour
    // their *outline* to the cursor colours (COL_HIGHCURSOR=6 /
    // COL_LOWCURSOR=7).
    redraw(dr, ds, null, state, 0, { curX: 0, curY: 0, curVisible: true }, 0, 0);
    expect(
      ops.some((o) => o.op === "drawPolygon" && (o.outline === 6 || o.outline === 7)),
    ).toBe(true);
  });
});
