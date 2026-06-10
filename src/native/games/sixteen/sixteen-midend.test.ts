import { describe, expect, it } from "vitest";
import type { ChangeNotification } from "../../../puzzle/types.ts";
import { Midend } from "../../engine/midend.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
} from "../../engine/pointer.ts";
import { sixteenGame } from "./index.ts";
import type { SixteenMove } from "./state.ts";

/** The midend stores the hint plan privately; tests reach in to
 * assert the stored plan's shape and current step. */
interface PrivateHintView {
  activeHint: { steps: { move: SixteenMove }[]; index: number } | null;
  animLength: number;
}

function harness(game: typeof sixteenGame = sixteenGame) {
  const notes: ChangeNotification[] = [];
  let redraws = 0;
  const m = new Midend(game);
  m.setCallbacks(
    (n) => notes.push(n),
    () => {},
    () => {
      redraws++;
    },
  );
  const last = <T extends ChangeNotification["type"]>(type: T) =>
    [...notes].reverse().find((n) => n.type === type);
  const state = () =>
    last("game-state-change") as
      | Extract<ChangeNotification, { type: "game-state-change" }>
      | undefined;
  return { m, notes, state, redraws: () => redraws, last };
}

// --- lifecycle --------------------------------------------------------

describe("Sixteen midend integration — lifecycle", () => {
  it("newGame emits state notifications", () => {
    const h = harness();
    h.m.newGame();
    const types = new Set(h.notes.map((n) => n.type));
    expect(types).toContain("game-id-change");
    expect(types).toContain("params-change");
    expect(types).toContain("game-state-change");
    expect(h.state()?.status).toBe("ongoing");
  });

  it("restartGame resets to initial state", () => {
    const h = harness();
    h.m.newGame();
    const initialMoveCount = h.state()?.currentMove ?? 0;
    // Show cursor first, then make a move.
    h.m.processInput(0, 0, CURSOR_SELECT);
    h.m.processInput(0, 0, 0x2000 | CURSOR_RIGHT); // shift + cursor_right
    const afterMove = h.state()?.currentMove ?? 0;
    expect(afterMove).toBeGreaterThan(initialMoveCount);
    h.m.restartGame();
    expect(h.state()?.currentMove).toBe(0);
  });

  it("newGameFromId creates a game from a known id", () => {
    const h = harness();
    const err = h.m.newGameFromId("3x3:1,2,3,4,5,6,7,8,9");
    expect(err).toBeUndefined();
    expect(h.state()?.status).toBe("ongoing");
  });
});

// --- keyboard input ---------------------------------------------------

describe("Sixteen midend integration — keyboard input", () => {
  it("cursor keys move the cursor (UI update)", () => {
    const h = harness();
    h.m.newGame();
    // Show cursor.
    h.m.processInput(0, 0, CURSOR_SELECT);
    // Move cursor right.
    h.m.processInput(0, 0, CURSOR_RIGHT);
    // Just verify no crash — the cursor position is internal UI state.
  });

  it("shift+cursor makes a slide move", () => {
    const h = harness();
    h.m.newGame();
    const before = h.state()?.currentMove ?? 0;
    // Show cursor first.
    h.m.processInput(0, 0, CURSOR_SELECT);
    // Shift+cursor_right = slide row right.
    h.m.processInput(0, 0, 0x2000 | CURSOR_RIGHT);
    const after = h.state()?.currentMove ?? 0;
    expect(after).toBeGreaterThan(before);
  });
});

// --- undo -------------------------------------------------------------

describe("Sixteen midend integration — undo", () => {
  it("undo reverses a move", () => {
    const h = harness();
    h.m.newGame();
    const before = h.state()?.currentMove ?? 0;
    // Show cursor and make a move.
    h.m.processInput(0, 0, CURSOR_SELECT);
    h.m.processInput(0, 0, 0x2000 | CURSOR_RIGHT);
    const after = h.state()?.currentMove ?? 0;
    expect(after).toBeGreaterThan(before);
    // Undo.
    h.m.undo();
    expect(h.state()?.currentMove).toBe(before);
    expect(h.state()?.canUndo).toBe(false);
  });
});

// --- presets ----------------------------------------------------------

describe("Sixteen midend integration — presets", () => {
  it("getPresets returns 5 presets", () => {
    const h = harness();
    const p = h.m.getPresets();
    expect(p).toHaveLength(5);
  });

  it("setParams changes the game size", () => {
    const h = harness();
    const err = h.m.setParams("3x3");
    expect(err).toBeUndefined();
    h.m.newGame();
    // The game should now be 3×3 — check params-change notification.
    const params = h.last("params-change") as
      | Extract<ChangeNotification, { type: "params-change" }>
      | undefined;
    expect(params?.params).toContain("3x3");
  });
});

