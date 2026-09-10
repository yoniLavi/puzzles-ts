/**
 * Every sentence Filling's hint speaks, and the words inside them.
 *
 * The deduction decides which sentence and with what values (`index.ts`'s
 * `narrate`); this file decides only how it reads. Kept terse and
 * number-light, referencing the shaded evidence so the words and the picture
 * agree: the value is read off "the region of N" (or "a 1"), so the target
 * cells need no digit drawn in them.
 */

export const say = {
  /** The region of `n` needs these squares (`many`) or this one; `exact` when
   * they complete it. */
  growth: (n: number, exact: boolean, many: boolean): string => {
    if (exact) {
      return many
        ? `The outlined region of ${n} fits exactly into these squares.`
        : `The outlined region of ${n} fits exactly into this last square.`;
    }
    return many
      ? `The outlined region of ${n} can't fully grow without these squares.`
      : `The outlined region of ${n} can't fully grow without this square.`;
  },

  blocked: (n: number): string =>
    `The outlined region of ${n} has only this one empty square to grow into.`,

  lonely:
    "No neighboring region can grow to include this square, so it can only be a 1.",

  // "be N", not "be a N": the article trap ("a 8").
  bitmap: (n: number): string =>
    `No other number can go here: each would touch an equal number or leave a region short of its size, so it must be ${n}.`,
};
