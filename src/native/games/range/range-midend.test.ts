// Tier-1 midend integration: drive the real `Midend` with Range from a
// generated id through the Solve command, an honest move-by-move solve,
// and the mistake overlay.
import { describe, expect, it } from "vitest";
import type { ChangeNotification, GameStatus } from "../../../puzzle/types.ts";
import { Midend } from "../../engine/midend.ts";
import { LEFT_BUTTON, RIGHT_BUTTON } from "../../engine/pointer.ts";
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
  const hintBanner = (): string | undefined =>
    (
      [...notes].reverse().find((n) => n.type === "status-bar-change") as
        | Extract<ChangeNotification, { type: "status-bar-change" }>
        | undefined
    )?.activeHintExplanation;
  return { m, status, hintBanner };
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

  it("surfaces the hint explanation without a status bar and clears it on a move", () => {
    // Range has wantsStatusbar=false but explained hints; the banner
    // (activeHintExplanation) must still be emitted, and cleared by a move.
    const params = decodeParams("9x6");
    const { desc } = rangeGame.newDesc(params, randomNew("range-hint-banner"));
    const { m, hintBanner } = harness();
    expect(m.newGameFromId(`9x6:${desc}`)).toBeUndefined();

    expect(m.hint()).toBeUndefined();
    const banner = hintBanner();
    expect(banner).toBeTruthy();
    expect((banner ?? "").length).toBeGreaterThan(0);

    // Make the hinted move as a real click (processInput runs the hint
    // keep-track, which advances+hides the plan) → the banner clears.
    const plan = rangeGame.hint?.(newState(params, desc));
    if (!plan?.ok) throw new Error("expected a plan");
    const t = (
      plan.steps[0].highlights as { target: { r: number; c: number; value: string } }
    ).target;
    const ts = 32;
    const b = ts / 2;
    const x = b + ts * t.c + ts / 2;
    const y = b + ts * t.r + ts / 2;
    m.processInput(x, y, t.value === "white" ? RIGHT_BUTTON : LEFT_BUTTON);
    expect(hintBanner() ?? "").toBe("");
  });

  it("reports mistakes against the solution and clears when corrected", () => {
    const params = decodeParams("9x6");
    const { desc } = rangeGame.newDesc(params, randomNew("range-mid-mistake"));
    const solution = fullSolve(newState(params, desc).grid, params.w, params.h);
    if (!solution) throw new Error("expected solvable");

    const { m } = harness();
    expect(m.newGameFromId(`9x6:${desc}`)).toBeUndefined();

    // Dot (white) a cell that is black in the solution → a mistake.
    const blackCell = solution.indexOf(BLACK);
    const r = Math.floor(blackCell / params.w);
    const c = blackCell % params.w;
    m.playMoves([{ sets: [{ r, c, value: "white" }] }]);
    expect(m.findMistakes()).toBeGreaterThan(0);

    // Correct it to black → no mistakes.
    m.playMoves([{ sets: [{ r, c, value: "black" }] }]);
    expect(m.findMistakes()).toBe(0);
  });
});
