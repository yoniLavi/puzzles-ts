/**
 * What a hint says when it will not give one.
 *
 * A refusal is the message a player is *most* likely to meet without warning and
 * least likely to interpret correctly, and `help/features.md` §Hints teaches the
 * two that matter as a pair — "there is a mistake on the board" and "deduction
 * has run out" call for opposite responses. That contract is only keepable if
 * the same situation says the same thing in every game, since a player moves
 * between games freely.
 *
 * **Every builder of a `hint()` imports from here, including the shared ones**
 * (`candidate-hint.ts` is the whole `hint()` of the candidate games), and
 * `hint-refusal.test.ts` reads the engine's hint builders as well as
 * `src/games/`, because a refusal lives wherever a `hint()` is built.
 *
 * **What a game may still differ on.** The bar is whether we can say what a game
 * would legitimately want to do differently, and there are four real answers:
 * a game whose board can be *inconsistent without any single cell being
 * provably wrong* needs {@link CONTRADICTION_UNLOCALIZED}, because
 * {@link FIX_MISTAKES_FIRST} promises a highlight that will not appear; a
 * **non-deductive** game must not say "deduced" at all
 * ({@link NO_MOVE_WORTH_MAKING}); a game whose hint is a bounded **search** has
 * a reach rather than a deduction, and past it can only say so
 * ({@link SEARCH_OUT_OF_REACH}); and a game with a genuinely game-shaped dead
 * end says so in its own words (Inertia's dead ball). Everything else is
 * spelling, and `hint-refusal.test.ts` holds it to this list.
 */

/** The board is finished. Nothing to hint. */
export const ALREADY_SOLVED = "This board is already solved.";

/**
 * Something on the board contradicts the solution, and the offending cells
 * **are about to be highlighted** — the midend runs `findMistakes` on every
 * refusal path, so this message keeps its own promise only where the game has
 * already established there is something to find. Emit it under a
 * `findMistakes(state).length > 0` guard, never speculatively.
 */
export const FIX_MISTAKES_FIRST =
  "Fix the highlighted mistakes first; a hint can't deduce from a wrong board.";

/**
 * The board is inconsistent, but no individual entry can be proved wrong — so
 * there is nothing for `findMistakes` to light up, and
 * {@link FIX_MISTAKES_FIRST} would point at a highlight that never comes.
 * Distinct because the player's next action differs: they cannot fix the cell
 * they are shown, only undo or clear what they are unsure of.
 */
export const CONTRADICTION_UNLOCALIZED =
  "These entries contradict each other, so one of them must be wrong. Undo, or clear the ones you are unsure of.";

/**
 * Nothing further follows from what is on the board. The counterpart to
 * {@link FIX_MISTAKES_FIRST}: the board is *sound*, the reasoning has simply run
 * out — which is what a tier named `Unreasonable` promises can happen.
 *
 * **There is one situation here, not two, and that is a measurement rather than
 * a judgment** (2026-09-08): walking every preset of every hinting game found
 * **thirteen refusals and every one was on a board whose tier permits search**;
 * nothing refused on a deduction-complete tier at any size, in any mode. A
 * wording that hedges about whether trial and error is expected therefore
 * describes a state no player occupies. `hint-resume.test.ts` holds that: a
 * refusal outside a search-permitting tier fails the walk.
 *
 * **The wording is Galaxies', the one that went through owner acceptance**, and
 * the only one that tells the player what to *do*. A refusal that says only
 * that nothing follows leaves them unable to tell a puzzle demanding a guess
 * from a broken hint, which is the pair `help/features.md` §Hints teaches as
 * calling for opposite responses.
 */
export const DEDUCTION_EXHAUSTED =
  "Nothing further follows by deduction here. This board's difficulty allows positions that need trial and error: save a checkpoint, try one, and undo if it breaks.";

/** The non-deductive counterpart to {@link DEDUCTION_EXHAUSTED}: a game that
 * walks a player toward a solution rather than teaching a technique has no
 * deduction to run out of, so it must not claim one.
 *
 * **It is a claim about the board, and only a game that can check it may say
 * it.** Every remaining call site is a construction that cannot come back empty
 * on an unsolved board — Fifteen's row-by-row placement, Flood's solver,
 * Inertia's tour — so the message is a backstop that states the truth if it
 * ever fires. A game whose hint is a bounded *search* is in the opposite
 * position: an empty result there says only that it did not find one, which is
 * {@link SEARCH_OUT_OF_REACH}. */
export const NO_MOVE_WORTH_MAKING = "No move here would get you closer.";

/**
 * A hint that *searches* has a **reach**, and this board is past it.
 *
 * The counterpart to {@link DEDUCTION_EXHAUSTED} for a game with nothing to
 * deduce. A deductive game's hint is complete for its tier or the tier admits
 * search, and either way it can say something true about the position. A game
 * like Sixteen has neither: its hint plans by searching ahead a bounded number
 * of moves, and past that bound the only true thing to say is that it did not
 * find a way — never {@link NO_MOVE_WORTH_MAKING}, which asserts something
 * about the board that the search never established.
 *
 * The distinction is not a nicety. Sixteen's tangled endgames are solvable
 * boards a dozen moves from home on which every single slide looks worse, and
 * the player meeting them had followed thirty hints to get there; being told
 * that no move would help is both false and a reason to stop playing.
 *
 * **So it says what to do instead, in the two ways that work.** Playing on
 * changes the board, and a board the search could not reach is often one move
 * from one it can; revealing the answer ends the game but is honest about doing
 * so. The control it names is the rail's `Show solution…` — deliberately not
 * `Auto-solve for me`, which is *continuous hinting* and would refuse for the
 * same reason the hint just did. Naming it would have been advice that cannot
 * work, on the one screen a player has just been let down on.
 *
 * `hint-resume.test.ts` accepts this as an honest end to its walk, but only
 * from a game whose hint really is a bounded search — derived from the game's
 * own source, not from a roster.
 */
export const SEARCH_OUT_OF_REACH =
  "I can't find a way home from here: this position is further ahead than the hint can search. Play a few moves of your own and ask again, or take the answer from Show solution.";

/** The puzzle itself cannot be reasoned about — not a statement about anything
 * the player did. Kept apart from the refusals above because no action of
 * theirs will clear it. */
export const PUZZLE_NOT_REASONABLE = "This puzzle's solution can't be determined.";

/**
 * The two refusals every deductive game owes before it starts reasoning, in the
 * order they must be asked: a finished board first, then a wrong one.
 *
 * Games pass the two facts rather than the state, because `completed` lives
 * under a different name in several games and `findMistakes` is each game's own
 * — and a helper that took the `Game` could not be called from inside the very
 * `hint` that object is being built from.
 *
 * Returns `null` when neither applies, so the call site reads as a guard:
 *
 * ```ts
 * const refusal = commonHintRefusal(state.completed, findMistakes(state).length);
 * if (refusal) return refusal;
 * ```
 */
export function commonHintRefusal(
  completed: boolean,
  mistakeCount: number,
): { ok: false; error: string } | null {
  if (completed) return { ok: false, error: ALREADY_SOLVED };
  if (mistakeCount > 0) return { ok: false, error: FIX_MISTAKES_FIRST };
  return null;
}
