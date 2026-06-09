import { describe, expect, it } from "vitest";
import type { ChangeNotification } from "../../../puzzle/types.ts";
import { Midend } from "../../engine/midend.ts";
import {
  CURSOR_DOWN,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  LEFT_BUTTON,
  LEFT_DRAG,
  LEFT_RELEASE,
} from "../../engine/pointer.ts";
import { sixteenGame } from "./index.ts";
import type { SixteenMove } from "./state.ts";

function harness() {
  const notes: ChangeNotification[] = [];
  let redraws = 0;
  const m = new Midend(sixteenGame);
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

    // activeHint should be set
    const mPrivate = h.m as unknown as { activeHint: { move: SixteenMove } | null };
    expect(mPrivate.activeHint).toBeDefined();
    expect(mPrivate.activeHint).not.toBeNull();

    // Verify activeHint is row 0
    const activeHint = mPrivate.activeHint;
    expect(activeHint).not.toBeNull();
    if (activeHint && activeHint.move.type === "slide") {
      expect(activeHint.move.axis).toBe("row");
      expect(activeHint.move.index).toBe(0);
    } else {
      expect.fail("Expected active hint move to be a slide");
    }

    // Make an on-track move: slide row 0 right by 1
    h.m.processInput(0, 0, CURSOR_SELECT); // Show cursor first at (0, 0)
    h.m.processInput(0, 0, 0x2000 | CURSOR_RIGHT); // Shift+CURSOR_RIGHT: slide row 0 right

    // Since it's on-track and hasn't solved the tile position yet, the hint should STILL be active!
    expect(mPrivate.activeHint).toBeDefined();
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

    // activeHint should be set
    const mPrivate = h.m as unknown as { activeHint: { move: SixteenMove } | null };
    expect(mPrivate.activeHint).toBeDefined();
    expect(mPrivate.activeHint).not.toBeNull();

    // Slide row 0 right by 1 step.
    h.m.processInput(0, 0, CURSOR_SELECT); // Show cursor first at (0, 0)
    h.m.processInput(0, 0, 0x2000 | CURSOR_RIGHT); // Shift+CURSOR_RIGHT: slide row 0 right

    // Still active
    expect(mPrivate.activeHint).toBeDefined();
    expect(mPrivate.activeHint).not.toBeNull();

    // Slide row 0 right by 1 step again. Now tile 3 will reach its target col 2!
    h.m.processInput(0, 0, 0x2000 | CURSOR_RIGHT); // Shift+CURSOR_RIGHT: slide row 0 right

    // Since the hint was applied, activeHint should be cleared!
    expect(mPrivate.activeHint).toBeNull();
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

  it("keeps activeHint highlights during move animation and clears them on completion", () => {
    const h = harness();
    h.m.setParams("3x3");
    h.m.newGame();
    expect(h.state()?.status).toBe("ongoing");

    const err = h.m.executeHint();
    expect(err).toBeUndefined();

    const mPrivate = h.m as unknown as {
      activeHint: { move: SixteenMove } | null;
      animLength: number;
    };
    expect(mPrivate.activeHint).not.toBeNull();
    expect(mPrivate.activeHint?.move).toBeDefined();

    // Hint-executed moves animate in slow motion: 0.4s ANIM_TIME
    // stretched by HINT_ANIM_SCALE (2.5) to 1.0s.
    expect(mPrivate.animLength).toBeCloseTo(1.0);

    // Still animating well past the normal 0.4s settle point.
    h.m.timer(0.45);
    expect(mPrivate.activeHint).not.toBeNull();

    // Settle the stretched animation (total 1.05 > 1.0).
    h.m.timer(0.6);
    expect(mPrivate.activeHint).toBeNull();

    // A manual move is NOT stretched: it settles at the game's own 0.4s.
    h.m.processInput(0, 0, CURSOR_SELECT);
    h.m.processInput(0, 0, 0x2000 | CURSOR_RIGHT); // shift + cursor_right
    expect(mPrivate.animLength).toBeCloseTo(0.4);
  });
});
