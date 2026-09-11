/**
 * Every sentence Dominosa's hint speaks, and the words inside them.
 *
 * The deduction decides which sentence and with what values (`index.ts`'s
 * `hint`, which reads the two numbers off the board); this file decides only
 * how it reads.
 */

import { indefinite } from "../../engine/hint-text.ts";
import type { BarrierTechnique, PlaceTechnique } from "./solver.ts";

/** The domino two numbers make, lowest first: "2–5". */
function domino(a: number, b: number): string {
  return a <= b ? `${a}–${b}` : `${b}–${a}`;
}

export const say = {
  /** A placement of the domino showing `a` and `b`. */
  place: (technique: PlaceTechnique, a: number, b: number): string => {
    const dom = domino(a, b);
    if (technique === "squareOnly")
      return `The outlined square has only one neighbor left to pair with, so the ${dom} domino must go here.`;
    return `The ${dom} domino has only one spot left where it fits, because every other pairing is blocked, so it must go here.`;
  },

  /** A later barrier of the same firing: the reason is already on screen. */
  barrierNext: "This spot can't hold a domino for the same reason.",

  /** A barrier between two squares showing `a` and `b`. */
  barrier: (technique: BarrierTechnique, a: number, b: number): string => {
    const dom = domino(a, b);
    switch (technique) {
      case "squareSingleDomino":
        return `The outlined square can only be part of the ${dom} domino, so ${dom} can't sit here instead.`;
      case "mustOverlap":
        return "Every remaining spot for the outlined domino overlaps this pair, so no other domino can go here.";
      case "localDuplicate":
        return `${indefinite(dom, true)} ${dom} domino here would force a second ${dom} at the outlined square, but each domino is used once, so it can't.`;
      case "localDuplicate2":
        return "A domino here would leave both outlined squares needing one and the same domino, a duplicate, so it can't.";
      case "parity":
        return "A domino here would split the empty squares into odd-sized regions, which dominoes can't fill, so it can't go here.";
      case "set":
        return `The outlined squares can only hold one set of dominoes, which uses the ${dom}, so ${dom} can't sit here as well.`;
    }
  },
};
