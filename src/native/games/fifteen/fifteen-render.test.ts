// Tier-2 render test: drive Fifteen's `redraw` against a recording
// `GameDrawing` double and assert the structure of the draw calls — a
// first-draw background fill + recessed border, one numbered bevelled
// tile per non-gap cell, and a mid-slide animation frame that draws a
// moving tile at an interpolated coordinate.
import { describe, expect, it } from "vitest";
import type { GameDrawing } from "../../engine/game.ts";
import { randomNew } from "../../random/index.ts";
import { executeMove, fifteenGame } from "./index.ts";
import { type FifteenState, newState } from "./state.ts";

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
    drawPolygon: (p: { x: number; y: number }[], f: number) =>
      ops.push({ op: "drawPolygon", colour: f, x: p[0].x, y: p[0].y }),
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

const newDrawState = fifteenGame.newDrawState as NonNullable<
  typeof fifteenGame.newDrawState
>;
const setTileSize = fifteenGame.setTileSize as NonNullable<
  typeof fifteenGame.setTileSize
>;
const redraw = fifteenGame.redraw as NonNullable<typeof fifteenGame.redraw>;

const TS = 48;
const UI = { invertCursor: false };

function solved(w: number, h: number): FifteenState {
  const n = w * h;
  const vals: number[] = [];
  for (let i = 0; i < n; i++) vals.push((i + 1) % n);
  return newState({ w, h }, vals.join(","));
}

function freshDs(state: FifteenState) {
  const ds = newDrawState(state);
  setTileSize(ds, TS);
  return ds;
}

describe("Fifteen rendering", () => {
  it("first draw paints a background, the recessed border, and numbered tiles", () => {
    const state = solved(4, 4);
    const ds = freshDs(state);
    const { dr, ops } = recordingDrawing();

    redraw(dr, ds, null, state, 0, UI, 0, 0);

    // A background rect at the origin covering the whole canvas.
    expect(ops.some((o) => o.op === "drawRect" && o.x === 0 && o.y === 0)).toBe(true);
    // The two recessed-border bevels are drawn (highlight=2, lowlight=3)
    // before any tiles.
    const firstPolys = ops.filter((o) => o.op === "drawPolygon").slice(0, 2);
    expect(firstPolys.map((o) => o.colour)).toEqual([2, 3]);
    // One number per non-gap cell (15 of 16).
    const numbers = ops.filter((o) => o.op === "drawText").map((o) => o.text);
    expect(numbers.length).toBe(15);
    expect(numbers).toContain("1");
    expect(numbers).toContain("15");
  });

  it("draws a moving tile at an interpolated coordinate mid-slide", () => {
    const prev = solved(4, 4); // gap at (3,3), tile 15 at (2,3)
    const state = executeMove(prev, { type: "move", x: 2, y: 3 }); // tile 15 → (3,3)
    const ds = freshDs(state);
    // Settle the cache with a static draw of the new state first…
    redraw(dr0(ds, state), ds, null, state, 0, UI, 0, 0);

    // …then redraw mid-animation from prev → state at half the anim time.
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, prev, state, 1, UI, 0.13 / 2, 0);

    // Tile "15" is drawn at an x between its old column (2) and home
    // column (3): its settled centre is coord(3)+ts/2 = 192; mid-slide it
    // sits to the left of that.
    const moving = ops.find((o) => o.op === "drawText" && o.text === "15");
    expect(moving).toBeDefined();
    expect(moving?.x).toBeLessThan(192);
    expect(moving?.x).toBeGreaterThan(120); // right of column 2's left edge
  });

  it("flashes the background on a genuine completion frame", () => {
    const state = solved(4, 4);
    const ds = freshDs(state);
    // Prime the cache.
    redraw(dr0(ds, state), ds, null, state, 0, UI, 0, 0);
    const { dr, ops } = recordingDrawing();
    // flashTime within the first frame → COL_HIGHLIGHT (2) background.
    redraw(dr, ds, null, state, 0, UI, 0, 0.05);
    // The gap cell is repainted with the flash background colour.
    expect(ops.some((o) => o.op === "drawRect" && o.colour === 2)).toBe(true);
  });
});

// A throwaway recording drawing used only to prime the cache.
function dr0(_ds: unknown, _state: unknown): GameDrawing {
  return recordingDrawing().dr;
}

describe("the hint mark while the hinted slide animates", () => {
  // Netslide's owner-reported defect class (edadec1): a hint mark on a
  // *moving tile* must ride the slide — the midend advances the plan only at
  // animation end, so while the hinted move animates the displayed step
  // still describes the board the move left behind. Fifteen holds this by
  // construction: the mark is keyed by tile *number* and painted as the
  // tile's own background in the interpolated animation pass. This test pins
  // that down at an actual mid-slide frame.
  it("rides the moving tile, and nothing marks the cell it set off from", () => {
    const params = { w: 4, h: 4 };
    for (let i = 0; i < 20; i++) {
      const rng = randomNew(`hint-anim-${i}`);
      const { desc } = fifteenGame.newDesc(params, rng);
      const state = newState(params, desc);
      const res = fifteenGame.hint?.(state);
      if (!res?.ok) continue;
      const step = res.steps[0];
      const tile = (step.highlights as { tile: number }).tile;
      const after = executeMove(state, step.move);
      const from = state.tiles.indexOf(tile);
      const to = after.tiles.indexOf(tile);

      const ds = freshDs(state);
      // Warm the cache with the still pre-move frame, hint displayed.
      redraw(dr0(ds, state), ds, null, state, 0, UI, 0, 0, step);

      // Halfway through the slide into the gap.
      const anim = fifteenGame.animLength?.(state, after, 1, UI) ?? 0;
      const { dr, ops } = recordingDrawing();
      redraw(dr, ds, state, after, 1, UI, anim / 2, 0, step);

      // The hint fill is drawTile's centre rect (inset by hw = ts/20 = 2),
      // drawn at the tile's interpolated position — half a cell from its
      // origin toward the gap it slides into.
      const hw = 2;
      const x0 = coord(from % 4);
      const y0 = coord(Math.floor(from / 4));
      const x1 = coord(to % 4);
      const y1 = coord(Math.floor(to / 4));
      const ex = x0 + Math.floor(0.5 * (x1 - x0)) + hw;
      const ey = y0 + Math.floor(0.5 * (y1 - y0)) + hw;

      const fills = ops.filter(
        (o) =>
          o.op === "drawRect" &&
          o.colour === 4 &&
          o.w === TS - 2 * hw &&
          o.h === TS - 2 * hw,
      );
      // Exactly one hint fill on the frame, and it is mid-flight — in
      // particular not at the origin cell, where marking the step's own
      // pre-move index would have painted it.
      expect(fills).toHaveLength(1);
      expect({ x: fills[0].x, y: fills[0].y }).toEqual({ x: ex, y: ey });
      return;
    }
    throw new Error("no seed in 20 produced a board with an ok hint");
  });
});

function coord(pos: number): number {
  return pos * TS + Math.floor(TS / 2); // fifteen's border(ts) = ts/2
}
