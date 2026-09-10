/**
 * Every sentence Pattern's hint speaks, and the words inside them.
 *
 * The deduction decides which sentence and with what values (`index.ts`'s
 * `narrate`); this file decides only how it reads: the indication (the spotted
 * pattern) first, the conclusion in the necessity voice, terse. `many` says
 * whether the step forces several cells or one.
 */

type Orient = "row" | "column";

const these = (many: boolean): string => (many ? "these cells" : "this cell");
const they = (many: boolean): string => (many ? "they" : "it");

export const say = {
  /** A run of `run` that can slide only `slack` cells along the line. */
  overlap: (orient: Orient, run: number, slack: number, many: boolean): string =>
    slack === 0
      ? `This ${orient}'s run of ${run} has nowhere to slide, so ${these(many)} must be black.`
      : `This ${orient}'s run of ${run} can slide only ${slack} cell${
          slack > 1 ? "s" : ""
        }, so ${these(many)} must be black.`,

  unreachable: (orient: Orient, many: boolean): string =>
    `No run can reach ${these(many)} in this ${orient}, so ${they(many)} must stay white.`,

  lineEmpty: (orient: Orient, many: boolean): string =>
    `This ${orient} has no clues, so ${these(many)} must stay white.`,

  /** Every fit of the line's runs agrees these cells are `black`, or white. */
  intersection: (orient: Orient, black: boolean, many: boolean): string =>
    black
      ? `Whichever way this ${orient}'s runs fit, ${these(many)} must be black.`
      : `Whichever way this ${orient}'s runs fit, ${these(many)} must stay white.`,
};
