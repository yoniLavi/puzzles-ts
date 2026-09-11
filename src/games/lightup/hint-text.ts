/**
 * Every sentence Light Up's hint speaks, and the words inside them.
 *
 * The deduction decides which sentence and with what values (`index.ts`'s
 * `narrate`, which reads the frame the player is looking at); this file decides
 * only how it reads: the indication first, the conclusion in the necessity
 * voice (docs/games/hints.md § "Necessity for deductions, imperative for
 * moves"). Where a second mark is on the board, "this square" is never left
 * bare.
 */

export const say = {
  /** This dark square has nothing else to light it. `corridor` when the
   * squares that could are on the board as evidence (dark ones shaded, lit
   * ones ringed), so the sentence names them; a corridor of just this square
   * shows no second mark, and then the bare deictic is right. */
  forcedLightSelf: (corridor: boolean): string =>
    corridor
      ? "Nothing else can light this dark square: the shaded squares are ruled out, the ringed ones lit. It must hold a bulb."
      : "Nothing else can light this dark square: every square that could is ruled out or already lit. It must hold a bulb.",

  forcedLightOther:
    "The ringed square is still dark and only this square can still light it, so this one must hold a bulb.",

  /** The clue `n` is met; `many` free neighbors are left to cross out. */
  clueSatisfied: (n: number, many: boolean): string => {
    if (n === 0) {
      return many
        ? "The highlighted clue is 0: no bulb may sit beside it. So its free neighbors can't hold a bulb."
        : "The highlighted clue is 0: no bulb may sit beside it. So its free neighbor can't hold a bulb.";
    }
    const bulbs =
      n === 1
        ? "its bulb (ringed)"
        : n === 2
          ? "both its bulbs (ringed)"
          : `all ${n} of its bulbs (ringed)`;
    return many
      ? `The highlighted clue already has ${bulbs}, so its other free neighbors can't hold a bulb.`
      : `The highlighted clue already has ${bulbs}, so its other free neighbor can't hold a bulb.`;
  },

  /** The clue still needs `need` bulbs and has exactly that many free
   * neighbors. */
  clueSaturated: (need: number): string =>
    need === 1
      ? "The highlighted clue still needs 1 more bulb and has exactly 1 free neighbor left, so that neighbor must be a bulb."
      : `The highlighted clue still needs ${need} more bulbs and has exactly ${need} free neighbors left, so each must be a bulb.`,

  // Three marks are in view (target, shaded set, ringed dark square), so "a
  // bulb here" is tied to the set by the relation `discountSet` guarantees:
  // *reach*, the target rules out every member by lighting it or by filling a
  // clue beside it. The tie cannot be positional: across 133 discount firings
  // the driving clue was never adjacent to or collinear with the target, nor
  // was the ringed dark square collinear with it. And the ringed square is
  // itself a set member in over half of all firings (`litCells(…, true)`
  // includes the source), where it is ringed rather than shaded, so the
  // sentence names it among the squares that could light it.
  /** One of `shaded` shaded squares (plus the ringed square itself, when
   * `ringedInSet`) must light the ringed square. */
  discountUnlit: (shaded: number, ringedInSet: boolean): string => {
    const squares = shaded === 1 ? "the shaded square" : "the shaded squares";
    const holders = ringedInSet ? `${squares} or the ringed square itself` : squares;
    return `${shaded === 1 && ringedInSet ? "Either the shaded square or the ringed square itself" : `One of ${holders}`} must light the ringed square, and a bulb here would leave each of them lit or beside a full clue, so this square can't hold a bulb.`;
  },

  discountClue:
    "The highlighted clue needs a bulb in one of the shaded squares, and a bulb here would leave each of them lit or beside a full clue, so this square can't hold a bulb.",
};
