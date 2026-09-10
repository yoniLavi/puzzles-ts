/**
 * Every sentence Salad's hint speaks that is Salad's own, and the words inside
 * them: the border clues, the empty-square counts, and the two setup steps in
 * Salad's words. The generic Latin arms are the engine's
 * (`engine/hint-text.ts`), spoken in {@link saladVocab}.
 *
 * The deduction decides which sentence and with what values (`hint.ts`'s
 * `narrate`); this file decides only how it reads. Salad's two modes speak two
 * vocabularies, so {@link say} takes the mode and returns its sentences in it.
 */

import { cleanObviousText, joinWith, type LatinVocab } from "../../engine/hint-text.ts";
import { GAMEMODE_LETTERS } from "./state.ts";

/** `A`, `B`, … in ABC End View; `1`, `2`, … in Number Ball. */
export function symbolChar(mode: number, n: number): string {
  return String.fromCharCode((mode === GAMEMODE_LETTERS ? 64 : 48) + n);
}

/** Salad's value vocabulary for the shared generic-Latin narration arms — the
 * one place its two modes differ in words rather than logic. */
export function saladVocab(mode: number): LatinVocab {
  return {
    noun: mode === GAMEMODE_LETTERS ? "letter" : "number",
    value: (n) => symbolChar(mode, n),
    cell: "square",
  };
}

function count(k: number, one: string, many = `${one}s`): string {
  return `${k} ${k === 1 ? one : many}`;
}

/** A border clue named by where the player sees it, as a sentence opener. */
function clueName(side: string): string {
  if (side === "top") return "This column's top clue";
  if (side === "bottom") return "This column's bottom clue";
  return side === "left" ? "This row's left-hand clue" : "This row's right-hand clue";
}

type Side = "top" | "left" | "bottom" | "right";
type Line = "row" | "col";

/** Salad's sentences, in the vocabulary of the mode being played. */
export function say(mode: number) {
  const vocab = saladVocab(mode);
  const noun = vocab.noun;
  const sym = (n: number): string => symbolChar(mode, n);
  const list = (xs: number[]): string => joinWith(xs.map(sym));

  return {
    populate: `Start by penciling every candidate ${vocab.noun} into each empty square that has none yet, so there is something to cross out.`,

    cleanObvious: cleanObviousText(vocab.noun, "placed", "row or column", "square"),

    /** The clue on `side` sees `clueVal` first, and the `skipped` squares
     * between it and this one are empty: only `clueVal` can go here, so `ns`
     * are struck. */
    borderNear: (
      side: Side,
      clueVal: number,
      skipped: number,
      ns: number[],
    ): string => {
      const clue = sym(clueVal);
      const lead = `${clueName(side)} sees ${clue} first`;
      const gap =
        skipped === 0
          ? ` and this square is nearest to it`
          : `, and the ${count(skipped, "square")} between ${skipped === 1 ? "is" : "are"} marked empty`;
      return `${lead}${gap}, so only ${clue} can go here: cross out ${list(ns)}.`;
    },

    /** The clue's own symbol cannot sit this far in: cut off at a square known
     * to hold a symbol (`blocked`), or past the `reach` its line's `holes`
     * allow, `tightenedBy` empties already marked beyond it. */
    borderFar: (p: {
      side: Side;
      axis: "row" | "column";
      clueVal: number;
      blocked: boolean;
      reach: number;
      holes: number;
      tightenedBy: number;
    }): string => {
      const clue = sym(p.clueVal);
      if (p.blocked) {
        return `${clueName(p.side)} sees ${clue} first, and the outlined square furthest from it already holds ${vocab.noun === "letter" ? "a letter" : "a number"}, so the ${clue} must sit somewhere in the outlined run. We must cross out the ${clue} past it.`;
      }
      const bound =
        p.reach === 0
          ? `must be in the square nearest the clue`
          : `must be within the first ${count(p.reach + 1, "square")} from the clue`;
      const tighten =
        p.tightenedBy > 0
          ? ` and ${p.tightenedBy === 1 ? "one of them is" : `${p.tightenedBy} of them are`} already marked further along`
          : ``;
      return `${clueName(p.side)} sees ${clue} first, so every square before its ${clue} must be empty. This ${p.axis} has room for only ${count(p.holes, "empty square")}${tighten}, so the ${clue} ${bound}. We must cross out the ${clue} beyond that.`;
    },

    /** This line already has all `k` of its empty squares. */
    countHolesDone: (line: Line, k: number): string => {
      const axis = line === "row" ? "row" : "column";
      // Reads correctly at the degenerate extreme too (§2.7): `nums = order − 1`
      // leaves exactly one empty square per line.
      const has =
        k === 1
          ? "its one empty square"
          : k === 2
            ? "both of its empty squares"
            : `all ${k} of its empty squares`;
      return `This ${axis} already has ${has}, so every other square in it must hold a ${noun}.`;
    },

    /** This line's `nums` symbols are all placed (`allPlaced`), or at least
     * their squares are known. */
    countLettersDone: (line: Line, allPlaced: boolean, nums: number): string => {
      const axis = line === "row" ? "row" : "column";
      // The two halves of one firing: either the line's symbols are all written
      // in, or we merely know *which* squares hold them (a line of balls). Each
      // claims only what it has (§2.6).
      return allPlaced
        ? `All ${count(nums, noun)} of this ${axis} are already placed, so every other square in it must be empty.`
        : `We already know which ${count(nums, "square")} of this ${axis} hold its ${noun}s, so every other square in it must be empty.`;
    },

    crossNaked: `Every ${noun} is ruled out here, so the empty-square mark is the only one left: this square must be empty.`,

    forcedCross: `Working through this square's row and column together, no ${noun} can still go here, so it must be empty.`,

    forcedCircle: `Working through this square's row and column together, this square cannot be one of the empty ones, so it must hold a ${noun}, even though we don't know which yet.`,

    circleXNote: `These squares are now known to hold a ${noun}, so we must cross out their empty-square marks.`,

    /** This line already has all `times` of its empty squares, so this one
     * cannot be empty. */
    repeatFull: (line: Line, times: number): string => {
      const axis = line === "row" ? "row" : "column";
      const has =
        times === 1
          ? "its one empty square"
          : times === 2
            ? "both of its empty squares"
            : `all ${times} of its empty squares`;
      return `This ${axis} already has ${has}, so this square cannot be empty; we must cross out its empty-square mark.`;
    },
  };
}
