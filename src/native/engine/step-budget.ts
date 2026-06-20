/**
 * A cooperative operation budget for hint deduction loops.
 *
 * Hint solvers run to a fixpoint (`for (;;)` / `while (true)` "repeat until no
 * progress"). A regression that reports progress without actually changing the
 * board turns that into an infinite loop *inside a single `hint()` call* — a
 * hang the caller can't bound by counting moves (no move is ever produced). The
 * only backstop would otherwise be a wall-clock test timeout, which is slow,
 * opaque, and load-sensitive (the very flakiness we avoid).
 *
 * A `StepBudget` is ticked once per fixpoint iteration. Honest deduction
 * finishes in at most ~one iteration per board cell, orders of magnitude under
 * the limit, so the guard never fires on real work — it converts a future
 * non-terminating loop into an immediate, labelled failure instead.
 *
 * It is **opt-in**: only the hint/recording path constructs one, so generators
 * (which run the same fixpoints without a recorder) are entirely unaffected.
 */
export class StepBudgetExceeded extends Error {}

export interface StepBudget {
  /** Count one iteration; throw {@link StepBudgetExceeded} past the limit. */
  tick(): void;
}

/** A budget big enough that no honest deduction approaches it (a real fixpoint
 * converges in ~cells iterations), but a true infinite loop trips in well under
 * a second. */
export const DEFAULT_HINT_STEP_LIMIT = 1_000_000;

export function stepBudget(
  label: string,
  limit: number = DEFAULT_HINT_STEP_LIMIT,
): StepBudget {
  let n = 0;
  return {
    tick(): void {
      if (++n > limit) {
        throw new StepBudgetExceeded(
          `${label}: deduction did not terminate within ${limit} steps ` +
            "(a hint rule is reporting progress without changing the board?)",
        );
      }
    },
  };
}
