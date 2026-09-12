/**
 * Every sentence the Bridges hint speaks, and every word inside one.
 *
 * The deduction decides *which* sentence and *with what values*
 * ([`hint.ts`](./hint.ts)'s `narrate`); this file decides only how it reads, so
 * a wording pass happens here and nowhere else. Values arrive as the board
 * means them (a clue, a count of neighbors, the size of a group), never as
 * words: the plural, the "both" at two and the singular arms are this file's to
 * choose.
 *
 * Each sentence runs indication, reasoning, conclusion, with the conclusion in
 * the necessity voice (docs/games/hints.md § "Writing the narration"). An
 * island is named by its clue digit, which is the one thing about it the player
 * can read off the board, and the island the sentence is about is the one the
 * hint recolors. A *bridge* has no name at all, so every sentence points at one
 * by direction from its island ("this way", "here"), which the drawn hint bar
 * or cross shows.
 */

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

export const say = {
  /** An island `missing` bridges short of its clue with room for exactly that
   * many. `clue` names it; the picture draws every bridge the move adds, and
   * they total `missing`. */
  exactSpace: (clue: number, missing: number): string =>
    missing === 1
      ? `This ${clue} still needs one more bridge and has room for exactly one, so it must be drawn there.`
      : `This ${clue} still needs ${missing} more bridges and has room for exactly ${missing}, so every one must be drawn.`,

  /**
   * An island whose clue exceeds what all but one of its `neighbors` could
   * carry, so none of them can be left out.
   *
   * The one-neighbor arm is not a degenerate reading of the same sentence: with
   * a single neighbor the count argument is vacuous and the real reason is that
   * there is nowhere else for a bridge to go.
   */
  everyNeighbor: (clue: number, neighbors: number): string => {
    if (neighbors === 1) {
      return `This ${clue} has just one neighbor left to reach, so at least one bridge must run to it.`;
    }
    if (neighbors === 2) {
      return `This ${clue} needs more bridges than either neighbor could carry alone, so both must take at least one.`;
    }
    return `This ${clue} needs more bridges than any ${neighbors - 1} of its ${neighbors} neighbors could carry, so each must take one.`;
  },

  wouldCloseLoop:
    "These islands are already linked by the outlined bridges, so one more here would close a loop: it must be blocked.",

  /** An island that can draw at most `elsewhere` bridges anywhere but this way. */
  needsThisWay: (clue: number, elsewhere: number): string =>
    elsewhere === 0
      ? `This ${clue}'s other neighbors can take no bridges at all, so every bridge it needs must run this way.`
      : `This ${clue} can take at most ${elsewhere} ${plural(elsewhere, "bridge", "bridges")} from its other neighbors, so one must run this way.`,

  /** A bridge here would complete a group of `group` islands, all satisfied and
   * cut off from the rest. The picture outlines exactly `group` islands. */
  wouldSealGroup: (group: number): string =>
    `A bridge here would shut these ${group} islands into a finished group of their own, so this way must be blocked.`,

  /** A bridge here leaves some island unable to reach its clue: `self` when
   * that island is the one the bridge would start from, where "the outlined
   * island" would point at the recolored one instead. */
  wouldStarve: (clue: number, self: boolean): string =>
    self
      ? `A bridge here would leave this ${clue} itself unable to reach its count, so this way must be blocked.`
      : "A bridge here would leave the outlined island unable to reach its own count, so this way must be blocked.",

  /** Filling every other direction to its limit would seal off a finished
   * group, so this direction cannot be the empty one. */
  mustReachOut: (clue: number): string =>
    `Filling this ${clue}'s other links as far as they go would seal off the outlined group, so a bridge must run this way.`,
};
