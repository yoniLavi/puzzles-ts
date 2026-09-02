/**
 * What a hint says when it will not give one.
 *
 * A refusal is the message a player is *most* likely to meet without warning and
 * least likely to interpret correctly, and `help/features.md` §Hints teaches the
 * two that matter as a pair — "there is a mistake on the board" and "deduction
 * has run out" call for opposite responses. That contract is only keepable if
 * the same situation says the same thing in every game; twenty-one games each
 * inventing a phrasing is how "I can't find a deduction from here" and "No
 * further move can be deduced from this position." came to be the same refusal
 * wearing two faces, in games a player moves between freely.
 *
 * **What a game may still differ on.** The bar is whether we can say what a game
 * would legitimately want to do differently, and there are three real answers:
 * a game whose board can be *inconsistent without any single cell being
 * provably wrong* needs {@link CONTRADICTION_UNLOCALIZED}, because
 * {@link FIX_MISTAKES_FIRST} promises a highlight that will not appear; a
 * **non-deductive** game must not say "deduced" at all
 * ({@link NO_MOVE_WORTH_MAKING}); and a game with a genuinely game-shaped dead
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
  "Fix the highlighted mistakes first — a hint can't deduce from a wrong board.";

/**
 * The board is inconsistent, but no individual entry can be proved wrong — so
 * there is nothing for `findMistakes` to light up, and
 * {@link FIX_MISTAKES_FIRST} would point at a highlight that never comes.
 * Distinct because the player's next action differs: they cannot fix the cell
 * they are shown, only undo or clear what they are unsure of.
 */
export const CONTRADICTION_UNLOCALIZED =
  "These entries contradict each other — one of them must be wrong. Undo, or clear the ones you are unsure of.";

/** Nothing further follows from what is on the board. The counterpart to
 * {@link FIX_MISTAKES_FIRST}: the board is *sound*, the reasoning has simply run
 * out, which is what an `Unreasonable` tier promises can happen. */
export const NO_DEDUCTION_LEFT = "No further move can be deduced from this position.";

/** {@link NO_DEDUCTION_LEFT} for a board whose tier says this is the expected
 * end of the road rather than a shortfall. */
export const NO_DEDUCTION_LEFT_TRIAL_AND_ERROR =
  "No further move can be deduced from this position — this board needs trial and error from here.";

/** The non-deductive counterpart to {@link NO_DEDUCTION_LEFT}: a game that
 * walks a player toward a solution rather than teaching a technique has no
 * deduction to run out of, so it must not claim one. */
export const NO_MOVE_WORTH_MAKING = "No move here would get you closer.";

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
