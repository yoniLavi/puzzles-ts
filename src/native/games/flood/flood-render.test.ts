// Tier-2 render test: drive Flood's `redraw` against a recording
// `GameDrawing` double and assert the draw-call structure — play-colour
// tiles, separator borders between differing-colour cells, the cursor
// outline, the hint SOLNNEXT circle, and victory/defeat flash overlays.
import { describe, expect, it } from "vitest";
import type { GameDrawing, HintStep } from "../../engine/game.ts";
import { floodGame } from "./index.ts";
import { type FloodDrawState, redraw } from "./render.ts";
import { type FloodMove, type FloodState, newState } from "./state.ts";

interface Op {
  op: string;
  colour?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  r?: number;
}

function recordingDrawing(): { dr: GameDrawing; ops: Op[] } {
  const ops: Op[] = [];
  const dr = {
    startDraw: () => ops.push({ op: "startDraw" }),
    endDraw: () => ops.push({ op: "endDraw" }),
    drawUpdate: () => ops.push({ op: "drawUpdate" }),
    clip: () => ops.push({ op: "clip" }),
    unclip: () => ops.push({ op: "unclip" }),
    drawRect: (r: { x: number; y: number; w: number; h: number }, c: number) =>
      ops.push({ op: "drawRect", colour: c, x: r.x, y: r.y, w: r.w, h: r.h }),
    drawLine: (_a: unknown, _b: unknown, c: number) =>
      ops.push({ op: "drawLine", colour: c }),
    drawPolygon: (p: { x: number; y: number }[], f: number) =>
      ops.push({ op: "drawPolygon", colour: f, x: p[0].x, y: p[0].y }),
    drawCircle: (_p: unknown, r: number, f: number) =>
      ops.push({ op: "drawCircle", colour: f, r }),
    drawText: () => ops.push({ op: "drawText" }),
    blitterNew: () => ({}),
    blitterFree: () => {},
    blitterSave: () => {},
    blitterLoad: () => {},
  } as unknown as GameDrawing;
  return { dr, ops };
}

const TS = 32; // sepWidth = 1, cursorInset = 4, both > 0.
const UI = { cursorVisible: false, cx: 0, cy: 0 };

function freshDs(state: FloodState): FloodDrawState {
  const ds = floodGame.newDrawState?.(state) as FloodDrawState;
  floodGame.setTileSize?.(ds, TS);
  return ds;
}

describe("Flood redraw", () => {
  it("paints play-colour tiles and a recessed bevel on first draw", () => {
    const state = newState({ w: 2, h: 2, colours: 3, leniency: 0 }, "0112,9");
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, state, 1, UI, 0, 0);

    // Two recessed-bevel polygons (highlight + lowlight).
    expect(ops.filter((o) => o.op === "drawPolygon").length).toBe(2);
    // A full-tile rect in a play colour (COL_1 = palette index 2) for the
    // corner cell (colour 0).
    expect(ops.some((o) => o.op === "drawRect" && o.colour === 2 && o.w === TS)).toBe(
      true,
    );
  });

  it("draws separator borders (COL_SEPARATOR) between differing cells", () => {
    const state = newState({ w: 2, h: 1, colours: 3, leniency: 0 }, "01,9");
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, state, 1, UI, 0, 0);
    // A thin (w = sepWidth = 1) separator-colour rect appears.
    expect(ops.some((o) => o.op === "drawRect" && o.colour === 1 && o.w === 1)).toBe(
      true,
    );
  });

  it("draws the cursor outline when the cursor is visible", () => {
    const state = newState({ w: 2, h: 2, colours: 3, leniency: 0 }, "0112,9");
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, state, 1, { cursorVisible: true, cx: 0, cy: 0 }, 0, 0);
    // The cursor outline is four separator-colour lines.
    expect(ops.filter((o) => o.op === "drawLine" && o.colour === 1).length).toBe(4);
  });

  it("draws the hint SOLNNEXT circle on the next-fill squares", () => {
    const state = newState({ w: 3, h: 1, colours: 3, leniency: 0 }, "010,9");
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    const hint: HintStep<FloodMove> = {
      move: { type: "fill", colour: 1 },
      explanation: "Fill with yellow",
    };
    redraw(dr, ds, null, state, 1, UI, 0, 0, hint);
    expect(ops.some((o) => o.op === "drawCircle" && o.colour === 1)).toBe(true);
  });

  it("superimposes the victory rainbow when a completed board flashes", () => {
    // A solved single-colour board; the rainbow recolours cells near the
    // corner, so multiple distinct play colours are drawn.
    const base = newState(
      { w: 5, h: 5, colours: 6, leniency: 0 },
      `${"0".repeat(25)},9`,
    );
    const state: FloodState = { ...base, complete: true, moves: 3 };
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    // flashTime / VICTORY_FLASH_FRAME(0.03) ≈ 4 → cells within manhattan
    // distance 4 of the corner get colours 0..4.
    redraw(dr, ds, null, state, 1, UI, 0, 0.12);
    const playColours = new Set(
      ops.filter((o) => o.op === "drawRect" && o.w === TS).map((o) => o.colour),
    );
    expect(playColours.size).toBeGreaterThan(1);
  });

  it("blinks the board to the separator colour on a defeat flash", () => {
    const base = newState({ w: 3, h: 3, colours: 3, leniency: 0 }, "012120201,1");
    // Lost: moves at the limit, not complete.
    const state: FloodState = { ...base, moves: 1 };
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();
    // flashTime / DEFEAT_FLASH_FRAME(0.1) = 0 (≠ 1) → BADFLASH → every
    // tile painted in the separator colour at full size.
    redraw(dr, ds, null, state, 1, UI, 0, 0.05);
    expect(ops.some((o) => o.op === "drawRect" && o.colour === 1 && o.w === TS)).toBe(
      true,
    );
  });
});
