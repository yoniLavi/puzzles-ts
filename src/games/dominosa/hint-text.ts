/**
 * Every sentence Dominosa's hint speaks, and the words inside them.
 *
 * The deduction decides which sentence and with what values (`index.ts`'s
 * `narratePlace` / `narrateBarrier`, which read the two numbers off the
 * board); this file decides only how it reads.
 */

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
      return `This square can pair with only the ${dom} domino, so it must go here.`;
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
        return "Every remaining spot for the outlined domino covers this pair, so no other domino can go here.";
      case "localDuplicate":
        return `A ${dom} domino here would force a second ${dom} at the outlined square, but each domino is used once, so it can't.`;
      case "localDuplicate2":
        return `A ${dom} domino here would force both outlined squares to become ${dom} too, a duplicate, so it can't.`;
      case "parity":
        return "A domino here would split the empty squares into odd-sized regions, which dominoes can't fill, so this can't be a domino.";
      case "set":
        return `The outlined squares can only hold one set of dominoes, which uses the ${dom}, so ${dom} can't sit here as well.`;
    }
  },
};
