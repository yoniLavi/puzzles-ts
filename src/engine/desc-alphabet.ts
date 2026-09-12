/**
 * The desc **digit alphabet**: one character per small number, `0`–`9` then
 * `a`–`z` then `A`–`Z`, so 62 values fit in one character.
 *
 * This is a *value* codec, not a run-length one — every character stands for
 * exactly one cell. Singles' desc is one character per cell and Magnets' clue
 * lists are one character per row and column; both need to write a number
 * larger than nine in a single character, and both answered it the same way
 * because there is only one answer to give. Magnets' section header said so
 * outright: *"cloned from singles.c n2c/c2n"*.
 *
 * **The order is frozen.** It is baked into every shared game ID either game
 * has ever emitted, so `a` is 10 forever and no caller may reorder it. That is
 * also why neither game could legitimately want a different alphabet, which is
 * what makes this a convention rather than a decision.
 *
 * **A game's sentinel does not live here.** Magnets writes `.` for "no clue"
 * and Singles has no such concept; a shared codec that knows one game's
 * sentinel has taken on that game's meaning. Magnets handles its own `-1`
 * before delegating, exactly as `run-length.ts` leaves each game its own value
 * characters.
 *
 * **A run-length desc has a second alphabet, and it is here too.** Such a desc
 * has spent `a`–`z` on blank runs (`run-length.ts`), so a value above nine has
 * nowhere to go but the capitals: `0`–`9` then `A`–`Z`, thirty-six values,
 * {@link n2cUpper}/{@link c2nUpper}. Loopy's `CLUE2CHAR`, Bridges' `A`–`G`,
 * Tracks' nibble, Flood's `A`–`Z`-as-out-of-range and Pearl's aux were five
 * copies of it. Which of the two alphabets a desc uses is decided by whether
 * its grammar has run letters, which is why the pair sits beside the other one
 * rather than in `run-length.ts`: the contrast is the documentation.
 *
 * The four names are reserved: `decimal.test.ts` fails a game that declares
 * any of them, so a game's own codec (Unequal's `displayChar`/`charValue`,
 * Magnets' sentinel-aware `clueChar`) is named for what it does instead.
 */

import { digitValue } from "./decimal.ts";

/** How many values the alphabet covers: `0`–`9`, `a`–`z`, `A`–`Z`. */
export const DESC_ALPHABET_SIZE = 62;

/**
 * The character standing for `num`, which must be `0 <= num <
 * {@link DESC_ALPHABET_SIZE}`.
 *
 * Out of range is a programming error rather than a desc a player could type,
 * so it throws: the alternative is the silent arithmetic both games inherited,
 * which walks off the end of the alphabet into punctuation and writes a desc
 * that will not decode.
 */
export function n2c(num: number): string {
  if (num < 0 || num >= DESC_ALPHABET_SIZE || !Number.isInteger(num)) {
    throw new RangeError(`desc alphabet: ${num} is not a value it can write`);
  }
  if (num < 10) return String.fromCharCode(48 + num);
  if (num < 36) return String.fromCharCode(97 + num - 10);
  return String.fromCharCode(65 + num - 36);
}

/** The value `c` stands for, or `-1` if it is not a character of the alphabet.
 * `-1` rather than a throw because this reads descs, which arrive from URLs. */
export function c2n(c: string): number {
  const code = c.charCodeAt(0);
  if (code >= 48 && code <= 57) return code - 48;
  if (code >= 97 && code <= 122) return code - 97 + 10;
  if (code >= 65 && code <= 90) return code - 65 + 36;
  return -1;
}

/** How many values the run-length alphabet covers: `0`–`9`, `A`–`Z`. */
export const UPPER_ALPHABET_SIZE = 36;

/**
 * The character standing for `num` in a run-length desc, which must be
 * `0 <= num < {@link UPPER_ALPHABET_SIZE}`: `0`–`9`, then `A`–`Z` for 10–35.
 * Throws out of range for the same reason {@link n2c} does.
 */
export function n2cUpper(num: number): string {
  if (num < 0 || num >= UPPER_ALPHABET_SIZE || !Number.isInteger(num)) {
    throw new RangeError(`run-length alphabet: ${num} is not a value it can write`);
  }
  return num < 10 ? String(num) : String.fromCharCode(65 + num - 10);
}

/** The value `c` stands for in a run-length desc, or `-1` if it is not a
 * character of that alphabet — a lowercase letter included, since there it is
 * a blank run and never a value. */
export function c2nUpper(c: string): number {
  const digit = digitValue(c);
  if (digit >= 0) return digit;
  const code = c.charCodeAt(0);
  return code >= 65 && code <= 90 ? code - 65 + 10 : -1;
}
