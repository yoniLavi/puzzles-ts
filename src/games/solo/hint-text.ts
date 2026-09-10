/**
 * Every sentence Solo's hint speaks, and the words inside them.
 *
 * Solo keeps its own version of the generic Latin arms rather than the
 * engine's (`engine/hint-text.ts`), because it names a different region set
 * per arm ("row, column and block", or the block or diagonal a hidden single
 * sits in), which one vocabulary cannot say. It shares the forcing chain and
 * the two setup steps.
 *
 * The deduction decides which sentence and with what values (`index.ts`'s
 * `narrate`); this file decides only how it reads.
 */

import {
  cleanObviousText,
  joinNums,
  type LatinVocab,
  narrateForcingChain,
  populateText,
} from "../../engine/hint-text.ts";
import type { ForcingLink } from "../../engine/latin-hint.ts";
import type { SoloRegion } from "./solver.ts";

/** The reader-facing name of a region. */
function regionName(region: SoloRegion): string {
  switch (region.kind) {
    case "row":
      return "row";
    case "col":
      return "column";
    case "block":
      return "block";
    case "diag0":
    case "diag1":
      return "diagonal";
  }
}

/** Solo's values are plain numbers — the one word the shared chain sentence
 * needs from it. Solo keeps its own sentences because other arms name a
 * different region set per arm, which this one takes as a parameter. */
const SOLO_VOCAB: LatinVocab = { noun: "number", value: (n) => String(n) };

export const say = {
  populate: populateText("number"),

  cleanObvious: cleanObviousText("number", "placed", "row, column or block"),

  single: (n: number): string =>
    `Every other number has been ruled out in this cell, so it can only be ${n}.`,

  hiddenSingle: (region: SoloRegion, n: number): string => {
    const r = regionName(region);
    return `In this ${r}, ${n} can go in only this cell, because every other cell in the ${r} has ruled it out, so it must be ${n}.`;
  },

  forcedSingle: (n: number): string =>
    `Working through this cell's row, column and block together, only ${n} can still go here, so it must be ${n}.`,

  dup: (n: number): string =>
    `A ${n} is already placed in this cell, so it can't repeat in its row, column or block: cross out the ${n} from these cells.`,

  /** Every cell of `confined` that can take `n` also lies in `target`. */
  intersect: (confined: SoloRegion, target: SoloRegion, n: number): string => {
    const cName = regionName(confined);
    const tName = regionName(target);
    return `In this ${cName}, every cell that can still take ${n} also lies in this ${tName}, so ${n} must sit where they overlap, and is crossed out of the rest of the ${tName}.`;
  },

  /** A set of cells inside `region` accounts for `ns`; with no region, the set
   * is a locked pattern across several lines. */
  set: (region: SoloRegion | undefined, ns: number[]): string =>
    region
      ? `Another group of cells in this ${regionName(region)} already accounts for a fixed set of numbers that includes ${joinNums(ns)}, so we must cross out ${joinNums(ns)} here.`
      : `A locked pattern of cells across these lines already accounts for ${joinNums(ns)}, so we must cross out ${joinNums(ns)} here.`,

  // The shared chain sentence, with Solo's own region vocabulary — its chain
  // hops through blocks and diagonals as well as lines, so the region that
  // ties the conclusion back to the origin is named rather than assumed.
  forcing: (
    reason: { chain: readonly ForcingLink[] },
    struck: number,
    shares: SoloRegion,
  ): string => narrateForcingChain(reason, struck, SOLO_VOCAB, regionName(shares)),

  cageSingle: (n: number): string =>
    `The rest of this killer cage is filled in, and the one cell left must bring the cage to its total, so it can only be ${n}.`,

  cageIntersect: (clue: number, n: number): string =>
    `These cells must together total ${clue} once the cages within their region are accounted for, and only this cell is left undetermined, so it must be ${n}.`,

  cageMinMax: (clue: number, ns: number[]): string =>
    `This killer cage must total ${clue}; the digits its other cells can still hold leave no room for ${joinNums(ns)} here, so cross out ${joinNums(ns)}.`,

  cageSums: (clue: number, ns: number[]): string =>
    `No way to make this killer cage total ${clue} uses ${joinNums(ns)} in this cell, so cross out ${joinNums(ns)}.`,
};
