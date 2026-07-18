/**
 * Tier-2.5 render scenarios for Rectangles: drive a real Midend to a target
 * frame and capture `redraw`. Targeted op assertions (number text, the grey
 * correct-rectangle fill after solving, the red mistake overlay) plus a
 * snapshot so a render regression is a reviewable text diff (`vitest -u`
 * re-baselines; the targeted assertions survive a careless `-u`).
 */
import { describe, expect, it } from "vitest";
import { renderScenario } from "../../engine/testing/render-scenario.ts";
import { randomNew } from "../../random/index.ts";
import { newDesc } from "./generator.ts";
import { rectGame } from "./index.ts";
import { newState } from "./moves.ts";
import { COL_CORRECT, COL_MISTAKE } from "./render.ts";
import type { RectMove, RectParams } from "./state.ts";

const P: RectParams = { w: 7, h: 7, expandfactor: 0, unique: true };
const ID = `${rectGame.encodeParams(P, true)}#rect-scenario`;

describe("rect render scenarios", () => {
  it("opener frame: number text drawn, no correct-fill yet", () => {
    const { recording } = renderScenario({ game: rectGame, id: ID });
    expect(recording.ops.some((o) => o.op === "text")).toBe(true);
    // Nothing is complete on a blank board, so no grey correct fill.
    expect(recording.ops.some((o) => o.op === "rect" && o.colour === COL_CORRECT)).toBe(
      false,
    );
    expect(recording.ops).toMatchSnapshot();
  });

  it("solved frame: grey correct fill covers the board", () => {
    // Build the solve move from the same id's board.
    const { desc } = newDesc(P, randomNew("rect-scenario"));
    const st = newState(P, desc);
    const solveMove = rectGame.solve?.(st, st, undefined);
    if (!solveMove?.ok) throw new Error("unsolvable");
    const { recording } = renderScenario({
      game: rectGame,
      id: ID,
      moves: [solveMove.move as RectMove],
    });
    // Every cell is correct → grey COL_CORRECT fill appears; flash is 0 here.
    expect(recording.ops.some((o) => o.op === "rect" && o.colour === COL_CORRECT)).toBe(
      true,
    );
  });

  it("mistake frame: a wrong wall shows the red overlay", () => {
    const { desc } = newDesc(P, randomNew("rect-scenario"));
    const st = newState(P, desc);
    const solveMove = rectGame.solve?.(st, st, undefined);
    if (!solveMove?.ok) throw new Error("unsolvable");
    const solved = rectGame.executeMove(st, solveMove.move);
    // Find an interior vedge not in the solution.
    let wrong: RectMove | null = null;
    for (let y = 0; y < P.h && !wrong; y++)
      for (let x = 1; x < P.w; x++)
        if (!solved.vedge[y * P.w + x]) {
          wrong = { type: "edge", edge: "v", x, y };
          break;
        }
    if (!wrong) throw new Error("no free edge");
    const { recording, mistakeCount } = renderScenario({
      game: rectGame,
      id: ID,
      moves: [wrong],
      showMistakes: true,
    });
    expect(mistakeCount).toBeGreaterThan(0);
    expect(recording.ops.some((o) => o.op === "rect" && o.colour === COL_MISTAKE)).toBe(
      true,
    );
  });
});
