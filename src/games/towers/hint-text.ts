/**
 * Every sentence Towers' hint speaks, and the words inside them.
 *
 * Towers keeps its own version of the generic Latin arms rather than the
 * engine's (`engine/hint-text.ts`), because its values need qualifying in some
 * arms and not others ("height 5 can go in only this cell … so it must be
 * 5"), which one vocabulary cannot say. It shares the forcing chain and the two
 * setup steps.
 *
 * The deduction decides which sentence and with what values (`index.ts`'s
 * `narrate`); this file decides only how it reads.
 */

import {
  cleanObviousText,
  type LatinVocab,
  narrateForcingChain,
  populateText,
} from "../../engine/hint-text.ts";
import type { ForcingLink } from "../../engine/latin-hint.ts";

/** Towers speaks of heights, not numbers — the one word the shared chain
 * sentence needs from it. */
const TOWERS_VOCAB: LatinVocab = { noun: "height", value: (h) => String(h) };

export const say = {
  populate: populateText("height"),

  cleanObvious: cleanObviousText("height", "standing", "row or column"),

  /** Clue `clue` sees every tower in its line, so height `n` sits here. A
   * journey's later leg (`continues`) does not restate the premise its first
   * leg gave. */
  fullLine: (clue: number, n: number, continues: boolean): string =>
    continues
      ? `Continuing up the line, height ${n} can only sit here.`
      : `Clue ${clue} sees every tower in this line, so heights must climb 1, 2, … from the clue: height ${n} can only sit here.`,

  tallestNearest: (n: number): string =>
    `Clue 1 sees just one tower, so the tallest must stand next to it, hiding the rest: height ${n} can only sit here.`,

  facing: (n: number): string =>
    `These facing clues sum to one more than the grid size, pinning the tallest tower: height ${n} can only sit here.`,

  lineFull: (clue: number, n: number): string =>
    `Clue ${clue} already sees all but one of its towers deeper in the line, so the cell nearest the clue must be tall enough to keep everything between it and them hidden. That is too tall for the shortest heights, so we must cross out the ${n}.`,

  // "height N", never "a N": the article trap (docs/games/hints.md § "Name a
  // square by its value").
  lowerBound: (clue: number, n: number): string =>
    `Clue ${clue} sees exactly ${clue} towers, so height ${n} this close would hide too many behind it; we must cross out the ${n}.`,

  arrangement: (clue: number, n: number): string =>
    `No way for clue ${clue} to show exactly ${clue} towers puts height ${n} here, so we must cross out the ${n}.`,

  dup: (n: number): string =>
    `A tower of height ${n} now sits in this row and column, so we must cross out the ${n} from every other cell they pass through.`,

  single: (n: number): string =>
    `Every other height has been ruled out in this cell, so it can only be ${n}.`,

  hiddenSingle: (line: "row" | "col", n: number): string =>
    `In this ${line === "row" ? "row" : "column"}, height ${n} can go in only this cell, since every other cell in the ${line === "row" ? "row" : "column"} rules it out, so it must be ${n}.`,

  forcedSingle: (n: number): string =>
    `Working through this cell's row and column together, only height ${n} can still go here, so it must be ${n}.`,

  set: (n: number): string =>
    `Another group of cells already accounts for a fixed set of heights that includes ${n}, so we must cross out the ${n} here.`,

  // The shared chain sentence, in Towers' own vocabulary: the value needs no
  // qualifying here, because "two heights left" contextualizes the bare
  // numbers, and the numbered cells carry the chain.
  forcing: (
    reason: { chain: readonly ForcingLink[] },
    n: number,
    shares: "row" | "col",
  ): string =>
    narrateForcingChain(reason, n, TOWERS_VOCAB, shares === "row" ? "row" : "column"),
};
