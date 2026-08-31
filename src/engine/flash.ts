/**
 * The cross-game win-celebration flash: flash for exactly `flashTime` when a
 * player move first brings the board from unsolved to solved without a cheat,
 * and don't flash otherwise. This module is that one-liner, shared so the
 * convention reads identically everywhere.
 *
 * Every game's state now spells the two flags `completed` and `cheated`, so
 * reading them structurally is a contract rather than the compromise it was
 * (`ts-engine`, "One completion vocabulary across games"). **A differently
 * spelled flag is not a reason to hand-write the condition**, because it is not
 * a difference a player can see.
 *
 * A game keeps its own `flashLength` only for a real difference, and each of
 * the survivors has one on record:
 *
 *  - **more than one flashing outcome** — Samegame (won *and* stuck), Flood
 *    (won *and* lost), Inertia (died *and* collected the last gem), Blackbox
 *    (the reveal, which is not a win at all);
 *  - **a duration that is not the shared one** — Ascent, Net and Netslide scale
 *    theirs with the board so the animation sweeps it;
 *  - **a condition that is not "became solved"** — Palisade and Separate flash
 *    a manual completion made *after* a Solve (owner-requested), Mosaic reads
 *    its own clue counters, Map's duration comes off the `Ui`, Pegs and Sokoban
 *    have no cheat flag to test;
 *  - **`completed` is not a flag** — Fifteen, Sixteen, Twiddle and Slide store
 *    the move count they were solved at, frozen so the status bar stops
 *    counting.
 *
 * Dominosa is the near-miss worth knowing about: its condition *is* the
 * convention, so it calls this and then does its one extra thing (clearing the
 * hovered-pair highlight) with the answer.
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
