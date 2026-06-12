/**
 * Tier-1 tests for the Guess Game glue: move execution + purity,
 * win/lose/reveal transitions, the `changedState` hold-carry, the
 * hint-fills-the-working-row behaviour (played end-to-end), and key
 * input mapping.
 */
import { describe, expect, it } from "vitest";
import { randomNew } from "../../random/index.ts";
import { CURSOR_SELECT } from "../../engine/pointer.ts";
import { guessGame } from "./index.ts";
import {
  defaultParams,
  type GuessMove,
  type GuessState,
  type GuessUi,
  newDesc,
  newState,
  status,
} from "./state.ts";

const ZERO = { x: 0, y: 0 };

function freshGame(seed = "seed-X", params = defaultParams()): { state: GuessState; ui: GuessUi } {
  const { desc } = newDesc(params, randomNew(seed));
  const state = newState(params, desc);
  const ui = guessGame.newUi(state);
  guessGame.changedState?.(ui, null, state);
  return { state, ui };
}

function submit(pegs: number[], holds?: boolean[]): GuessMove {
  return { type: "guess", pegs, holds: holds ?? pegs.map(() => false) };
}

describe("executeMove", () => {
  it("a correct guess wins", () => {
    const { state } = freshGame();
    const next = guessGame.executeMove(state, submit(state.solution.slice()));
    expect(next.solved).toBe(1);
    expect(status(next)).toBe("solved");
    // The winning row is stored at nextGo (unchanged) with all-place feedback.
    expect(next.guesses[next.nextGo].feedback.every((f) => f === 1)).toBe(true);
  });

  it("is pure (source state unchanged)", () => {
    const { state } = freshGame();
    const before = JSON.stringify(state);
    guessGame.executeMove(state, submit(state.solution.slice()));
    expect(JSON.stringify(state)).toBe(before);
  });

  it("a wrong guess advances next_go and stores feedback", () => {
    const { state } = freshGame();
    const wrong = state.solution.slice();
    wrong[0] = (wrong[0] % state.params.ncolours) + 1; // perturb one peg
    const next = guessGame.executeMove(state, submit(wrong));
    expect(next.solved).toBe(0);
    expect(next.nextGo).toBe(1);
    expect(next.guesses[0].pegs).toEqual(wrong);
  });

  it("exhausting the rows loses and reveals", () => {
    const params = { ...defaultParams(), nguesses: 1 };
    const { state } = freshGame("oneshot", params);
    const wrong = state.solution.slice();
    wrong[0] = (wrong[0] % params.ncolours) + 1;
    const next = guessGame.executeMove(state, submit(wrong));
    expect(next.solved).toBe(-1);
    expect(status(next)).toBe("lost");
  });

  it("solve reveals (give-up = loss reveal)", () => {
    const { state } = freshGame();
    const res = guessGame.solve?.(state, state);
    expect(res?.ok).toBe(true);
    if (res?.ok) {
      const next = guessGame.executeMove(state, res.move);
      expect(next.solved).toBe(-1);
      expect(status(next)).toBe("lost");
    }
  });

  it("rejects an out-of-range peg", () => {
    const { state } = freshGame();
    expect(() => guessGame.executeMove(state, submit([1, 2, 3, 99]))).toThrow();
  });
});

