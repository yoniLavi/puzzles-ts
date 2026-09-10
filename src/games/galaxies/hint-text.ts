/**
 * Every sentence Galaxies' hint speaks, and the words inside them.
 *
 * The deduction decides which sentence and with what values (`hint.ts`'s
 * `narrate`, which reads each dot's color and whether a wall is the board's own
 * rim); this file decides only how it reads.
 */

/** A dot, named by its color. */
const dot = (black: boolean): string => (black ? "black dot" : "white dot");

export const say = {
  /** The `n` cells a dot sits on, whose color is `black` or white. */
  dotTile: (n: number, black: boolean): string => {
    const cells =
      n === 1 ? "this cell" : n === 2 ? "both these cells" : `these ${n} cells`;
    // Named by where it is, not by a ring: the dot is *on* the cells being
    // filled, so a ring would be the hint's color on the hint's color.
    const where =
      n === 2 ? "between them" : n === 4 ? "at their shared corner" : "they touch";
    return `A galaxy covers the cells its dot sits on, so ${cells} must belong to the ${dot(black)} ${where}.`;
  },

  // A cell that *holds* its own dot draws no arrow — there is nothing to point
  // at from inside itself — so "point at different dots" would send the player
  // looking for an arrow that is not there. Both cells are still visibly
  // settled: one shows an arrow, the other shows the dot.
  /** Two cells settled to different dots; `points` when both show arrows. */
  separate: (points: boolean): string =>
    `These two cells ${points ? "point at" : "go with"} different dots, so they belong to different galaxies, and a wall must run between them.`,

  // The mirrored wall is very often the board's own rim, and calling that "the
  // marked wall" would have the player hunting for a wall they are already
  // looking at the edge of. "Outlined" for a **cell**, "ringed" for a **dot**:
  // both marks are rings now, so the noun is what keeps them apart and the
  // words follow it.
  /** Partners across a dot; `edge` when the wall to match is the board's rim. */
  mirrorWall: (black: boolean, edge: boolean): string =>
    edge
      ? `The outlined cells are partners across the ${dot(black)}; one meets the board's edge, so the other must be walled to match.`
      : `The outlined cells are partners across the ${dot(black)}, so the marked wall beside one must be matched beside the other.`,

  // Its walled sides are drawn on the board, and "every way out" already
  // excludes them; that a galaxy is connected is the rule, and the help teaches
  // it (docs/games/hints.md § "Rules belong in the help").
  /** Every one of the cell's `openings` leads into the ringed dot's galaxy. */
  enclosed: (openings: number, black: boolean): string => {
    const lead =
      openings === 1
        ? "The only way out of this cell leads"
        : "Every way out of this cell leads";
    return `${lead} into the outlined galaxy, so this cell must belong to the ringed ${dot(black)}.`;
  },

  // The claim *is* this rung's own condition, so it is checkable by the player
  // with the gesture they already have: drag from the cell and count the rings.
  soleOwner: (black: boolean): string =>
    `Only the ringed ${dot(black)} can own this cell: for any other dot, its partner cell is off the board or on a dot.`,

  // "shows how far", not "is everywhere": the acted-on cell carries the action
  // mark rather than the evidence one, so the outlined set is the reach minus
  // one square and an absolute claim would be a shade off true.
  onlyReach: (black: boolean): string =>
    `No other galaxy can reach this cell, so it must belong to the ringed ${dot(black)}, whose reach the outline shows.`,

  exclave:
    "The outlined cells are cut off from their ringed dot, and this is their only way back, so it must be that dot's too.",
};
