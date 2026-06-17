import { describe, expect, it } from "vitest";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_UP,
  cursorDelta,
  gridCursorMove,
  isCursorMove,
  LEFT_BUTTON,
  MOD_CTRL,
  MOD_MASK,
  MOD_NUM_KEYPAD,
  MOD_SHFT,
  stripModifiers,
} from "./pointer.ts";

describe("cursorDelta", () => {
  it("returns the unit delta for each cursor direction", () => {
    expect(cursorDelta(CURSOR_UP)).toEqual({ dx: 0, dy: -1 });
    expect(cursorDelta(CURSOR_DOWN)).toEqual({ dx: 0, dy: 1 });
    expect(cursorDelta(CURSOR_LEFT)).toEqual({ dx: -1, dy: 0 });
    expect(cursorDelta(CURSOR_RIGHT)).toEqual({ dx: 1, dy: 0 });
  });

  it("returns null for non-direction buttons", () => {
    expect(cursorDelta(LEFT_BUTTON)).toBeNull();
    expect(cursorDelta(CURSOR_SELECT)).toBeNull();
    expect(cursorDelta(0)).toBeNull();
  });
});

describe("stripModifiers", () => {
  it("clears every modifier bit, preserving the base button", () => {
    // MOD_MASK (0x7800) covers the three named modifiers plus upstream's
    // reserved 0x0800 bit, so it is a superset of their OR.
    expect(MOD_MASK & (MOD_CTRL | MOD_SHFT | MOD_NUM_KEYPAD)).toBe(
      MOD_CTRL | MOD_SHFT | MOD_NUM_KEYPAD,
    );
    expect(stripModifiers(CURSOR_UP | MOD_CTRL)).toBe(CURSOR_UP);
    expect(stripModifiers(CURSOR_LEFT | MOD_SHFT | MOD_NUM_KEYPAD)).toBe(
      CURSOR_LEFT,
    );
    expect(stripModifiers(LEFT_BUTTON)).toBe(LEFT_BUTTON);
  });

  it("preserves unrelated high bits outside MOD_MASK", () => {
    const HIGH = 0x10000;
    expect(stripModifiers(CURSOR_DOWN | MOD_SHFT | HIGH)).toBe(
      CURSOR_DOWN | HIGH,
    );
  });
});

describe("isCursorMove", () => {
  it("is true only for the four direction keys", () => {
    expect(isCursorMove(CURSOR_UP)).toBe(true);
    expect(isCursorMove(CURSOR_RIGHT)).toBe(true);
    expect(isCursorMove(CURSOR_SELECT)).toBe(false);
    expect(isCursorMove(LEFT_BUTTON)).toBe(false);
  });
});

describe("gridCursorMove", () => {
  it("moves and clamps within a bounded grid", () => {
    expect(gridCursorMove(CURSOR_RIGHT, 1, 2, 4, 4)).toEqual({ x: 2, y: 2 });
    expect(gridCursorMove(CURSOR_LEFT, 1, 3, 4, 4)).toEqual({ x: 0, y: 3 });
  });

  it("returns null on a no-op against a clamped edge", () => {
    expect(gridCursorMove(CURSOR_LEFT, 0, 3, 4, 4)).toBeNull();
    expect(gridCursorMove(CURSOR_DOWN, 0, 3, 4, 4)).toBeNull();
  });

  it("wraps toroidally when wrap is set, never no-op at an edge", () => {
    expect(gridCursorMove(CURSOR_LEFT, 0, 3, 4, 4, true)).toEqual({
      x: 3,
      y: 3,
    });
    expect(gridCursorMove(CURSOR_DOWN, 1, 3, 4, 4, true)).toEqual({
      x: 1,
      y: 0,
    });
  });

  it("returns null for a non-cursor button", () => {
    expect(gridCursorMove(LEFT_BUTTON, 1, 1, 4, 4)).toBeNull();
  });
});
