/**
 * The cross-game win-celebration flash: flash for exactly `flashTime` when a
 * player move first brings the board from unsolved to solved without a cheat,
 * and don't flash otherwise, shared so the convention reads identically
 * everywhere.
 *
 * Every game's state spells the two flags `completed` and `cheated` (`ts-engine`,
 * "One completion vocabulary across games"), so reading them structurally is a
 * contract. **A differently spelled flag is not a reason to hand-write the
 * condition**, because it is not a difference a player can see.
 *
 * A game keeps its own `flashLength` only for a real difference:
 *
 *  - **more than one flashing outcome**: Samegame (won *and* stuck), Flood
 *    (won *and* lost), Inertia (died *and* collected the last gem), Blackbox
 *    (the reveal, which is not a win at all);
 *  - **a duration that is not the shared one**: Ascent, Net and Netslide scale
 *    theirs with the board so the animation sweeps it;
 *  - **a condition that is not "became solved"**: Mosaic reads its own clue
 *    counters, Map's duration comes off the `Ui`, Pegs and Sokoban have no
 *    cheat flag to test;
 *  - **`completed` is not a flag**: Fifteen, Sixteen, Twiddle and Slide store
 *    the move count they were solved at, frozen so the status bar stops
 *    counting.
 *
 * Dominosa's condition *is* the convention, so it calls this and then does its
 * one extra thing (clearing the hovered-pair highlight) with the answer.
 *
 * Most games set `completed` true and never back, so a solved board stays
 * solved and cannot present the re-completion case below; Palisade and
 * Separate recompute it. Un-latching the rest is per-game work: it changes
 * `status()` too, and with it the end-of-game dialog and the clock.
 */

/**
 * The win-flash duration: `flashTime` when a **player move** brings the board
 * into a solved state, else `0`.
 *
 * What is suppressed is the Solve *command*, not a cheated *board*: Solve is
 * exactly the move where `cheated` flips false→true. Using Solve, unmarking
 * some walls and re-solving by hand is a win, and it flashes. The cheat record
 * survives where it belongs, in the status bar and the midend's "solved with
 * help". A game that latches `completed` never presents that case, and for it
 * this behaves as a "never cheated" condition would.
 */
export function winFlash(
  from: { completed: boolean; cheated: boolean },
  to: { completed: boolean; cheated: boolean },
  flashTime: number,
): number {
  const becameSolved = !from.completed && to.completed;
  const thisMoveWasSolve = to.cheated && !from.cheated;
  return becameSolved && !thisMoveWasSolve ? flashTime : 0;
}
