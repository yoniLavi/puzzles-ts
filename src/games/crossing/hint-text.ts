/**
 * Every sentence Crossing's hint speaks, and the words inside them.
 *
 * The deduction decides which sentence and with what values
 * (`hint-solver.ts`'s `narrateCrossing`, which reads the runs and numbers off
 * the puzzle); this file decides only how it reads. One firing, one sentence:
 * the indication (the pattern to learn to spot), then the premise, then the
 * forced action in the necessity voice (§2.1–§2.6).
 *
 * The two `deep` variants exist because the premise is *half off the board*.
 * "Only one number still fits" is directly checkable when it holds against the
 * digits already entered — the clue list is literally coloring that scan
 * already. When it holds only after the crossing numbers have ruled the others
 * out, saying so plainly beats asserting something the player would check and
 * find false (§2.4).
 */

import type { CrossingFiring } from "./hint-solver.ts";

type F<K extends CrossingFiring["technique"]> = Extract<
  CrossingFiring,
  { technique: K }
>;

/** "across"/"down", the two words the board's own color wash already teaches. */
const way = (horizontal: boolean): string => (horizontal ? "across" : "down");

/** `joinNums` for **alternatives**: a list of candidate digits is "2 or 6", not
 * "2 and 6" — which would read as "both at once", the opposite of the claim. */
function joinOr(ns: number[]): string {
  if (ns.length <= 1) return `${ns[0] ?? ""}`;
  return `${ns.slice(0, -1).join(", ")} or ${ns[ns.length - 1]}`;
}

export const say = {
  /** The run (`horizontal`, `len` squares) can only be `num`. */
  onlyNumber: (
    f: F<"onlyNumber">,
    horizontal: boolean,
    len: number,
    num: string,
  ): string => {
    if (f.deep) {
      return `Once the crossing numbers rule the others out, only one number is left for this ${way(horizontal)} run, so it must be ${num}.`;
    }
    // The fresh-board opener says nothing about entered digits: on an empty
    // run there are none, so that premise does no work (§2.4) and reads as
    // plainly false (§2.7) — the length is the whole argument there.
    if (f.because === "length") {
      return `This run is ${len} squares long, and only one number in the list is ${len} digits, so it must be ${num}.`;
    }
    if (f.because === "used") {
      return `Every other ${len}-digit number is already on the board, so this run must be ${num}.`;
    }
    return `Only one ${len}-digit number left matches the digits already in this run, so it must be ${num}.`;
  },

  sharedDigit: (f: F<"sharedDigit">, horizontal: boolean): string =>
    f.deep
      ? `Every number that can still go in this ${way(horizontal)} run, once the crossing numbers rule the rest out, has a ${f.digit} in this square, so it must be ${f.digit}.`
      : `Every number that still fits this ${way(horizontal)} run has a ${f.digit} in this square, so it must be ${f.digit}.`,

  crossRuns: (f: F<"crossRuns">): string => {
    // Lead with whichever run is the *tighter* constraint and let the other
    // knock out the rest: listing both sets in full is the same proof, but
    // one of them routinely runs to six digits and reads as noise (§2.5).
    // Only a set of two or more can be led with — a singleton would leave
    // "cannot take  here" — and the earlier rung guarantees one exists (a
    // run that pinned the square on its own is a `sharedDigit`, not this).
    const across = f.acrossDigits;
    const down = f.downDigits;
    const leadAcross =
      down.length < 2 || (across.length >= 2 && across.length <= down.length);
    const [near, far] = leadAcross ? ["Across", "down"] : ["Down", "across"];
    const small = leadAcross ? across : down;
    const rest = small.filter((d) => d !== f.digit);
    return `${near}, this square can only be ${joinOr(small)}, and the ${far} number cannot take ${joinOr(rest)} here, so it must be ${f.digit}.`;
  },

  noteStrike: (f: F<"noteStrike">, horizontal: boolean): string => {
    const ds = joinOr(f.digits);
    return f.digits.length === 1
      ? `No number that still fits this ${way(horizontal)} run puts a ${ds} in this square, so rule it out.`
      : `No number that still fits this ${way(horizontal)} run puts ${ds} in this square, so rule them out.`;
  },
};
