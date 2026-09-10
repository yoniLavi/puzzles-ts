/**
 * Every sentence Slant's hint speaks, and the words inside them.
 *
 * The deduction decides which sentence and with what values (`index.ts`'s
 * `narrate`); this file decides only how it reads: indication first, the
 * necessity voice, terse, and the honest locked-slant voice for equivalence
 * (D3).
 */

/** How a slant reads, by its sign. */
const slashWord = (v: number): string => (v < 0 ? "a backslash" : "a forward slash");

export const say = {
  // Continuation legs belong to a clue firing (only clue firings force
  // several squares); keep them in the necessity voice.
  /** A later square forced by the same clue; `away` when it slants away. */
  continuation: (away: boolean): string =>
    away
      ? "The same clue forces this square too, so it must slant away."
      : "The same clue forces this square too, so it must slant toward the clue.",

  /** A clue `c` still short of diagonals. */
  clueFill: (c: number): string =>
    c === 4
      ? "A 4 clue must be touched by all four diagonals, so this square must slant toward it."
      : `This ${c} clue still needs a line for every empty square left around it, so each one must slant toward it.`,

  /** A clue `c` already touched by all its diagonals. */
  clueEmpty: (c: number): string => {
    if (c === 0) {
      return "A 0 clue is touched by no diagonals, so every square around it must slant away.";
    }
    const has = c === 1 ? "its one diagonal" : `its ${c} diagonals`;
    return `This ${c} clue already touches ${has}, so every other square around it must slant away.`;
  },

  loop: "Two corners of this square are already joined by a chain of diagonals, so it must slant the other way to avoid a loop.",

  deadend:
    "These points are boxed in with one diagonal each; linking them here would seal a loop, so this must slant the other way.",

  // The anchor shares this square's equivalence class, hence its slash (`v`),
  // so name it once.
  equiv: (v: number): string =>
    `This square is locked to the same slant as the ringed one by the clues around them, so it must be ${slashWord(v)} too.`,
};