describe("Sixteen midend integration — drag-to-slide support", () => {
  it("dragging row 0 to the right by more than half a tile moves it", () => {
    const h = harness();
    h.m.newGame();
    const before = h.state()?.currentMove ?? 0;

    // Press on tile (0, 0), which is at x = 72, y = 72
    h.m.processInput(72, 72, LEFT_BUTTON);

    // Drag right by 30 pixels (72 + 30 = 102), which is more than half of 48 (24 pixels)
    h.m.processInput(102, 72, LEFT_DRAG);

    // Release the drag
    h.m.processInput(102, 72, LEFT_RELEASE);

    const after = h.state()?.currentMove ?? 0;
    expect(after).toBe(before + 1);
  });

  it("dragging row 0 to the right by less than half a tile does not move it", () => {
    const h = harness();
    h.m.newGame();
    const before = h.state()?.currentMove ?? 0;

    // Press on tile (0, 0)
    h.m.processInput(72, 72, LEFT_BUTTON);

    // Drag right by 10 pixels (72 + 10 = 82), which is less than half of 48 (24 pixels)
    h.m.processInput(82, 72, LEFT_DRAG);

    // Release the drag
    h.m.processInput(82, 72, LEFT_RELEASE);

    const after = h.state()?.currentMove ?? 0;
    expect(after).toBe(before);
  });
});

describe("Sixteen midend integration — hint persistence", () => {
  it("keeps target cell highlighted as long as user is on-track, and clears on finish or unrelated move", () => {
    const h = harness();
    h.m.newGameFromId("3x3:3,1,2,4,5,6,7,8,9"); // row 0 is shifted left by 1

    // Request a hint
    const exp = h.m.hint();
    expect(exp).toBeUndefined(); // Returns undefined on success

    // activeHint should hold a stored plan
    const mPrivate = h.m as unknown as PrivateHintView;
    expect(mPrivate.activeHint).not.toBeNull();

    // Verify the current step slides row 0
    const stepMove = mPrivate.activeHint?.steps[mPrivate.activeHint.index].move;
    if (stepMove?.type === "slide") {
      expect(stepMove.axis).toBe("row");
      expect(stepMove.index).toBe(0);
    } else {
      expect.fail("Expected the current hint step's move to be a slide");
    }

    // Make an on-track move: slide row 0 right by 1
    h.m.processInput(0, 0, CURSOR_SELECT); // Show cursor first at (0, 0)
    h.m.processInput(0, 0, 0x2000 | CURSOR_RIGHT); // Shift+CURSOR_RIGHT: slide row 0 right

    // Since it's on-track and hasn't landed the tile yet, the plan should STILL be active!
    expect(mPrivate.activeHint).not.toBeNull();

    // Now make an unrelated move: slide row 1 right.
    h.m.processInput(0, 0, CURSOR_DOWN); // Move cursor down to row 1
    h.m.processInput(0, 0, 0x2000 | CURSOR_RIGHT); // Shift+CURSOR_RIGHT: slide row 1 right

    // Now activeHint should be cleared because we manipulated an unrelated row!
    expect(mPrivate.activeHint).toBeNull();
  });

  it("keeps target cell highlighted as long as user is on-track, and clears when the hint is applied", () => {
    const h = harness();
    h.m.newGameFromId("3x3:3,1,2,4,5,6,7,8,9"); // row 0 is shifted left by 1

    // Request a hint
    const exp = h.m.hint();
    expect(exp).toBeUndefined(); // Returns undefined on success

    // activeHint should hold a stored plan
    const mPrivate = h.m as unknown as PrivateHintView;
    expect(mPrivate.activeHint).not.toBeNull();

    // Slide row 0 right by 1 step.
    h.m.processInput(0, 0, CURSOR_SELECT); // Show cursor first at (0, 0)
    h.m.processInput(0, 0, 0x2000 | CURSOR_RIGHT); // Shift+CURSOR_RIGHT: slide row 0 right

    // Still active
    expect(mPrivate.activeHint).not.toBeNull();

    // Slide row 0 right by 1 step again. Now tile 1 reaches the step's
    // target, completing the (single-step) plan: cleared.
    h.m.processInput(0, 0, 0x2000 | CURSOR_RIGHT); // Shift+CURSOR_RIGHT: slide row 0 right

    expect(mPrivate.activeHint).toBeNull();
  });

  it("a multi-leg journey stays displayed through its legs (owner board, 2026-06-10)", () => {
    // Owner-reported: landing the tile on the intermediate target made
    // the hint "reset" — the display hid mid-journey. A journey is one
    // hint: its flagged continuation steps must stay displayed; only
    // the step after the journey waits for a fresh request.
    const h = harness();
    h.m.newGameFromId(
      "5x5:1,2,3,4,6,7,13,8,9,5,11,12,18,14,15,16,17,24,19,20,21,22,23,10,25",
    );
    const banner = () => {
      const n = h.last("status-bar-change") as
        | Extract<ChangeNotification, { type: "status-bar-change" }>
        | undefined;
      return n?.activeHintExplanation;
    };
    expect(h.m.hint()).toBeUndefined();
    expect(banner()).toBe("Move tile 6 to column 4, then to row 2");

    // Leg 1: slide row 0 left by 1 (cursor at (0,0), shift+left).
    h.m.processInput(0, 0, CURSOR_SELECT);
    h.m.processInput(0, 0, 0x2000 | CURSOR_LEFT);
    // The journey continues: leg 2 is displayed without a new request.
    expect(banner()).toBe("Move tile 6 to row 2, then to column 5");

    // Leg 2: slide column 3 down by 1 (cursor right ×3, shift+down).
    h.m.processInput(0, 0, CURSOR_RIGHT);
    h.m.processInput(0, 0, CURSOR_RIGHT);
    h.m.processInput(0, 0, CURSOR_RIGHT);
    h.m.processInput(0, 0, 0x2000 | CURSOR_DOWN);
    expect(banner()).toBe("Move tile 6 to column 5");

    // Leg 3 ends the journey: slide row 1 right by 1.
    h.m.processInput(0, 0, CURSOR_DOWN);
    h.m.processInput(0, 0, 0x2000 | CURSOR_RIGHT);
    // Tile 6 is home; the next (unrelated) step waits to be asked for.
    expect(banner()).toBeUndefined();
    const mPrivate = h.m as unknown as PrivateHintView;
    expect(mPrivate.activeHint).not.toBeNull();
  });
});

