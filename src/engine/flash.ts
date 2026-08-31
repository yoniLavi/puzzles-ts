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
 *  - **a condition that is not "became solved"** — Mosaic reads its own clue
 *    counters, Map's duration comes off the `Ui`, Pegs and Sokoban have no
 *    cheat flag to test;
 *  - **`completed` is not a flag** — Fifteen, Sixteen, Twiddle and Slide store
 *    the move count they were solved at, frozen so the status bar stops
 *    counting.
 *
 * Dominosa is the near-miss worth knowing about: its condition *is* the
 * convention, so it calls this and then does its one extra thing (clearing the
 * hovered-pair highlight) with the answer.
 *
 * **The remaining gap is upstream of here.** Almost every game sets `completed`
 * true and never back, so a solved board stays solved and the re-completion
 * case above is one it cannot present. Palisade and Separate recompute instead.
 * Un-latching the rest is per-game work — it changes `status()` too, and with
 * it the end-of-game dialog and the clock — and is deliberately not bundled
 * into a vocabulary change.
 */

/**
 * The win-flash duration: `flashTime` when a **player move** brings the board
 * into a solved state, else `0`.
 *
 * What is suppressed is the Solve *command*, not a cheated *board* — Solve is
 * exactly the move where `cheated` flips false→true. The difference is a real
 * one a player reported: after using Solve, unmarking some walls and re-solving
 * by hand produced no celebration, because the gate vetoed any board that had
 * ever been cheated. That is a win, and it flashes. The cheat record survives
 * where it belongs, in the status bar and the midend's "solved with help".
 *
 * Whether a game can *reach* that case is its own business: it needs
 * `completed` recomputed each move rather than latched once, so that breaking
 * and re-solving is a genuine unsolved→solved transition. A game that latches
 * it simply never presents the case, and this behaves for it exactly as the
 * older, stricter condition did.
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
