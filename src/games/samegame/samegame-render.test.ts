// Tier-2 render test: drive Same Game's `redraw` against a recording
// `GameDrawing` double and assert the draw-call structure — the recessed
// bevel, the seamless join fill between same-color neighbors, the
// selection outer rect (COL_SEL), and the impossible-board inner recolor
// (COL_IMPOSSIBLE).
import { describe, expect, it } from "vitest";
import { newCursor } from "../../engine/pointer.ts";
import { RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import { DEFAULT_BACKGROUND } from "../../engine/testing/render-scenario.ts";
import { samegameGame } from "./index.ts";
import { newDrawState, redraw, type SamegameDrawState, setTileSize } from "./render.ts";
import {
  newState,
  type SamegameParams,
  type SamegameState,
  type SamegameUi,
} from "./state.ts";

const PALETTE = samegameGame.colors(DEFAULT_BACKGROUND);

function recordingDrawing(): { dr: RecordingDrawing; ops: RecordingDrawing["ops"] } {
  const dr = new RecordingDrawing(PALETTE);
  return { dr, ops: dr.ops };
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
    cursor: newCursor(),
  };
}

describe("Same Game redraw", () => {
  it("paints a recessed bevel on first draw", () => {
    const state = mkState("1,2");
    const { dr, ops } = recordingDrawing();
    redraw(dr, freshDs(state), null, state, 1, emptyUi(state), 0, 0);
    // Two recessed-bevel polygons (highlight + lowlight).
    expect(ops.filter((o) => o.op === "polygon").length).toBe(2);
  });

  it("fills the gap between same-color neighbors (a seamless join)", () => {
    // Two color-1 tiles side by side: the left tile joins right, so it
    // paints a full-TILE_SIZE-wide rect in its color (COL_1 = 1).
    const state = mkState("1,1");
    const { dr, ops } = recordingDrawing();
    redraw(dr, freshDs(state), null, state, 1, emptyUi(state), 0, 0);
    expect(ops.some((o) => o.op === "rect" && o.color === 1 && o.w === TS)).toBe(true);
    // A differing pair leaves the inner-only width (no full-width join fill).
    const state2 = mkState("1,2");
    const r2 = recordingDrawing();
    redraw(r2.dr, freshDs(state2), null, state2, 1, emptyUi(state2), 0, 0);
    expect(r2.ops.some((o) => o.op === "rect" && o.color === 1 && o.w === TS)).toBe(
      false,
    );
  });

  it("draws a COL_SEL outer rect for a selected tile", () => {
    const state = mkState("1,1");
    const ui = emptyUi(state);
    ui.selected[0] = true;
    ui.nselected = 1;
    const { dr, ops } = recordingDrawing();
    redraw(dr, freshDs(state), null, state, 1, ui, 0, 0);
    // COL_SEL = palette index 11.
    expect(ops.some((o) => o.op === "rect" && o.color === 11)).toBe(true);
  });

  it("recolors tile innards to COL_IMPOSSIBLE on a stuck board", () => {
    const state: SamegameState = { ...mkState("1,2"), impossible: true };
    const { dr, ops } = recordingDrawing();
    redraw(dr, freshDs(state), null, state, 1, emptyUi(state), 0, 0);
    // COL_IMPOSSIBLE = palette index 10 (drawn as the inner square).
    expect(ops.some((o) => o.op === "rect" && o.color === 10)).toBe(true);
  });
});
