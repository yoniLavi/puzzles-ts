/**
 * "a 8" is the article trap (docs/games/hints.md § "Name a square by its
 * value"): a sentence that puts "a" before a number reads wrong at 8, 11 and
 * 18. Six sentences in four games shipped it until the hint text moved into
 * one file per game and a single sweep could see them all. Each is pinned here
 * at the value that exposed it, beside a value that must keep "a".
 */

import { describe, expect, it } from "vitest";
import { say as crossing } from "../games/crossing/hint-text.ts";
import { say as dominosa } from "../games/dominosa/hint-text.ts";
import { say as keen } from "../games/keen/hint-text.ts";
import { say as solo } from "../games/solo/hint-text.ts";
import { indefinite } from "./hint-text.ts";

type SharedDigit = Parameters<typeof crossing.sharedDigit>[0];
type NoteStrike = Parameters<typeof crossing.noteStrike>[0];

describe("a number after an article gets the article it is pronounced with", () => {
  it("indefinite picks by pronunciation, and capitalizes on request", () => {
    expect(["8", "11", "18", "80", "3", "1", "12"].map((s) => indefinite(s))).toEqual([
      "an",
      "an",
      "an",
      "an",
      "a",
      "a",
      "a",
    ]);
    expect(indefinite("8", true)).toBe("An");
    expect(indefinite("3", true)).toBe("A");
  });

  it("Keen's cage line", () => {
    expect(keen.cageLine(0, 15, 8, true)).toContain("places an 8 in this row");
    expect(keen.cageLine(0, 15, 3, false)).toContain("places a 3 in this column");
  });

  it("Solo's duplicate", () => {
    expect(solo.dup(8)).toMatch(/^An 8 is already placed/);
    expect(solo.dup(3)).toMatch(/^A 3 is already placed/);
  });

  it("Crossing's shared digit and single note strike", () => {
    const shared = (digit: number, deep: boolean) =>
      crossing.sharedDigit(
        { technique: "sharedDigit", digit, deep } as SharedDigit,
        true,
      );
    expect(shared(8, false)).toContain("has an 8 in this square");
    expect(shared(8, true)).toContain("has an 8 here");
    expect(shared(3, false)).toContain("has a 3 in this square");
    const strike = (digits: number[]) =>
      crossing.noteStrike({ technique: "noteStrike", digits } as NoteStrike, false);
    expect(strike([8])).toContain("puts an 8 in this square");
    expect(strike([3])).toContain("puts a 3 in this square");
  });

  it("Dominosa's duplicate dominoes", () => {
    expect(dominosa.barrier("localDuplicate", 8, 8)).toMatch(/^An 8–8 domino here/);
    expect(dominosa.barrier("localDuplicate", 1, 8)).toMatch(/^A 1–8 domino here/);
  });
});
