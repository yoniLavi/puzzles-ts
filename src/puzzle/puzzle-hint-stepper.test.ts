// The toolbar Hint button alternates show/apply (add-hint-button-stepper):
// the first press *shows* a hint step; a second press with nothing done in
// between *applies* that one step via executeHint(true) (which hides the plan
// rather than previewing the next) and disarms, so the player gets a clean
// show, apply, show, apply rhythm — one applied hint per request. Any
// intervening user action also disarms. These tests drive Puzzle's
// orchestration directly against a stub worker — the logic lives entirely in
// Puzzle, no midend/worker needed.
import { describe, expect, it, vi } from "vitest";
import { Puzzle } from "./puzzle.ts";
import type { PuzzleStaticAttributes } from "./types.ts";
import type { RemoteWorkerPuzzle } from "./worker.ts";

const ATTRS: PuzzleStaticAttributes = {
  displayName: "Test",
  canConfigure: false,
  canSolve: true,
  canHint: true,
  canFindMistakes: false,
  hasReference: false,
  canMarkAll: false,
  needsRightButton: false,
  isTimed: false,
  wantsStatusbar: true,
  engineType: "wasm",
};

/** Build a Puzzle around a stub worker that records hint/executeHint calls.
 * The private constructor is bypassed via Reflect.construct (TS `private` is
 * compile-time only); we never call initialize()/delete() so no real worker is
 * needed. */
function makePuzzle(overrides: Partial<Record<string, unknown>> = {}): {
  puzzle: Puzzle;
  calls: string[];
  workerPuzzle: RemoteWorkerPuzzle;
  setHintError: (e: string | undefined) => void;
  setExecuteError: (e: string | undefined) => void;
} {
  const calls: string[] = [];
  let hintError: string | undefined;
  let executeError: string | undefined;
  const workerPuzzle = {
    hint: vi.fn(async () => {
      calls.push("show");
      return hintError;
    }),
    executeHint: vi.fn(async () => {
      calls.push("apply");
      return executeError;
    }),
    undo: vi.fn(async () => {
      calls.push("undo");
    }),
    processKey: vi.fn(async () => {
      calls.push("key");
      return true;
    }),
    ...overrides,
  } as unknown as RemoteWorkerPuzzle;

  const puzzle = Reflect.construct(Puzzle, [
    "test",
    {} as unknown as Worker,
    workerPuzzle,
    ATTRS,
  ]) as Puzzle;

  return {
    puzzle,
    calls,
    workerPuzzle,
    setHintError: (e) => {
      hintError = e;
    },
    setExecuteError: (e) => {
      executeError = e;
    },
  };
}

describe("Hint button stepper", () => {
  it("first press shows, second press applies (with hideAfter)", async () => {
    const { puzzle, calls, workerPuzzle } = makePuzzle();
    await puzzle.hint();
    await puzzle.hint();
    expect(calls).toEqual(["show", "apply"]);
    // The apply hides the plan rather than previewing the next step.
    expect(workerPuzzle.executeHint).toHaveBeenCalledWith(true);
    // …and confirms with a transient "Hint applied" banner.
    expect(puzzle.autoHintMessage).toBe("Hint applied");
  });

  it("alternates show, apply, show, apply over repeated presses", async () => {
    const { puzzle, calls } = makePuzzle();
    await puzzle.hint();
    await puzzle.hint();
    await puzzle.hint();
    await puzzle.hint();
    expect(calls).toEqual(["show", "apply", "show", "apply"]);
  });

  it("an intervening undo re-arms the show (does not apply a stale step)", async () => {
    const { puzzle, calls } = makePuzzle();
    await puzzle.hint(); // show, arm
    await puzzle.undo(); // intervening action disarms
    await puzzle.hint(); // shows again, does not apply
    expect(calls).toEqual(["show", "undo", "show"]);
  });

  it("an intervening keypress re-arms the show", async () => {
    const { puzzle, calls } = makePuzzle();
    await puzzle.hint(); // show, arm
    await puzzle.processKey(65); // intervening action disarms
    await puzzle.hint(); // shows again
    expect(calls).toEqual(["show", "key", "show"]);
  });

  it("a refused hint does not arm the apply", async () => {
    const { puzzle, calls, setHintError } = makePuzzle();
    setHintError("Fix the highlighted mistakes first");
    await puzzle.hint(); // refused show, not armed
    await puzzle.hint(); // still a show, not an apply
    expect(calls).toEqual(["show", "show"]);
  });

  it("an executeHint error disarms so the next press shows", async () => {
    const { puzzle, calls, setExecuteError } = makePuzzle();
    await puzzle.hint(); // show, arm
    setExecuteError("Already solved!");
    await puzzle.hint(); // apply -> error -> disarm
    await puzzle.hint(); // shows again
    expect(calls).toEqual(["show", "apply", "show"]);
  });
});
