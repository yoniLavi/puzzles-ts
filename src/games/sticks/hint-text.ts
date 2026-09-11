/**
 * Every sentence Sticks' hint speaks, and the words inside them.
 *
 * The deduction decides which sentence and with what values (`index.ts`'s
 * `narrate`, which reads the clue numbers off the board); this file decides
 * only how it reads: why the square can only take one orientation, by naming
 * the clue the other orientation would break and how it would break it.
 *
 * `continues` is a later leg of the same firing — the same clue and the same
 * rule ruling out a further square — so it says so and drops the premise the
 * opening leg has already taught, while keeping its own numbers and the
 * necessity modal (Slant's leg convention).
 */

import type { SticksFiring, SticksReason } from "./solver.ts";

type R<K extends SticksReason["kind"]> = Extract<SticksReason, { kind: K }>;
type To = SticksFiring["to"];

const ORIENT = { hor: "horizontal", ver: "vertical" } as const;

/** The orientation ruled out, and the closing sentence naming the one left.
 * A square shows a number only when it carries a clue of its own (`clue`, else
 * -1); otherwise there is no value to name it by and the clue in the sentence
 * locates it. */
function frame(to: To, clue: number): { bad: string; tail: string } {
  const bad = ORIENT[to === "hor" ? "ver" : "hor"];
  const here = clue === -1 ? "this square" : `this ${clue}`;
  return { bad, tail: `So ${here} must be ${ORIENT[to]}.` };
}

export const say = {
  tooLong: (reason: R<"tooLong">, to: To, clue: number, continues: boolean): string => {
    const { bad, tail } = frame(to, clue);
    return continues
      ? `The ${reason.value} rules this square out too: a ${bad} line would run its line to ${reason.size} squares. ${tail}`
      : `A ${bad} line here would run the ${reason.value}'s line to ${reason.size} squares, too long for it. ${tail}`;
  },

  // Leads with the clue, not with the ruled-out move: the signal a player has
  // to learn to look for here is a number running out of room, which they will
  // not spot from the square being acted on.
  unreachable: (
    reason: R<"unreachable">,
    to: To,
    clue: number,
    continues: boolean,
  ): string => {
    const { bad, tail } = frame(to, clue);
    const room = `${reason.max} square${reason.max === 1 ? "" : "s"}`;
    return continues
      ? `The ${reason.value} rules this square out too: a ${bad} line would leave it only ${room}. ${tail}`
      : `The ${reason.value} needs a longer line, and a ${bad} line here would leave it only ${room}. ${tail}`;
  },

  /** A line here would join clues showing `vals` into one line. */
  twoClues: (vals: number[], to: To, clue: number, continues: boolean): string => {
    const { bad, tail } = frame(to, clue);
    if (continues)
      return `The same numbers rule this square out too: a ${bad} line would join them into one line. ${tail}`;
    const joined =
      vals.length !== 2
        ? `put ${vals.length} numbers on one line`
        : vals[0] === vals[1]
          ? `join two ${vals[0]}s into one line`
          : `join the ${vals[0]} and the ${vals[1]} into one line`;
    // One number per line is the rule, and the help teaches it
    // (docs/games/hints.md § "Rules belong in the help").
    return `A ${bad} line here would ${joined}. ${tail}`;
  },

  // No "as well" on the continuation: at a black 0 nothing runs into it yet,
  // so the word would be false exactly where the rule is starkest
  // (docs/games/hints.md § "Sanity-read at the degenerate extremes").
  overConnected: (
    reason: R<"overConnected">,
    to: To,
    clue: number,
    continues: boolean,
  ): string => {
    const { bad, tail } = frame(to, clue);
    if (continues)
      return `The black ${reason.value} rules this square out too: a ${bad} line here would run into it. ${tail}`;
    return reason.value === 0
      ? `The black 0 takes no lines, and a ${bad} line here would run straight into it. ${tail}`
      : `The black ${reason.value} already has its ${reason.value} line${reason.value === 1 ? "" : "s"}, and a ${bad} line here would add another. ${tail}`;
  },

  starved: (reason: R<"starved">, to: To, clue: number, continues: boolean): string => {
    const { bad, tail } = frame(to, clue);
    if (continues)
      return `The black ${reason.value} rules this square out too: a ${bad} line would close another open side. ${tail}`;
    return reason.value === 1
      ? `The black 1 has one open side left, and a ${bad} line here would close it off. ${tail}`
      : `The black ${reason.value} needs ${reason.value === 2 ? "both" : `all ${reason.value}`} of its open sides, and a ${bad} line here would close one. ${tail}`;
  },
};
