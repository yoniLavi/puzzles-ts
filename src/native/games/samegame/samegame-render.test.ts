// Tier-2 render test: drive Same Game's `redraw` against a recording
// `GameDrawing` double and assert the draw-call structure — the recessed
// bevel, the seamless join fill between same-colour neighbours, the
// selection outer rect (COL_SEL), and the impossible-board inner recolour
// (COL_IMPOSSIBLE).
import { describe, expect, it } from "vitest";
import type { GameDrawing } from "../../engine/game.ts";
import { newDrawState, redraw, type SamegameDrawState, setTileSize } from "./render.ts";
import {
  newState,
  type SamegameParams,
  type SamegameState,
  type SamegameUi,
} from "./state.ts";

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
    drawUpdate: () => ops.push({ op: "drawUpdate" }),
    clip: () => ops.push({ op: "clip" }),
    unclip: () => ops.push({ op: "unclip" }),
    drawRect: (r: { x: number; y: number; w: number; h: number }, c: number) =>
      ops.push({ op: "drawRect", colour: c, x: r.x, y: r.y, w: r.w, h: r.h }),
    drawLine: (_a: unknown, _b: unknown, c: number) =>
      ops.push({ op: "drawLine", colour: c }),
    drawPolygon: (p: { x: number; y: number }[], f: number) =>
      ops.push({ op: "drawPolygon", colour: f, x: p[0].x, y: p[0].y }),
    drawCircle: () => ops.push({ op: "drawCircle" }),
    drawText: () => ops.push({ op: "drawText" }),
    blitterNew: () => ({}),
    blitterFree: () => {},
    blitterSave: () => {},
    blitterLoad: () => {},
  } as unknown as GameDrawing;
  return { dr, ops };
}

const TS = 32; // tilegap = 2, tileinner = 30, TILE_SIZE = 32.

function freshDs(state: SamegameState): SamegameDrawState {
  const ds = newDrawState(state);
  setTileSize(ds, TS);
  return ds;
}

function mkState(desc: string, p?: Partial<SamegameParams>): SamegameState {
  return newState({ w: 2, h: 1, ncols: 3, scoresub: 2, soluble: true, ...p }, desc);
}

function emptyUi(state: SamegameState): SamegameUi {
  return {
    selected: new Array<boolean>(state.w * state.h).fill(false),
    nselected: 0,
    xsel: 0,
    ysel: 0,
    displaySel: false,
  };
}

describe("Same Game redraw", () => {
  it("paints a recessed bevel on first draw", () => {
    const state = mkState("1,2");
    const { dr, ops } = recordingDrawing();
    redraw(dr, freshDs(state), null, state, 1, emptyUi(state), 0, 0);
    // Two recessed-bevel polygons (highlight + lowlight).
    expect(ops.filter((o) => o.op === "drawPolygon").length).toBe(2);
  });

  it("fills the gap between same-colour neighbours (a seamless join)", () => {
    // Two colour-1 tiles side by side: the left tile joins right, so it
    // paints a full-TILE_SIZE-wide rect in its colour (COL_1 = 1).
    const state = mkState("1,1");
    const { dr, ops } = recordingDrawing();
    redraw(dr, freshDs(state), null, state, 1, emptyUi(state), 0, 0);
    expect(ops.some((o) => o.op === "drawRect" && o.colour === 1 && o.w === TS)).toBe(
      true,
    );
    // A differing pair leaves the inner-only width (no full-width join fill).
    const state2 = mkState("1,2");
    const r2 = recordingDrawing();
    redraw(r2.dr, freshDs(state2), null, state2, 1, emptyUi(state2), 0, 0);
    expect(
      r2.ops.some((o) => o.op === "drawRect" && o.colour === 1 && o.w === TS),
    ).toBe(false);
  });

  it("draws a COL_SEL outer rect for a selected tile", () => {
    const state = mkState("1,1");
    const ui = emptyUi(state);
    ui.selected[0] = true;
    ui.nselected = 1;
    const { dr, ops } = recordingDrawing();
    redraw(dr, freshDs(state), null, state, 1, ui, 0, 0);
    // COL_SEL = palette index 11.
    expect(ops.some((o) => o.op === "drawRect" && o.colour === 11)).toBe(true);
  });

  it("recolours tile innards to COL_IMPOSSIBLE on a stuck board", () => {
    const state: SamegameState = { ...mkState("1,2"), impossible: true };
    const { dr, ops } = recordingDrawing();
    redraw(dr, freshDs(state), null, state, 1, emptyUi(state), 0, 0);
    // COL_IMPOSSIBLE = palette index 10 (drawn as the inner square).
    expect(ops.some((o) => o.op === "drawRect" && o.colour === 10)).toBe(true);
  });
});
