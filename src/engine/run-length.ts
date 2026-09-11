/**
 * The run-length desc grammar: **a value character, or a letter standing for a
 * run of blanks.** `a` = 1 blank … `z` = 26, and a run longer than 26 is
 * written as repeated `z`s.
 *
 * A game with this desc reads it twice — in `validateDesc` to count the squares
 * and in `newState` to fill them — and this is the one scanner both use. The
 * bytes it parses are frozen, so it reproduces them exactly rather than
 * improving on them. `src/run-length-desc.test.ts` derives who uses it from who
 * imports this module.
 *
 * Map is here for **half** its desc: its clue list is this grammar, its edge
 * list is not. One desc, two run-length codings — see the comment at the
 * encoder in `map/map-data.ts`.
 *
 * WHAT DOES NOT LIVE HERE is any game's *meaning*. The scanner reports what it
 * read and never what is legal: which value characters a game accepts, what
 * range they fall in, how many squares its grid holds and what its error
 * messages say all stay with the game, which is why {@link scanRunLength}
 * yields a bare character for anything that is not a run letter — including
 * characters the game will reject.
 *
 * **The games with a richer desc do not use this, and should not.** Towers,
 * Keen, Solo, Undead, Unequal, Mathrax, Salad, Boats, Tents, Tracks and Pattern
 * parse multi-digit numbers, `_` separators, or two comma-separated sections
 * whose boundary the caller has to control. That is a different grammar, not a
 * harder version of this one; bending it through a token iterator would mean
 * handing the caller an index back and re-entering the scan, which is longer
 * than the loop it replaces.
 *
 * **Bricks and Crossing belong with them**, although a scan for the letter-run
 * arithmetic finds both, because both have it — what the *other* token means
 * is what decides the grammar. Bricks' is a
 * multi-digit clue with `_` separating two adjacent ones, over a padded grid
 * whose `F_BOUND` cells the desc index skips independently of the cell index.
 * Crossing has no value character at all: its decimal numbers are a *second
 * kind of run*, of open cells, alternating with the letter runs of walls. So
 * this module's key is not "does it write `charCodeAt(0) - 97`" but "is
 * everything that is not a blank run a single value character".
 */

/** One token of a run-length desc. */
export type RunLengthToken =
  /** A letter standing for `blanks` empty cells (`a` = 1 … `z` = 26). */
  | { readonly blanks: number }
  /** Any other character, handed back unread for the game to interpret. */
  | { readonly value: string };

const A = "a".charCodeAt(0);

/**
 * Read `desc` as run-length tokens, left to right.
 *
 * Consecutive `z`s are yielded as separate tokens rather than summed, because
 * that is what the games do and a caller adding them up gets the same total
 * either way.
 */
export function* scanRunLength(desc: string): Generator<RunLengthToken> {
  for (const ch of desc) {
    if (ch >= "a" && ch <= "z") yield { blanks: ch.charCodeAt(0) - A + 1 };
    else yield { value: ch };
  }
}

/**
 * Write `count` cells as a run-length desc: `emit(i)` returns the value
 * character for cell `i`, or `null` for a blank.
 *
 * **`keepTrailingBlanks` is not a style option**, which is why it has no
 * default worth trusting blindly: it decides whether the desc ends with the
 * run that reaches the last cell, and a game's own `validateDesc` depends on
 * the answer. Palisade drops it and accepts any desc describing *at most* its
 * grid; Slant keeps it and rejects anything that does not fill the grid
 * exactly ("Not enough data to fill grid"). Encode a Slant desc without the
 * trailing run and the game refuses to load its own board.
 */
export function encodeRunLength(
  count: number,
  emit: (i: number) => string | null,
  { keepTrailingBlanks = false }: { keepTrailingBlanks?: boolean } = {},
): string {
  let out = "";
  let run = 0;
  const flush = (): void => {
    while (run > 0) {
      const chunk = Math.min(run, 26);
      out += String.fromCharCode(A - 1 + chunk);
      run -= chunk;
    }
  };
  for (let i = 0; i < count; i++) {
    const v = emit(i);
    if (v === null) {
      run++;
      continue;
    }
    flush();
    out += v;
  }
  if (keepTrailingBlanks) flush();
  return out;
}
