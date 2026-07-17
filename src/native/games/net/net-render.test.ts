/**
 * Render tier-2.5 tests: drive real frames through a `Midend` with the recording
 * `GameDrawing`, assert the ops that matter, and snapshot the record.
 *
 * Net's renderer is a fresh port (design D2), so this is the guard that its
 * rotated-polygon wires, the three colour passes (black / powered-cyan /
 * error-red), the endpoint + source boxes, the locked-grey background, and the
 * barrier rectangles are all emitted.
 */

import { describe, expect, it } from "vitest";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { newDesc } from "./generator.ts";
import { netGame } from "./index.ts";
import {
  COL_BARRIER,
  COL_BORDER,
  COL_LOCKED,
  COL_POWERED,
  COL_WIRE,
} from "./render.ts";
import { type NetMove, type NetParams, newState, newUi } from "./state.ts";

/** A reproducible `params:desc` id and the matching state/solve move. */
function board(
  p: NetParams,
  seed: string,
): { id: string; state: ReturnType<typeof newState>; solveMove: NetMove } {
  const { desc } = newDesc(p, randomNew(seed));
  const id = `${netGame.encodeParams(p, true)}:${desc}`;
  const state = newState(p, desc);
  const solveResult = netGame.solve?.(state, state);
  if (!solveResult?.ok) throw new Error("board should be solvable");
  return { id, state, solveMove: solveResult.move };
}

const P5: NetParams = {
  w: 5,
  h: 5,
  wrapping: false,
  unique: true,
  barrierProbability: 0,
};
const P5B: NetParams = {
  w: 5,
  h: 5,
  wrapping: false,
  unique: true,
  barrierProbability: 1,
};

describe("net render", () => {
  it("opener frame: draws grid borders, wire polygons and the source box", () => {
    const { id } = board(P5, "render-opener");
    const { recording } = renderScenario({ game: netGame, id });
    const ops = recording.ops;

    // Grid lines are border-grey rects; wires are black-filled polygons.
    expect(ops.some((o) => o.op === "rect" && o.colour === COL_BORDER)).toBe(true);
    expect(ops.some((o) => o.op === "polygon" && o.fill === COL_WIRE)).toBe(true);
    expect(ops.filter((o) => o.op === "polygon").length).toBeGreaterThan(0);

    expect(ops).toMatchSnapshot();
  });

  it("solving the board lights more powered wires cyan", () => {
    const { id, solveMove } = board(P5, "render-powered");
    const poweredCount = (ops: readonly { op: string; fill?: number }[]) =>
      ops.filter((o) => o.op === "polygon" && o.fill === COL_POWERED).length;

    // An unsolved board powers only the tiles reachable from the source; a solved
    // board powers every wire, so the count strictly increases.
    const before = renderScenario({ game: netGame, id });
    const after = renderScenario({ game: netGame, id, moves: [solveMove] });
    expect(poweredCount(after.recording.ops)).toBeGreaterThan(
      poweredCount(before.recording.ops),
    );
  });

  it("a locked tile is drawn on the locked-grey background", () => {
    const { id } = board(P5, "render-locked");
    const lock: NetMove = { type: "lock", x: 2, y: 2 };
    const { recording } = renderScenario({ game: netGame, id, moves: [lock] });
    expect(recording.ops.some((o) => o.op === "rect" && o.colour === COL_LOCKED)).toBe(
      true,
    );
  });

  it("a barrier preset draws red barrier rectangles", () => {
    const { id } = board(P5B, "render-barrier");
    const { recording } = renderScenario({ game: netGame, id });
    expect(recording.ops.some((o) => o.op === "rect" && o.colour === COL_BARRIER)).toBe(
      true,
    );
  });

  it("Solve is not celebrated with a flash", () => {
    const { state, solveMove } = board(P5, "render-noflash");
    const solved = netGame.executeMove(state, solveMove);
    // usedSolve suppresses the completion flash.
    expect(netGame.flashLength?.(state, solved, 1, newUi(solved))).toBe(0);
  });
});
