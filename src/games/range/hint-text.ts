/**
 * Every sentence Range's hint speaks, and the words inside them.
 *
 * The deduction decides which sentence and with what values (`index.ts`'s
 * `narrate`); this file decides only how it reads, referencing the highlighted
 * evidence so the words and the picture agree.
 *
 * **Every Range step shows a second mark** — a shaded area, or (for
 * `adjacency`) a ringed black premise — so no sentence may leave "this cell"
 * bare: with two marks in view a bare deictic points at neither. The tie is
 * the relation the rule itself guarantees, never a color name:
 *
 * - `satisfied` / `overrun` place the target at `1 + rl[RUN_WHITE][j]` steps
 *   from the clue — that is, the **first cell past the shaded run** in one of
 *   the clue's four directions (past the clue itself where the run is empty,
 *   and the clue is shaded too).
 * - `reach` walks outward from the clue and `buildHighlights` shades the whole
 *   path behind the target, so the target is the run's **far end**.
 * - `connect` shades exactly the target's own non-black neighbors, so they are
 *   the cells **around it**.
 *
 * The three clue rules say *"the highlighted N"* rather than *"clue N"* for the
 * same reason in the other direction: a clue lies inside its own shaded line of
 * sight, and that run can hold a second clue of the same value, so the digit is
 * marked and the sentence points at the mark (see `RangeHint.clue`).
 */

export const say = {
  adjacency:
    "No two black squares may touch. This cell sits right next to the ringed black square, so it must be white.",

  // Read at the small extremes (docs/games/hints.md § "Sanity-read at the
  // degenerate extremes"): a 1 sees only its own cell, and "all 2 of" reads
  // wrong where "both" is the word — Salad's line counts say it the same way.
  /** The highlighted clue `n` already sees all its white cells. */
  satisfied: (n: number): string => {
    const seen =
      n === 1
        ? "its one white cell"
        : n === 2
          ? "both of its white cells"
          : `all ${n} of its white cells`;
    return `The highlighted ${n} already sees ${seen} (outlined), so the cell just past ${n === 1 ? "it" : "them"} must be black.`;
  },

  overrun: (n: number): string =>
    `White here, just past the outlined cells, would let the highlighted ${n} see more than ${n}, so this cell must be black.`,

  reach: (n: number): string =>
    `To see ${n} cells, the highlighted ${n} must look along the outlined run as far as this cell, so this cell must be white.`,

  // Both `ruleConnectedness` call sites record WHITE, so there is no
  // black-target sentence to write: a cut vertex of the white region is
  // forced *white*, never black.
  connect:
    "Painting this cell black would cut some of the outlined cells around it off from the rest, so it must stay white.",
};
