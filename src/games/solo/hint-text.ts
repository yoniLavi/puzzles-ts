/**
 * Every sentence Solo's hint speaks, and the words inside them.
 *
 * Solo keeps its own version of the generic Latin arms rather than the
 * engine's (`engine/hint-text.ts`), because it names a different region set
 * per arm ("row, column and block", or the block or diagonal a hidden single
 * sits in), which one vocabulary cannot say. It shares the forcing chain and
 * the two setup steps.
 *
 * A value prints as the board draws it (`render.ts`'s `digitChar`: 1 to 9,
 * then a, b, … past 9), so a 12×12 grid's hint names the "c" the player can
 * see rather than a "12" they cannot.
 *
 * The deduction decides which sentence and with what values (`index.ts`'s
 * `narrate`); this file decides only how it reads.
 */

import {
  cleanObviousText,
  indefinite,
  joinOr,
  joinWith,
  type LatinVocab,
  narrateForcingChain,
  populateText,
} from "../../engine/hint-text.ts";
import type { ForcingLink } from "../../engine/latin-hint.ts";
import { digitChar } from "./render.ts";
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

/** How a chain's last link lines up with this cell, where it is not by row or
 * column (the shared sentence's own default). */
function lastTie(region: SoloRegion): string | undefined {
  if (region.kind === "block") return "in this cell's block";
  if (region.kind === "diag0" || region.kind === "diag1")
    return "on this cell's diagonal";
  return undefined;
}

const g = digitChar;
/** Values that all go ("cross out 1 and 2"). */
const all = (ns: number[]): string => joinWith(ns.map(g));
/** Values of which any one would do, or none can ("no room for 1 or 2"). */
const any = (ns: number[]): string => joinOr(ns.map(g));

/** Solo's values are numbers, printed as the board prints them — the one word
 * and the one glyph the shared chain sentence needs from it. */
const SOLO_VOCAB: LatinVocab = { noun: "number", value: digitChar };

export const say = {
  populate: populateText("number"),

  cleanObvious: cleanObviousText("number", "placed", "row, column or block"),

  single: (n: number): string =>
    `Every other number has been ruled out in this cell, so it can only be ${g(n)}.`,

  hiddenSingle: (region: SoloRegion, n: number): string => {
    const r = regionName(region);
    return `In this ${r}, ${g(n)} can go in only this cell, since every other cell in the ${r} rules it out, so it must be ${g(n)}.`;
  },

  forcedSingle: (n: number): string =>
    `Working through this cell's row, column and block together, only ${g(n)} can still go here, so it must be ${g(n)}.`,

  dup: (n: number): string =>
    `${indefinite(g(n), true)} ${g(n)} is already placed in this cell, so it can't repeat in its row, column or block: cross out the ${g(n)} from these cells.`,

  /** Every cell of `confined` that can take `n` also lies in `target`. */
  intersect: (confined: SoloRegion, target: SoloRegion, n: number): string => {
    const cName = regionName(confined);
    const tName = regionName(target);
    return `In this ${cName}, every cell that can still take ${g(n)} lies in this ${tName}, so ${g(n)} must be crossed out of the rest of it.`;
  },

  /** A set of cells inside `region` accounts for `ns`; with no region, the set
   * is a locked pattern across several lines. */
  set: (region: SoloRegion | undefined, ns: number[]): string =>
    region
      ? `Other cells in this ${regionName(region)} already account for ${all(ns)}, so ${ns.length === 1 ? "it" : "they"} must be crossed out here.`
      : `A locked pattern of cells across these lines already accounts for ${all(ns)}, so we must cross out ${all(ns)} here.`,

  // The shared chain sentence, with Solo's own region vocabulary — its chain
  // hops through blocks and diagonals as well as lines, so both the region that
  // ties the conclusion back to the origin and the one that ties it to the last
  // link are named rather than assumed.
  forcing: (
    reason: { chain: readonly ForcingLink[] },
    struck: number,
    shares: SoloRegion,
    lastShares: SoloRegion,
  ): string =>
    narrateForcingChain(
      reason,
      struck,
      SOLO_VOCAB,
      regionName(shares),
      lastTie(lastShares),
    ),

  cageSingle: (n: number): string =>
    `The rest of this killer cage is filled in, and the one cell left must bring the cage to its total, so it can only be ${g(n)}.`,

  cageIntersect: (clue: number, n: number): string =>
    `Once the cages inside their region are counted, these cells must total ${clue}, and only this cell is open: it must be ${g(n)}.`,

  cageMinMax: (clue: number, ns: number[]): string =>
    `This killer cage must total ${clue}; its other cells leave no room for ${any(ns)}, so ${ns.length === 1 ? "it" : "they"} must be crossed out.`,

  cageSums: (clue: number, ns: number[]): string =>
    `No way to make this killer cage total ${clue} uses ${any(ns)} in this cell, so ${ns.length === 1 ? "it" : "they"} must be crossed out.`,
};
