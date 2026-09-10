/**
 * Every sentence Unequal's hint speaks that is Unequal's own: the inequality
 * signs and Adjacent mode's bars, and the two setup steps in Unequal's words.
 * The generic Latin arms are the engine's (`engine/hint-text.ts`), which
 * Unequal speaks unchanged.
 *
 * The deduction decides which sentence and with what values (`index.ts`'s
 * `narrate`); this file decides only how it reads. Every arm reads correctly
 * at the value extremes (§2.7): a trivial inequality bound becomes "the
 * smallest/largest number" rather than the vacuous "no less than 1", and the
 * differ-by-1 clue says "one away from N", never "N−1 or N+1".
 */

import { cleanObviousText, joinNums, populateText } from "../../engine/hint-text.ts";

export const say = {
  populate: populateText("number"),

  cleanObvious: cleanObviousText("number", "standing", "row or column"),

  /** This cell is the larger side of a sign whose other cell is at least
   * `bound`. */
  greater: (bound: number, ns: number[]): string =>
    bound <= 1
      ? `The larger side of a greater-than sign can't hold the smallest number, so we must cross out ${joinNums(ns)}.`
      : `The cell across this greater-than sign is at least ${bound}, so this one must be larger; we must cross out ${joinNums(ns)}.`,

  /** This cell is the smaller side of a sign whose other cell is at most
   * `bound`, in a grid of `order`. */
  lesser: (bound: number, order: number, ns: number[]): string =>
    bound >= order
      ? `The smaller side of a greater-than sign can't hold the largest number, so we must cross out ${joinNums(ns)}.`
      : `The cell across this greater-than sign is at most ${bound}, so this one must be smaller; we must cross out ${joinNums(ns)}.`,

  /** A bar joins this cell to its neighbor holding `v` (`bar`), or none does. */
  adjacent: (bar: boolean, v: number, ns: number[]): string =>
    bar
      ? `A bar joins this cell to the ${v} beside it, so the two numbers must differ by exactly 1; this cell can only be one away from ${v}, so we must cross out ${joinNums(ns)}.`
      : `There's no bar between this cell and the ${v} beside it, so their numbers can't differ by 1; this cell can't sit one away from ${v}, so we must cross out ${joinNums(ns)}.`,

  /** The same, against a neighbor that is still undecided. */
  adjacentSet: (bar: boolean, ns: number[]): string =>
    bar
      ? `Whatever the cell beside it turns out to be, the bar forces this cell to a value one away from it, and no number still open there leaves room for ${joinNums(ns)} here, so we must cross out ${joinNums(ns)}.`
      : `With no bar to the cell beside it, this cell must avoid every value one step from it, and ${joinNums(ns)} would clash with a number still open there, so we must cross out ${joinNums(ns)}.`,
};
