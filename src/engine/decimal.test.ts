/**
 * The decimal digit fact, and the guard that no game restates it.
 *
 * The scan below is the desc-side successor of the digit-key scan that
 * `emittable-keys.test.ts` § 3 carried until 2026-09-12. That one looked for a
 * digit code *against the button*, under every name the collection gives the
 * button, and stated its blind spot: a helper receiving the button under yet
 * another name. Once no desc site spelled a digit code either, the scan could
 * widen to **any operand position in any game source**, and the blind spot
 * closed for the digits by construction — the name the value travels under no
 * longer matters. What it still cannot see, stated: a constant holding a digit
 * code and passed as an *argument* (Salad's `BASE_DIGIT` was one), which is
 * the same shape one level up.
 */
import { describe, expect, it } from "vitest";
import { digitValue, isDigit, parseLeadingInt } from "./decimal.ts";
import { c2n } from "./desc-alphabet.ts";
import { digitOf } from "./pointer.ts";
import {
  builtGames,
  codeLinesMatching,
  SCANNED_SOURCE_FILES,
} from "./testing/enrollment.ts";

describe("isDigit / digitValue", () => {
  it("accepts exactly the ten digit characters", () => {
    let accepted = 0;
    for (let code = 0; code < 128; code++) {
      const ch = String.fromCharCode(code);
      if (!isDigit(ch)) {
        expect(digitValue(ch), JSON.stringify(ch)).toBe(-1);
        continue;
      }
      accepted++;
      expect(digitValue(ch), JSON.stringify(ch)).toBe(Number(ch));
    }
    expect(accepted).toBe(10);
    // An empty string is a character that is not a digit, not an error.
    expect(isDigit("")).toBe(false);
    expect(digitValue("")).toBe(-1);
  });

  it("agrees with the desc alphabet and the key map on every digit", () => {
    // Three spellings of one fact — a character, a desc character, a key —
    // held equal so the fact cannot fork between layers.
    for (let n = 0; n <= 9; n++) {
      const ch = String(n);
      expect(digitValue(ch)).toBe(n);
      expect(c2n(ch)).toBe(n);
      expect(digitOf(ch.charCodeAt(0))).toBe(n);
    }
  });
});

describe("parseLeadingInt", () => {
  it("parses a WxH param string in two hops", () => {
    const a = parseLeadingInt("10x7", 0);
    expect(a).toEqual({ value: 10, next: 2 });
    const b = parseLeadingInt("10x7", a.next + 1);
    expect(b).toEqual({ value: 7, next: 4 });
  });

  it("returns 0 with no advance on a non-digit, matching atoi", () => {
    // `next === start` is how a caller tells "no number here" from "zero".
    expect(parseLeadingInt("dn", 0)).toEqual({ value: 0, next: 0 });
    expect(parseLeadingInt("0,", 0)).toEqual({ value: 0, next: 1 });
  });

  it("stops at the first non-digit", () => {
    expect(parseLeadingInt("7x7dn", 2)).toEqual({ value: 7, next: 3 });
  });

  it("handles a digit run extending to the end of the string", () => {
    expect(parseLeadingInt("123", 0)).toEqual({ value: 123, next: 3 });
  });

  it("starts past the end without throwing", () => {
    expect(parseLeadingInt("12", 5)).toEqual({ value: 0, next: 5 });
  });
});

/**
 * `'0'`, `'1'` and `'9'` in decimal, and every digit in hex. A range test or an
 * offset always spells the zero code (`48`, or `49` for a range from one), so
 * this loses no real site — while `50`–`56` in decimal are left out on
 * purpose: `if (w > 50)` is a count, and three games write one.
 */
const DIGIT_CODE = "(?:48|49|57|0x3[0-9])";

/**
 * Every way a game source has restated the digit fact, keyed on the **shape**
 * and never on a name:
 *
 * - a digit code as an operand — compared, subtracted, added, or a `case`
 *   label (`c >= 48`, `code - 0x30`, `48 + n`, `case 49:`);
 * - a relational comparison against a one-digit string (`c >= "0"`,
 *   `tok.value <= "4"` — the range with a bound baked in);
 * - a digit character's code taken by hand (`"0".charCodeAt(0)`).
 *
 * A digit code that is not an operand is not matched: `PREFERRED_TILE_SIZE =
 * 48`, `autosize: 48`, `ts / 48`, `NK(57)` and `0.48` are sizes, and a plain
 * `=` is an assignment rather than a comparison. Equality against a specific
 * character (`c === "1"`) is a game's own meaning and is not matched either.
 */
const DIGIT_SHAPES = [
  new RegExp(String.raw`(?:[<>]=?|[=!]==|-|\+)\s*(?<![\d.])${DIGIT_CODE}\b`),
  new RegExp(String.raw`(?<![\w.])${DIGIT_CODE}\s*\+`),
  new RegExp(String.raw`\bcase\s+${DIGIT_CODE}\s*:`),
  /[<>]=?\s*"[0-9]"/,
  /"[0-9]"\.charCodeAt/,
];

const restates = (line: string): boolean => DIGIT_SHAPES.some((re) => re.test(line));

describe("no game restates the decimal digit fact", () => {
  it("finds each shape it claims to find", () => {
    // Proved on planted copies of the shapes the sweep removed, so an edit to a
    // regex that stops matching one fails here rather than passing over a
    // clean-looking collection.
    for (const snippet of [
      "if (button >= 48 && button <= 57) n = button - 48;",
      "if (btn >= 0x30 && btn <= 0x39) number = btn - 0x30;",
      "n = n * 10 + (s.charCodeAt(i) - 48);",
      "v = c.charCodeAt(0) - 0x30;",
      "out += String.fromCharCode(48 + clue);",
      "if (code < 48 || code > 48 + m) return bad;",
      "case 49:",
      'if (c >= "0" && c <= "9") num += c;',
      'else if (tok.value >= "0" && tok.value <= "4") squares++;',
      'const ZERO = "0".charCodeAt(0);',
    ]) {
      expect(restates(snippet), snippet).toBe(true);
    }
    // …and stays quiet on the shapes that legitimately remain.
    for (const snippet of [
      "export const PREFERRED_TILE_SIZE = 48;",
      "  { autosize: 48, order: 9 },",
      "const pupil = f(ts / 48);",
      "button = NK(57);",
      "if (ratio < 0.48 || ratio > 0.78) continue;",
      "if (w > 50) return 'Width must be at most 50';",
      'grid[i] = c === "1" ? ONE : ZERO;',
      "const digit = digitValue(tok.value);",
      "if (button >= 97 && button <= 105) return button - 97;",
    ]) {
      expect(restates(snippet), snippet).toBe(false);
    }
  });

  it("finds none in the collection", () => {
    // Vacuity: an unmatched glob would scan nothing and report health.
    expect(SCANNED_SOURCE_FILES).toBeGreaterThan(250);
    const ids = builtGames().map((g) => g.id);
    expect(ids.length).toBeGreaterThanOrEqual(57);
    // Comment-stripped, because a comment is not a use: `// 97 = 'a'` and a
    // `untangle.c:57` citation would otherwise both hit.
    const hits = codeLinesMatching(ids, /./).filter(({ line }) => restates(line));
    // Roughly 110 sites in some 40 files restated it before `decimal.ts`
    // (measured 2026-09-12, `share-the-desc-digit-fact` D1). Excusing a line —
    // a pixel offset that happens to be `- 48` — goes in a ledger asserted
    // equal to what the scan found, never in a narrower regex.
    expect(hits.map((h) => `${h.id}: ${h.line}`)).toEqual([]);
  });
});
