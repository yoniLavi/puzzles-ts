import { describe, expect, it } from "vitest";
import {
  DIFF_EASY,
  clueChar as magnetsClueChar,
  validateParams as magnetsValidateParams,
} from "../games/magnets/state.ts";
import { validateParams as singlesValidateParams } from "../games/singles/state.ts";
import {
  c2n,
  c2nUpper,
  DESC_ALPHABET_SIZE,
  n2c,
  n2cUpper,
  UPPER_ALPHABET_SIZE,
} from "./desc-alphabet.ts";

describe("the desc digit alphabet", () => {
  it("round-trips every value it covers", () => {
    const seen = new Set<string>();
    for (let n = 0; n < DESC_ALPHABET_SIZE; n++) {
      const ch = n2c(n);
      expect(ch, `n2c(${n})`).toHaveLength(1);
      expect(c2n(ch), `c2n(n2c(${n}))`).toBe(n);
      seen.add(ch);
    }
    // The alphabet is 62 *distinct* characters — an off-by-one in any branch
    // collides two values onto one character, which the round-trip above would
    // still pass for whichever of the two it checked second.
    expect(seen.size).toBe(DESC_ALPHABET_SIZE);
    expect([...seen].join("")).toBe(
      "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
    );
  });

  it("round-trips every character it accepts", () => {
    let accepted = 0;
    for (let code = 0; code < 128; code++) {
      const ch = String.fromCharCode(code);
      const n = c2n(ch);
      if (n === -1) continue;
      accepted++;
      expect(n2c(n), `n2c(c2n(${JSON.stringify(ch)}))`).toBe(ch);
    }
    expect(accepted).toBe(DESC_ALPHABET_SIZE); // vacuity: nothing else is legal
  });

  it("refuses a value it cannot write, rather than writing punctuation", () => {
    // Upstream's arithmetic ran off the end of `A`-`Z` silently, which is how
    // two games shipped a description their own `validateDesc` rejects.
    expect(() => n2c(DESC_ALPHABET_SIZE)).toThrow(RangeError);
    expect(() => n2c(-1)).toThrow(RangeError);
    expect(() => n2c(1.5)).toThrow(RangeError);
  });

  it("bounds both games to numbers it can write", () => {
    // Derived, not asserted against a literal: find the largest square board
    // each game admits, then check the largest number that board can need is
    // one the alphabet expresses. Singles holds `1..max(w,h)` per cell; a
    // Magnets row clue counts up to `w` magnets.
    const largest = (validate: (n: number) => string | null): number => {
      for (let n = 200; n >= 2; n--) if (validate(n) === null) return n;
      throw new Error("no accepted board size — the scan is measuring nothing");
    };

    const singlesMax = largest((n) =>
      singlesValidateParams({ w: n, h: n, diff: "easy" }, true),
    );
    const magnetsMax = largest((n) =>
      magnetsValidateParams({ w: n, h: n, diff: DIFF_EASY, stripclues: false }, true),
    );

    expect(singlesMax).toBeGreaterThan(10); // vacuity: a real board, not 2×2
    expect(magnetsMax).toBeGreaterThan(10);
    expect(c2n(n2c(singlesMax))).toBe(singlesMax);
    expect(c2n(n2c(magnetsMax))).toBe(magnetsMax);
  });

  it("leaves Magnets' no-clue sentinel with Magnets", () => {
    expect(magnetsClueChar(-1)).toBe(".");
    expect(magnetsClueChar(0)).toBe("0");
    expect(magnetsClueChar(61)).toBe("Z");
    // The sentinel is not in the shared alphabet, in either direction.
    expect(c2n(".")).toBe(-1);
  });
});

describe("the run-length value alphabet", () => {
  it("round-trips every value it covers, and only those", () => {
    const seen = new Set<string>();
    for (let n = 0; n < UPPER_ALPHABET_SIZE; n++) {
      const ch = n2cUpper(n);
      expect(ch, `n2cUpper(${n})`).toHaveLength(1);
      expect(c2nUpper(ch), `c2nUpper(n2cUpper(${n}))`).toBe(n);
      seen.add(ch);
    }
    expect([...seen].join("")).toBe("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    expect(() => n2cUpper(UPPER_ALPHABET_SIZE)).toThrow(RangeError);
    expect(() => n2cUpper(-1)).toThrow(RangeError);
  });

  it("gives a lowercase letter no value, because there it is a blank run", () => {
    // The whole reason the second alphabet exists: `run-length.ts` has spent
    // `a`–`z`, so a value above nine must be a capital and a lowercase letter
    // reaching this codec is a bug in the caller, not a value.
    let accepted = 0;
    for (let code = 0; code < 128; code++) {
      const ch = String.fromCharCode(code);
      if (c2nUpper(ch) === -1) continue;
      accepted++;
      expect(ch, ch).not.toMatch(/[a-z]/);
    }
    expect(accepted).toBe(UPPER_ALPHABET_SIZE);
    // And the two alphabets agree on the digits, where they overlap.
    for (let n = 0; n <= 9; n++) expect(n2cUpper(n)).toBe(n2c(n));
  });
});
