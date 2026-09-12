/**
 * Tier-2 render-ops test: drive Black Box's `redraw` against the engine's
 * shared `RecordingDrawing` and assert the draw-call structure — the
 * first-draw background fill, a covered arena cell, a fired laser's
 * number text, the reveal button gated on `canReveal`, and the
 * wrong-guess red cross on a reveal.
 */

import { describe, expect, it } from "vitest";
import { RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import { DEFAULT_BACKGROUND } from "../../engine/testing/render-scenario.ts";
import { blackboxGame } from "./index.ts";
import {
  type BlackboxDrawState,
  COL_BACKGROUND,
  COL_BUTTON,
  COL_COVER,
  COL_WRONG,
  redraw,
} from "./render.ts";
import {
  BALL_CORRECT,
  type BlackboxState,
  type BlackboxUi,
  grid2range,
  LASER_EMPTY,
} from "./state.ts";

const PALETTE = blackboxGame.colors(DEFAULT_BACKGROUND);

function recordingDrawing(): { dr: RecordingDrawing; ops: RecordingDrawing["ops"] } {
  const dr = new RecordingDrawing(PALETTE);
  return { dr, ops: dr.ops };
}

const TS = 32;

function makeState(
  w: number,
  h: number,
  balls: Array<[number, number]>,
): BlackboxState {
  const nlasers = 2 * (w + h);
  const grid = new Int32Array((w + 2) * (h + 2));
  for (const [bx, by] of balls) grid[(by + 1) * (w + 2) + (bx + 1)] = BALL_CORRECT;
  return {
    w,
    h,
    minballs: balls.length,
    maxballs: balls.length,
    nballs: balls.length,
    nlasers,
    grid,
    exits: new Int32Array(nlasers).fill(LASER_EMPTY),
    laserno: 1,
    nguesses: 0,
    nright: 0,
    nwrong: 0,
    nmissed: 0,
    reveal: false,
    justwrong: false,
  };
}

function freshDs(s: BlackboxState): BlackboxDrawState {
  const ds = blackboxGame.newDrawState?.(s) as BlackboxDrawState;
  blackboxGame.setTileSize?.(ds, TS);
  return ds;
}

function freshUi(s: BlackboxState): BlackboxUi {
  return blackboxGame.newUi(s);
}

describe("Black Box redraw", () => {
  it("fills the background on first draw", () => {
    const s = makeState(5, 5, [[0, 0]]);
    const ds = freshDs(s);
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, s, 1, freshUi(s), 0, 0);
    const fullW = TS * (s.w + 2) + 2 * Math.floor(TS / 2);
    expect(
      ops.some(
        (o) =>
          o.op === "rect" &&
          o.color === COL_BACKGROUND &&
          o.x === 0 &&
          o.y === 0 &&
          o.w === fullW,
      ),
    ).toBe(true);
  });

  it("draws covered arena cells before reveal", () => {
    const s = makeState(5, 5, [[0, 0]]);
    const ds = freshDs(s);
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, s, 1, freshUi(s), 0, 0);
    expect(ops.some((o) => o.op === "rect" && o.color === COL_COVER)).toBe(true);
  });

  it("draws a fired laser's number text", () => {
    let s = makeState(5, 5, []);
    const top = grid2range(5, 5, 1, 0) as number; // top of column 1
    s = blackboxGame.executeMove(s, { type: "fire", rangeno: top });
    const ds = freshDs(s);
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, s, 1, freshUi(s), 0, 0);
    // The matched entry/exit cells show the laser number "1".
    expect(ops.some((o) => o.op === "text" && o.text === "1")).toBe(true);
  });

  it("shows the reveal button only when the ball count is in range", () => {
    const balls: Array<[number, number]> = [
      [0, 0],
      [1, 1],
      [2, 2],
    ];
    // Not enough guesses marked → no button.
    const s0 = makeState(5, 5, balls);
    const ds0 = freshDs(s0);
    const r0 = recordingDrawing();
    redraw(r0.dr, ds0, null, s0, 1, freshUi(s0), 0, 0);
    expect(r0.ops.some((o) => o.op === "circle" && o.fill === COL_BUTTON)).toBe(false);

    // Mark the right number of guesses → button appears.
    let s1 = s0;
    for (const [x, y] of balls)
      s1 = blackboxGame.executeMove(s1, { type: "toggleBall", x: x + 1, y: y + 1 });
    const ds1 = freshDs(s1);
    const r1 = recordingDrawing();
    redraw(r1.dr, ds1, null, s1, 1, freshUi(s1), 0, 0);
    expect(r1.ops.some((o) => o.op === "circle" && o.fill === COL_BUTTON)).toBe(true);
  });

  it("draws the red cross over a wrong guess on reveal", () => {
    const balls: Array<[number, number]> = [
      [0, 0],
      [1, 1],
      [2, 2],
    ];
    let s = makeState(5, 5, balls);
    s = blackboxGame.executeMove(s, { type: "toggleBall", x: 1, y: 1 }); // correct (0,0)
    s = blackboxGame.executeMove(s, { type: "toggleBall", x: 2, y: 2 }); // correct (1,1)
    s = blackboxGame.executeMove(s, { type: "toggleBall", x: 4, y: 4 }); // wrong (3,3)
    const revealed = blackboxGame.executeMove(s, { type: "solve" });
    const ds = freshDs(revealed);
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, s, revealed, 1, freshUi(revealed), 0, 0);
    expect(ops.some((o) => o.op === "polygon" && o.fill === COL_WRONG)).toBe(true);
  });
});
