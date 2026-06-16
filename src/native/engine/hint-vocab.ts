/**
 * Shared "goal: tactic" hint vocabulary for the sliding-tile games
 * (Fifteen, Sixteen), aligned with the project hint quality bar (the
 * Palisade exemplar: explain *why* a move matters, not just what to do).
 *
 * Every step names the tile it is working toward home ("Working on tile
 * N:") and then states the tactic — so the player always sees the goal
 * behind a move, even when the tile being slid is only clearing the way.
 * A move that lands its tile in the solved cell is a **home** move; one
 * that only repositions toward a later home is a **staging** move (marked
 * with `HINT_SETTING_UP`).
 */

/** The shared "goal" prefix naming the tile a step works toward home,
 * e.g. `Working on tile 3: `. Both games build their narration from it so
 * the hints read as one voice. */
export function workingOn(tile: number): string {
  return `Working on tile ${tile}: `;
}

/** Shared marker appended to a staging move (one that does not yet land
 * its tile in its final spot). */
export const HINT_SETTING_UP = "(setting up)";
