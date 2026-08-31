import { describe, expect, it } from "vitest";
import { winFlash } from "./flash.ts";

const s = (completed: boolean, cheated: boolean) => ({ completed, cheated });
const FLASH = 0.4;

describe("winFlash", () => {
  it("flashes on a fresh, un-cheated unsolved→solved transition", () => {
    expect(winFlash(s(false, false), s(true, false), FLASH)).toBe(FLASH);
  });

  it("does not flash when the board was already solved", () => {
    expect(winFlash(s(true, false), s(true, false), FLASH)).toBe(0);
  });

  it("does not flash when the move does not reach a solved state", () => {
    expect(winFlash(s(false, false), s(false, false), FLASH)).toBe(0);
  });

  it("does not flash when the board was already solved, by Solve", () => {
    expect(winFlash(s(true, true), s(true, true), FLASH)).toBe(0);
  });

  it("does not flash when the move itself is the Solve command", () => {
    // The suppressed thing is the *move* where `cheated` flips false→true.
    expect(winFlash(s(false, false), s(true, true), FLASH)).toBe(0);
  });

  it("flashes a manual completion made after a prior Solve", () => {
    // The case the older, stricter rule got wrong, reported by a player:
    // use Solve, unmark some cells, solve it by hand — and get no
    // celebration, because the gate vetoed any board that had *ever* been
    // cheated rather than the Solve move itself. That is a win.
    expect(winFlash(s(false, true), s(true, true), FLASH)).toBe(FLASH);
  });

  it("still does not flash on a move that breaks a solved board", () => {
    // The other direction of the same transition, cheated or not.
    expect(winFlash(s(true, false), s(false, false), FLASH)).toBe(0);
    expect(winFlash(s(true, true), s(false, true), FLASH)).toBe(0);
  });

  it("passes the caller's flashTime through", () => {
    expect(winFlash(s(false, false), s(true, false), 0.7)).toBe(0.7);
  });
});
