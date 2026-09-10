// The toolbar Hint button alternates show/apply (add-hint-button-stepper):
// the first press *shows* a hint step; a second press with nothing done in
// between *applies* that one step via executeHint(true) (which hides the plan
// rather than previewing the next) and disarms, so the player gets a clean
// show, apply, show, apply rhythm — one applied hint per request. Any
// intervening user action also disarms. These tests drive Puzzle's
// orchestration directly against a stub worker — the logic lives entirely in
// Puzzle, no midend/worker needed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PuzzleStaticAttributes } from "../engine/types.ts";
import { HINT_PENDING_MESSAGE, HINT_PENDING_MS, Puzzle } from "./puzzle.ts";
import type { RemoteWorkerPuzzle } from "./worker.ts";

const ATTRS: PuzzleStaticAttributes = {
  canSolve: true,
  canHint: true,
  canFindMistakes: false,
  hasReference: false,
  canMarkAll: false,
  ignoresSecondaryButton: false,
  isTimed: false,
  wantsStatusbar: true,
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

/** A worker whose `hint`/`executeHint` do not answer until the test says so —
 * the shape of a Sixteen endgame search, where a press costs seconds. */
function makeSlowPuzzle() {
  // One gate per worker call, answered oldest first, after a macrotask so a
  // call reached through `enqueueInput`'s promise chain has been made.
  const pending: (() => void)[] = [];
  const gate = () =>
    new Promise<void>((resolve) => {
      pending.push(resolve);
    });
  let hintError: string | undefined;
  const base = makePuzzle({
    hint: vi.fn(async () => {
      base.calls.push("show");
      await gate();
      return hintError;
    }),
    executeHint: vi.fn(async () => {
      base.calls.push("apply");
      await gate();
      return undefined;
    }),
  });
  const release = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    pending.shift()?.();
  };
  return {
    ...base,
    release,
    setHintError: (e: string | undefined) => {
      hintError = e;
    },
  };
}

describe("Hint presses coalesce while one is in flight (coalesce-hint-requests)", () => {
  it("presses during a slow show are dropped, and the show still arms", async () => {
    const { puzzle, calls, release } = makeSlowPuzzle();
    const first = puzzle.hint();
    // Dropped: nothing to apply yet, nothing queued. Asserted before awaiting
    // them, so a regression to queuing fails here rather than hanging on a
    // gate nothing releases (the file's test timeout is an hour).
    const dropped = [puzzle.hint(), puzzle.hint()];
    expect(calls).toEqual(["show"]);
    expect(puzzle.hintArmedToApply).toBe(false);
    await release();
    await first;
    expect(await Promise.all(dropped)).toEqual([undefined, undefined]);
    expect(puzzle.hintArmedToApply).toBe(true);
    // The next press is the apply — the rhythm survived the dropped presses.
    const apply = puzzle.hint();
    await release();
    await apply;
    expect(calls).toEqual(["show", "apply"]);
  });

  it("presses during a slow apply are dropped, and the next press shows", async () => {
    const { puzzle, calls, release } = makeSlowPuzzle();
    const show = puzzle.hint();
    await release();
    await show;
    const apply = puzzle.hint(); // disarms on the way in
    const dropped = puzzle.hint();
    // The apply reaches the worker through `enqueueInput`, a tick later.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual(["show", "apply"]);
    await release();
    await apply;
    expect(await dropped).toBeUndefined();
    const next = puzzle.hint();
    await release();
    await next;
    expect(calls).toEqual(["show", "apply", "show"]);
  });

  it("a show that lands after Auto-Hint started does not arm behind it", async () => {
    const { puzzle, calls, release, workerPuzzle } = makeSlowPuzzle();
    // Auto-Hint asks for the move's animation length after each apply.
    (
      workerPuzzle as unknown as { currentAnimationMs: () => Promise<number> }
    ).currentAnimationMs = async () => 0;
    const show = puzzle.hint();
    puzzle.startAutoHint(); // its loop's first apply is now in flight too
    await release(); // answers the show, oldest first
    await show;
    expect(puzzle.hintArmedToApply).toBe(false);
    puzzle.stopAutoHint();
    await release(); // lets the loop's apply finish
    expect(calls.slice(0, 2)).toEqual(["show", "apply"]);
  });
});

describe("a slow hint says it is thinking (coalesce-hint-requests)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** `release` waits a macrotask, so drive it under fake timers explicitly. */
  const releaseUnderFakeTimers = async (release: () => Promise<void>) => {
    const done = release();
    await vi.advanceTimersByTimeAsync(0);
    await done;
  };

  it("labels a press unanswered for HINT_PENDING_MS, and clears when it lands", async () => {
    const { puzzle, release } = makeSlowPuzzle();
    const show = puzzle.hint();
    await vi.advanceTimersByTimeAsync(HINT_PENDING_MS - 1);
    expect(puzzle.hintPending).toBe(false);
    expect(puzzle.autoHintMessage).toBe("");
    await vi.advanceTimersByTimeAsync(1);
    expect(puzzle.hintPending).toBe(true);
    expect(puzzle.autoHintMessage).toBe(HINT_PENDING_MESSAGE);
    await releaseUnderFakeTimers(release);
    await show;
    // The show succeeded: nothing else replaced the message, so it is taken
    // down rather than left under the explanation; and the press armed.
    expect(puzzle.hintPending).toBe(false);
    expect(puzzle.autoHintMessage).toBe("");
    expect(puzzle.hintArmedToApply).toBe(true);
  });

  it("never labels a hint that answers in time", async () => {
    const { puzzle, release } = makeSlowPuzzle();
    const show = puzzle.hint();
    await vi.advanceTimersByTimeAsync(HINT_PENDING_MS / 2);
    await releaseUnderFakeTimers(release);
    await show;
    await vi.advanceTimersByTimeAsync(HINT_PENDING_MS * 2);
    expect(puzzle.hintPending).toBe(false);
    expect(puzzle.autoHintMessage).toBe("");
  });

  it("a refusal that lands late replaces the label rather than being wiped by it", async () => {
    const { puzzle, release, setHintError } = makeSlowPuzzle();
    setHintError("Fix the highlighted mistakes first");
    const show = puzzle.hint();
    await vi.advanceTimersByTimeAsync(HINT_PENDING_MS);
    expect(puzzle.autoHintMessage).toBe(HINT_PENDING_MESSAGE);
    await releaseUnderFakeTimers(release);
    await show;
    expect(puzzle.hintPending).toBe(false);
    expect(puzzle.autoHintMessage).toBe("Fix the highlighted mistakes first");
  });
});
