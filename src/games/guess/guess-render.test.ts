/**
 * Tier-2 render-ops test: drive Guess's `redraw` against the engine's
 * shared `RecordingDrawing` and assert the draw-call structure — the
 * first-draw background fill, a correct-place feedback marker in
 * COL_CORRECTPLACE, the hold bar in COL_HOLD on a held slot, and the
 * solution reveal appearing only once the game is over.
 */
import { describe, expect, it } from "vitest";
import { randomNew } from "../../engine/random/index.ts";
import { opsOfKind, RecordingDrawing } from "../../engine/testing/recording-drawing.ts";
import { DEFAULT_BACKGROUND } from "../../engine/testing/render-scenario.ts";
import { guessGame } from "./index.ts";
import {
  COL_BACKGROUND,
  COL_CORRECTPLACE,
  COL_HOLD,
  type GuessDrawState,
  redraw,
} from "./render.ts";
import { defaultParams, type GuessUi, newDesc, newState } from "./state.ts";

const PALETTE = guessGame.colors(DEFAULT_BACKGROUND);

function recordingDrawing(): { dr: RecordingDrawing; ops: RecordingDrawing["ops"] } {
  const dr = new RecordingDrawing(PALETTE);
  return { dr, ops: dr.ops };
}

const TS = 32;
const params = defaultParams();

function freshDs(): GuessDrawState {
  const ds = guessGame.newDrawState?.(newState(params, "01020304")) as GuessDrawState;
  guessGame.setTileSize?.(ds, TS);
  return ds;
}

function freshUi(state = newState(params, "01020304")): GuessUi {
  const ui = guessGame.newUi(state);
  guessGame.changedState?.(ui, null, state);
  return ui;
}

describe("Guess redraw", () => {
  it("fills the background on first draw", () => {
    const s = newState(params, "01020304");
    const ds = freshDs();
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, s, 1, freshUi(s), 0, 0);
    expect(
      ops.some(
        (o) =>
          o.op === "rect" && o.color === COL_BACKGROUND && o.w === ds.w && o.h === ds.h,
      ),
    ).toBe(true);
  });

  it("draws a correct-place feedback marker after a scored guess", () => {
    const { desc } = newDesc(params, randomNew("render-fb"));
    const s0 = newState(params, desc);
    const wrong = s0.solution.slice();
    wrong[0] = (wrong[0] % params.ncolors) + 1; // 3 exact matches remain
    const s1 = guessGame.executeMove(s0, {
      type: "guess",
      pegs: wrong,
      holds: [false, false, false, false],
    });
    expect(s1.guesses[0].feedback).toContain(1); // FEEDBACK_CORRECTPLACE

    const ds = freshDs();
    const ui = freshUi(s1);
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, s0, s1, 1, ui, 0, 0);
    expect(ops.some((o) => o.op === "circle" && o.fill === COL_CORRECTPLACE)).toBe(
      true,
    );
  });

  it("draws the hold bar on a held active slot", () => {
    const s = newState(params, "01020304");
    const ds = freshDs();
    const ui = freshUi(s);
    ui.holds[0] = true;
    const { dr, ops } = recordingDrawing();
    redraw(dr, ds, null, s, 1, ui, 0, 0);
    expect(ops.some((o) => o.op === "rect" && o.color === COL_HOLD && o.h === 2)).toBe(
      true,
    );
  });

  it("reveals the solution row only once the game is over", () => {
    const { desc } = newDesc(params, randomNew("render-reveal"));
    const s0 = newState(params, desc);

    // Unsolved: no peg circles in the solution row (y >= solny).
    const dsA = freshDs();
    const { dr: drA, ops: opsA } = recordingDrawing();
    redraw(drA, dsA, null, s0, 1, freshUi(s0), 0, 0);
    /** A peg is a circle in one of the ten peg colors, wherever it is drawn. */
    const pegsBelow = (ops: RecordingDrawing["ops"], y: number) =>
      opsOfKind(ops, "circle").some((o) => o.fill >= 6 && o.fill <= 15 && o.cy >= y);
    expect(pegsBelow(opsA, dsA.solny)).toBe(false);

    // Solved: the solution pegs are revealed in the solution row.
    const won = guessGame.executeMove(s0, {
      type: "guess",
      pegs: s0.solution.slice(),
      holds: [false, false, false, false],
    });
    const dsB = freshDs();
    const { dr: drB, ops: opsB } = recordingDrawing();
    redraw(drB, dsB, s0, won, 1, freshUi(won), 0, 0);
    expect(pegsBelow(opsB, dsB.solny)).toBe(true);
  });
});
