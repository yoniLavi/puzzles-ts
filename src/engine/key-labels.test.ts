import { describe, expect, it } from "vitest";
import { CLEAR_BUTTON, clearKey, digitKeys } from "./key-labels.ts";

const C = (s: string) => s.charCodeAt(0);

describe("digitKeys", () => {
  it("builds 1..9 plus the clear key", () => {
    expect(digitKeys(9)).toEqual([
      { button: C("1"), label: "1" },
      { button: C("2"), label: "2" },
      { button: C("3"), label: "3" },
      { button: C("4"), label: "4" },
      { button: C("5"), label: "5" },
      { button: C("6"), label: "6" },
      { button: C("7"), label: "7" },
      { button: C("8"), label: "8" },
      { button: C("9"), label: "9" },
      { button: CLEAR_BUTTON, label: "Clear" },
    ]);
  });

  it("builds 1..4 plus the clear key for a small board", () => {
    expect(digitKeys(4)).toEqual([
      { button: C("1"), label: "1" },
      { button: C("2"), label: "2" },
      { button: C("3"), label: "3" },
      { button: C("4"), label: "4" },
      { button: CLEAR_BUTTON, label: "Clear" },
    ]);
  });

  it("rolls past 9 into 'a','b',… (upstream `'a' + i - 9`)", () => {
    const keys = digitKeys(11);
    expect(keys).toHaveLength(12); // 11 digits + clear
    expect(keys[8]).toEqual({ button: C("9"), label: "9" });
    expect(keys[9]).toEqual({ button: C("a"), label: "a" });
    expect(keys[10]).toEqual({ button: C("b"), label: "b" });
    expect(keys[11]).toEqual(clearKey);
  });

  it("uses ASCII backspace as the clear button code", () => {
    expect(CLEAR_BUTTON).toBe(8);
    expect(clearKey).toEqual({ button: 8, label: "Clear" });
  });
});
