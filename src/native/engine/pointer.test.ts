import { describe, expect, it } from "vitest";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_UP,
  cursorDelta,
  LEFT_BUTTON,
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
