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
 * **Not to be confused with Unequal's `n2c`/`c2n`**, which share these names
 * and nothing else: that pair takes the puzzle's `order`, shifts its alphabet
 * above order 9, maps 0 to a space and reads space/backspace keypresses. It is
 * a display-and-input codec that inherited upstream's naming.
 */

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
