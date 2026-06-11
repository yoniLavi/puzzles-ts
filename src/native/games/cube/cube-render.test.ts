// Tier-2 render test (see the `repo-layout` spec): drive Cube's `redraw`
// against a recording `GameDrawing` double and assert the structure of
// the draw calls — a background fill, one polygon per grid square (blue
// squares in COL_BLUE), the projected solid's faces, and a final update.
import { describe, expect, it } from "vitest";
import type { GameDrawing } from "../../engine/game.ts";
import { gridArea } from "./grid.ts";
import { cubeGame, executeMove } from "./index.ts";
import { COL_BACKGROUND, COL_BLUE } from "./render.ts";
import { SOLIDS, SolidType } from "./solids.ts";
import { type CubeParams, newState } from "./state.ts";

interface Op {
  op: string;
  colour?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

function recordingDrawing(): { dr: GameDrawing; ops: Op[] } {
  const ops: Op[] = [];
  const dr = {
    startDraw: () => ops.push({ op: "startDraw" }),
    endDraw: () => ops.push({ op: "endDraw" }),
    drawUpdate: (r: { x: number; y: number; w: number; h: number }) =>
      ops.push({ op: "drawUpdate", x: r.x, y: r.y, w: r.w, h: r.h }),
    clip: () => ops.push({ op: "clip" }),
    unclip: () => ops.push({ op: "unclip" }),
    drawRect: (r: { x: number; y: number; w: number; h: number }, c: number) =>
      ops.push({ op: "drawRect", colour: c, x: r.x, y: r.y, w: r.w, h: r.h }),
    drawLine: (_a: unknown, _b: unknown, c: number) =>
      ops.push({ op: "drawLine", colour: c }),
    drawPolygon: (_p: unknown, f: number) => ops.push({ op: "drawPolygon", colour: f }),
    drawCircle: (_p: unknown, _r: number, f: number) =>
      ops.push({ op: "drawCircle", colour: f }),
    drawText: (_p: unknown, _o: unknown, c: number) =>
      ops.push({ op: "drawText", colour: c }),
    blitterNew: () => ({}),
    blitterFree: () => {},
    blitterSave: () => {},
    blitterLoad: () => {},
  } as unknown as GameDrawing;
  return { dr, ops };
}

const newDrawState = cubeGame.newDrawState as NonNullable<typeof cubeGame.newDrawState>;
const setTileSize = cubeGame.setTileSize as NonNullable<typeof cubeGame.setTileSize>;
const redraw = cubeGame.redraw as NonNullable<typeof cubeGame.redraw>;

/** A cube board with square 0 painted blue and the solid starting on a
 * non-blue square, sized at the preferred tile size. */
function freshCube() {
  const p: CubeParams = { solid: SolidType.Cube, d1: 4, d2: 4 };
  const area = gridArea(p.d1, p.d2, SOLIDS[p.solid].order);
  // Square 0 blue (top nibble bit 0x8), start on square 5.
  const desc = `8${"0".repeat(Math.floor((area + 3) / 4) - 1)},5`;
  const state = newState(p, desc);
  const ds = newDrawState(state);
  setTileSize(ds, cubeGame.preferredTileSize ?? 48);
  return { p, state, ds };
}

describe("Cube rendering", () => {
  it("paints a background fill, every grid square, the solid, and an update", () => {
    const { state, ds } = freshCube();
    const { dr, ops } = recordingDrawing();

    redraw(dr, ds, null, state, 0, {}, 0, 0);

    // A background rect at the origin.
    expect(
      ops.some(
        (o) =>
          o.op === "drawRect" && o.x === 0 && o.y === 0 && o.colour === COL_BACKGROUND,
      ),
    ).toBe(true);

    // One polygon per grid square is drawn before the solid's faces; the
    // total polygon count exceeds the square count by the visible faces.
    const polys = ops.filter((o) => o.op === "drawPolygon");
    expect(polys.length).toBeGreaterThan(state.grid.length);

    // The first `grid.length` polygons are the grid squares; square 0 is
    // blue, so at least one square polygon uses COL_BLUE.
    const squarePolys = polys.slice(0, state.grid.length);
    expect(squarePolys.some((o) => o.colour === COL_BLUE)).toBe(true);

    // A final drawUpdate covering the canvas.
    expect(ops.some((o) => o.op === "drawUpdate")).toBe(true);
  });

  it("draws fewer faces than the solid has (back-face culling)", () => {
    const { state, ds } = freshCube();
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, state, 0, {}, 0, 0);

    const polys = ops.filter((o) => o.op === "drawPolygon");
    const facePolys = polys.length - state.grid.length;
    // A cube shows at most 3 faces at once; culling must drop the rest.
    expect(facePolys).toBeGreaterThan(0);
    expect(facePolys).toBeLessThan(SOLIDS[SolidType.Cube].nfaces);
  });

  it("animates a roll without throwing and still draws the solid", () => {
    const { state, ds } = freshCube();
    const rolled = executeMove(state, { dir: "R" });
    const { dr, ops } = recordingDrawing();

    // Mid-roll: prev = old state, animTime between 0 and ROLLTIME.
    redraw(dr, ds, state, rolled, 0, {}, 0.06, 0);

    const polys = ops.filter((o) => o.op === "drawPolygon");
    expect(polys.length).toBeGreaterThan(state.grid.length);
  });
});
