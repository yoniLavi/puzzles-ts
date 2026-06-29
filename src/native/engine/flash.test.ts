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

  it("does not flash when the solve was reached by cheating (from)", () => {
    expect(winFlash(s(true, true), s(true, true), FLASH)).toBe(0);
  });

  it("does not flash when the move itself is the cheat (to)", () => {
    expect(winFlash(s(false, false), s(true, true), FLASH)).toBe(0);
  });

  it("passes the caller's flashTime through", () => {
    expect(winFlash(s(false, false), s(true, false), 0.7)).toBe(0.7);
  });
});