// --- executeHint ------------------------------------------------------

describe("Sixteen midend integration — executeHint auto-play", () => {
  it("sequential executeHint calls solve a generated 3x3 board", () => {
    const h = harness();
    h.m.setParams("3x3");
    h.m.newGame();
    expect(h.state()?.status).toBe("ongoing");

    let steps = 0;
    const maxSteps = 100;
    while (h.state()?.status === "ongoing" && steps < maxSteps) {
      const hintErr = h.m.executeHint();
      expect(hintErr).toBeUndefined();
      steps++;
    }

    expect(h.state()?.status).toBe("solved");
    expect(steps).toBeGreaterThan(0);
  });

  it("keeps the executed step displayed through the animation, then advances", () => {
    const h = harness();
    h.m.setParams("3x3");
    h.m.newGame();
    expect(h.state()?.status).toBe("ongoing");

    const err = h.m.executeHint();
    expect(err).toBeUndefined();

    const mPrivate = h.m as unknown as PrivateHintView;
    expect(mPrivate.activeHint).not.toBeNull();
    const planLength = mPrivate.activeHint?.steps.length ?? 0;
    expect(planLength).toBeGreaterThan(0);
    expect(mPrivate.activeHint?.index).toBe(0);

    // Hint-executed moves animate in slow motion: 0.4s ANIM_TIME
    // stretched by HINT_ANIM_SCALE (2.5) to 1.0s.
    expect(mPrivate.animLength).toBeCloseTo(1.0);

    // Still animating well past the normal 0.4s settle point — the
    // executed step stays on display, describing the move in flight.
    h.m.timer(0.45);
    expect(mPrivate.activeHint?.index).toBe(0);

    // Settle the stretched animation (total 1.05 > 1.0): the plan
    // advances so the *next* step is previewed during the auto-play
    // rest period (or clears when the plan had a single step).
    h.m.timer(0.6);
    if (planLength > 1) {
      expect(mPrivate.activeHint?.index).toBe(1);
    } else {
      expect(mPrivate.activeHint).toBeNull();
    }

    // A manual move is NOT stretched: it settles at the game's own 0.4s.
    h.m.processInput(0, 0, CURSOR_SELECT);
    h.m.processInput(0, 0, 0x2000 | CURSOR_RIGHT); // shift + cursor_right
    expect(mPrivate.animLength).toBeCloseTo(0.4);
  });

  // The bidirectional search itself takes a few seconds when it
  // engages — that is the very cost this test pins to once-per-plan.
  it("crosses the two-swap 5x5 endgame on one stored plan (no per-step recompute)", {
    timeout: 30_000,
  }, () => {
    // Regression guard for the cost model: the exact bidirectional
    // fallback (~0.5-2s when it engages) must run once for the whole
    // endgame, not once per auto-played step — and executing one
    // stored plan verbatim is also what eliminates replan wobble.
    let hintCalls = 0;
    const countingGame: typeof sixteenGame = {
      ...sixteenGame,
      hint: (s) => {
        hintCalls += 1;
        const base = sixteenGame.hint;
        if (!base) throw new Error("sixteenGame.hint missing");
        return base(s);
      },
    };
    const h = harness(countingGame);
    // Tiles 1↔6 and 16↔20 swapped, everything else solved: a strict
    // local minimum the forward search cannot cross.
    const err = h.m.newGameFromId(
      "5x5:6,2,3,4,5,1,7,8,9,10,11,12,13,14,15,20,17,18,19,16,21,22,23,24,25",
    );
    expect(err).toBeUndefined();

    let guard = 0;
    while (h.state()?.status === "ongoing" && guard < 30) {
      expect(h.m.executeHint()).toBeUndefined();
      h.m.timer(1.5); // settle the slow-motion animation (1.0s) + flash
      guard++;
    }
    expect(h.state()?.status).toBe("solved");
    expect(hintCalls).toBe(1);
  });
});
