// Tier-1 midend integration: drive the real `Midend` with Range from a
// generated id through the Solve command, an honest move-by-move solve,
// and the mistake overlay.
import { describe, expect, it } from "vitest";
import type { ChangeNotification, GameStatus } from "../../../puzzle/types.ts";
import { Midend } from "../../engine/midend.ts";
import { randomNew } from "../../random/index.ts";
import { rangeGame } from "./index.ts";
import { fullSolve } from "./solver.ts";
import { BLACK, decodeParams, idx, newState, type RangeMove, WHITE } from "./state.ts";

function harness() {
  const notes: ChangeNotification[] = [];
  const m = new Midend(rangeGame);
  m.setCallbacks(
    (n) => notes.push(n),
    () => {},
    () => {},
  );
  const status = (): GameStatus | undefined =>
    (
      [...notes].reverse().find((n) => n.type === "game-state-change") as
        | Extract<ChangeNotification, { type: "game-state-change" }>
        | undefined
    )?.status;
  return { m, status };
}

describe("midend integration", () => {
  it("starts ongoing and the Solve command finishes with help", () => {
    const { m, status } = harness();
    expect(m.newGameFromId("9x6#range-mid-solve")).toBeUndefined();
    expect(status()).toBe("ongoing");
    expect(m.solve()).toBeUndefined();
    expect(status()).toBe("solved-with-help");
  });

  it("reaches a plain solved state by playing the solution's moves", () => {
    const params = decodeParams("9x6");
    const { desc } = rangeGame.newDesc(params, randomNew("range-mid-play"));
    const solution = fullSolve(newState(params, desc).grid, params.w, params.h);
    if (!solution) throw new Error("expected solvable");

    const { m, status } = harness();
    expect(m.newGameFromId(`9x6:${desc}`)).toBeUndefined();

    const moves: RangeMove[] = [];
    for (let r = 0; r < params.h; r++) {
      for (let c = 0; c < params.w; c++) {
        const v = solution[idx(r, c, params.w)];
        if (v === BLACK) moves.push({ sets: [{ r, c, value: "black" }] });
        else if (v === WHITE) moves.push({ sets: [{ r, c, value: "white" }] });
      }
    }
    m.playMoves(moves);
    expect(status()).toBe("solved");
  });

  it("reports mistakes against the solution and clears when corrected", () => {
    const params = decodeParams("9x6");
    const { desc } = rangeGame.newDesc(params, randomNew("range-mid-mistake"));
    const solution = fullSolve(newState(params, desc).grid, params.w, params.h);
    if (!solution) throw new Error("expected solvable");

    const { m } = harness();
    expect(m.newGameFromId(`9x6:${desc}`)).toBeUndefined();

    // Dot (white) a cell that is black in the solution → a mistake.
    const blackCell = solution.findIndex((v) => v === BLACK);
    const r = Math.floor(blackCell / params.w);
    const c = blackCell % params.w;
    m.playMoves([{ sets: [{ r, c, value: "white" }] }]);
    expect(m.findMistakes()).toBeGreaterThan(0);

    // Correct it to black → no mistakes.
    m.playMoves([{ sets: [{ r, c, value: "black" }] }]);
    expect(m.findMistakes()).toBe(0);
  });
});
