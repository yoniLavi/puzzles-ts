/**
 * The cross-game win-celebration flash. Most ported games flash for exactly
 * `flashTime` when a player move first brings the board from unsolved to solved
 * without a cheat, and don't flash otherwise. This module is that one-liner,
 * shared so the convention reads identically everywhere.
 *
 * Reads `completed` / `cheated` structurally — the field names the
 * candidate-elimination games (Keen/Towers/Unequal/Solo) and the simple grid
 * games (Filling/Unruly) share. A game whose solved / cheat flags are named
 * differently (Undead's `solved`, Range's `wasSolved`/`hasCheated`, Singles'
 * `usedSolve`) or that flashes on a bespoke condition (Palisade, Mosaic, Flip's
 * solve celebration, animated reveals) keeps its own `flashLength`.
 */

/** The win-flash duration: `flashTime` on a fresh, un-cheated unsolved→solved
 * transition (a player move that just solved the board), else `0`. */
export function winFlash(
  from: { completed: boolean; cheated: boolean },
  to: { completed: boolean; cheated: boolean },
  flashTime: number,
): number {
  return !from.completed && to.completed && !from.cheated && !to.cheated
    ? flashTime
    : 0;
}