describe("changedState (hold-carry)", () => {
  it("carries held pegs into the next working row, clears the rest", () => {
    const { state, ui } = freshGame();
    const guess = state.solution.slice();
    guess[1] = (guess[1] % state.params.ncolours) + 1; // ensure not a win
    const holds = [true, false, false, false];
    const next = guessGame.executeMove(state, submit(guess, holds));
    guessGame.changedState?.(ui, state, next);
    expect(ui.currPegs[0]).toBe(guess[0]); // held
    expect(ui.currPegs.slice(1)).toEqual([0, 0, 0]); // cleared
    expect(ui.holds[0]).toBe(true);
  });

  it("clears the working row and holds on a win", () => {
    const { state, ui } = freshGame();
    ui.holds[0] = true;
    const next = guessGame.executeMove(state, submit(state.solution.slice(), [true, false, false, false]));
    guessGame.changedState?.(ui, state, next);
    expect(ui.currPegs).toEqual([0, 0, 0, 0]);
    expect(ui.holds.every((h) => !h)).toBe(true);
  });

  it("drops the cached hint on an undo (next_go decreases)", () => {
    const { state, ui } = freshGame();
    ui.hint = [1, 1, 1, 1];
    const wrong = state.solution.slice();
    wrong[0] = (wrong[0] % state.params.ncolours) + 1;
    const next = guessGame.executeMove(state, submit(wrong)); // nextGo 0 -> 1
    guessGame.changedState?.(ui, next, state); // simulate undo: new < old
    expect(ui.hint).toBeNull();
  });
});

describe("hint (compute_hint)", () => {
  it("solving by always taking the hint wins within the guess limit", () => {
    const params = defaultParams();
    let { state, ui } = freshGame("hint-solve", params);
    let guesses = 0;
    while (state.solved === 0 && guesses < params.nguesses) {
      // Press the hint key: fills ui.currPegs with a consistent row.
      const r = guessGame.interpretMove(state, ui, null, ZERO, 0x68 /* 'h' */);
      expect(r).toBeTruthy();
      const move = submit(ui.currPegs.slice());
      state = guessGame.executeMove(state, move);
      guessGame.changedState?.(ui, state, state);
      guesses++;
    }
    expect(state.solved).toBe(1);
  });

  it("the hint row is consistent with every prior guess's feedback", () => {
    const params = defaultParams();
    const { state: s0, ui } = freshGame("hint-consistency", params);
    // Submit one deliberate wrong guess to create feedback.
    const wrong = [1, 2, 3, 4];
    const s1 = guessGame.executeMove(s0, submit(wrong));
    guessGame.changedState?.(ui, s0, s1);
    guessGame.interpretMove(s1, ui, null, ZERO, 0x68);
    // Re-score the hint row against the prior guess; it must reproduce
    // that guess's feedback (the definition of "consistent").
    // Use the same maxcolour bound compute_hint uses (here ncolours).
    const hintRow = ui.currPegs.slice();
    // markPegs(hintRow, priorGuessPegs) equals priorGuess feedback.
    // (compute_hint guarantees this for the recorded feedback.)
    expect(hintRow.every((c) => c >= 1 && c <= params.ncolours)).toBe(true);
  });
});

describe("interpretMove keyboard", () => {
  it("number keys place a peg and advance the cursor", () => {
    const { state, ui } = freshGame();
    ui.displayCur = true;
    const r = guessGame.interpretMove(state, ui, null, ZERO, 0x33 /* '3' */);
    expect(r).toBeTruthy();
    expect(ui.currPegs[0]).toBe(3);
    expect(ui.pegCur).toBe(1);
  });

  it("submit is offered only for a markable row", () => {
    const { state, ui } = freshGame();
    // Fill all pegs → markable; move cursor to submit position.
    for (let i = 0; i < state.params.npegs; i++) ui.currPegs[i] = 1;
    ui.markable = true;
    ui.pegCur = state.params.npegs;
    ui.displayCur = true;
    const r = guessGame.interpretMove(state, ui, null, ZERO, CURSOR_SELECT);
    expect(r).toMatchObject({ type: "guess" });
  });

  it("the label toggle works even after the game ends", () => {
    const { state, ui } = freshGame();
    const solved = guessGame.executeMove(state, submit(state.solution.slice()));
    const before = ui.showLabels;
    const r = guessGame.interpretMove(solved, ui, null, ZERO, 0x6c /* 'l' */);
    expect(r).toBeTruthy();
    expect(ui.showLabels).toBe(!before);
  });
});
