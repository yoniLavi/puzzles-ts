/**
 * Every sentence Keen's hint speaks that is Keen's own: the cage arithmetic,
 * and the two setup steps in Keen's words. The generic Latin arms are the
 * engine's (`engine/hint-text.ts`), which Keen speaks unchanged.
 *
 * The deduction decides which sentence and with what values (`index.ts`'s
 * `narrate`); this file decides only how it reads.
 */

import {
  cleanObviousText,
  indefinite,
  joinOr,
  populateText,
} from "../../engine/hint-text.ts";
import { C_ADD, C_DIV, C_MUL, C_SUB } from "./state.ts";

/** The cage's arithmetic goal as a verb phrase, read off its packed clue — the
 * indication a cage deduction leads with (docs/games/hints.md § "Lead with the indication"). Reads across the
 * whole operation set: `sum to 15`, `multiply to 72`, `differ by 3`,
 * `have a ratio of 2`. */
function cageGoal(op: number, value: number): string {
  switch (op) {
    case C_ADD:
      return `sum to ${value}`;
    case C_MUL:
      return `multiply to ${value}`;
    case C_SUB:
      return `differ by ${value}`;
    case C_DIV:
      return `have a ratio of ${value}`;
    default:
      return `total ${value}`;
  }
}

export const say = {
  populate: populateText("number"),

  cleanObvious: cleanObviousText("number", "standing", "row or column"),

  /** No way to fill the cage (operator `op`, target `value`) leaves room for
   * `ns` in this cell. */
  cage: (op: number, value: number, ns: number[]): string =>
    `No way to make this cage ${cageGoal(op, value)} puts ${joinOr(ns)} in this cell, so ${ns.length === 1 ? "it" : "they"} must be crossed out.`,

  /** Every way to fill the cage places `n` in this row (`horizontal`) or
   * column. */
  cageLine: (op: number, value: number, n: number, horizontal: boolean): string =>
    `This cage must ${cageGoal(op, value)}, and every way to fill it places ${indefinite(String(n))} ${n} in this ${horizontal ? "row" : "column"}, so the ${n} here must be crossed out.`,
};
