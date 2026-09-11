/**
 * Every sentence Unequal's hint speaks that is Unequal's own: the inequality
 * signs and Adjacent mode's bars, and the two setup steps in Unequal's words.
 * The generic Latin arms are the engine's (`engine/hint-text.ts`), spoken in
 * {@link unequalVocab}.
 *
 * The deduction decides which sentence and with what values (`index.ts`'s
 * `narrate`); this file decides only how it reads. Every arm reads correctly
 * at the value extremes: a trivial inequality bound becomes "the
 * smallest/largest number" rather than the vacuous "no less than 1", and the
 * differ-by-1 clue says "one away from N", never "N−1 or N+1".
 *
 * A value prints as the board draws it, `state.ts`'s `n2c` at the grid's
 * order, which runs 0-based digits and then letters once the order passes 9.
 */

import {
  cleanObviousText,
  joinOr,
  joinWith,
  type LatinVocab,
  populateText,
} from "../../engine/hint-text.ts";
import { n2c } from "./state.ts";

/** Unequal's value vocabulary for the shared generic-Latin arms. */
export function unequalVocab(order: number): LatinVocab {
  return { noun: "number", value: (n) => n2c(n, order) };
}

/** Values that all go ("cross out 1 and 2"), as the board prints them. */
const all = (ns: number[], order: number): string =>
  joinWith(ns.map((n) => n2c(n, order)));

export const say = {
  populate: populateText("number"),

  cleanObvious: cleanObviousText("number", "standing", "row or column"),

  /** This cell is the larger side of a sign whose other cell is at least
   * `bound`. */
  greater: (bound: number, ns: number[], order: number): string =>
    bound <= 1
      ? `The larger side of a greater-than sign can't hold the smallest number, so we must cross out ${all(ns, order)}.`
      : `The cell across this greater-than sign is at least ${n2c(bound, order)}, so this one must be larger; we must cross out ${all(ns, order)}.`,

  /** This cell is the smaller side of a sign whose other cell is at most
   * `bound`, in a grid of `order`. */
  lesser: (bound: number, order: number, ns: number[]): string =>
    bound >= order
      ? `The smaller side of a greater-than sign can't hold the largest number, so we must cross out ${all(ns, order)}.`
      : `The cell across this greater-than sign is at most ${n2c(bound, order)}, so this one must be smaller; we must cross out ${all(ns, order)}.`,

  /** A bar joins this cell to its neighbor holding `v` (`bar`), or none does. */
  adjacent: (bar: boolean, v: number, ns: number[], order: number): string =>
    bar
      ? `A bar joins this cell to the ${n2c(v, order)} beside it, so they must differ by exactly 1: we must cross out ${all(ns, order)}.`
      : `No bar joins this cell to the ${n2c(v, order)} beside it, so they can't differ by 1: we must cross out ${all(ns, order)}.`,

  /** The same, against a neighbor that is still undecided: a struck value
   * fits none of the numbers still open there. */
  adjacentSet: (bar: boolean, ns: number[], order: number): string => {
    const them = ns.length === 1 ? "it" : "they";
    return bar
      ? `A bar joins this cell to its neighbor, but no number open there is one away from ${joinOr(ns.map((n) => n2c(n, order)))}: ${them} must be crossed out.`
      : `No bar joins this cell to its neighbor, and every number open there clashes with ${all(ns, order)}: ${them} must be crossed out.`;
  },
};
