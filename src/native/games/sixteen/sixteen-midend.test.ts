import { describe, expect, it } from "vitest";
import type { ChangeNotification } from "../../../puzzle/types.ts";
import {
  CURSOR_RIGHT,
  CURSOR_SELECT,
} from "../../engine/pointer.ts";
import { Midend } from "../../engine/midend.ts";
import { sixteenGame } from "./index.ts";

function harness() {
  const notes: ChangeNotification[] = [];
  let redraws = 0;
  const m = new Midend(sixteenGame);
  m.setCallbacks(
    (n) => notes.push(n),
    () => {},
    () => { redraws++; },
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
