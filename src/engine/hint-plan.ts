/**
 * The shared plan-accumulation loop every recording deduction pass runs.
 *
 * A hint that is "a second projection of the solver" (docs/games/hints.md § "Re-derive the named technique")
 * always ends up writing the same five lines: from a working copy of the
 * player's board, while the board is still unfinished, ask for the *single*
 * next forced firing, stop when there is none, apply it, record it. Spokes,
 * Bricks, Clusters and Subsets each arrived at that loop independently, and
 * Boats would have been the fifth copy.
 *
 * Only the **loop** is shared. Every `next` rung order, every reason type and
 * every narration string stays in its game — an exemplar hint never loses a
 * word to an abstraction.
 *
 * **Both bounds are parameters, deliberately.** Spokes and Bricks bound the
 * plan by *length* ("the player rarely follows more than a few steps before
 * diverging, and a recompute yields the next batch"); Clusters and Subsets
 * bound it by a {@link StepBudget} (the §7.2 non-termination guard, which
 * catches a rule reporting progress without changing the board). Those answer
 * different questions, so the helper takes both rather than picking one and
 * retuning two shipped hints.
 */

import type { StepBudget } from "./step-budget.ts";

export interface HintPlanSpec<Board, Firing, Status> {
  /**
   * The working board. **The caller clones** — the clone call is one
   * game-specific line (`cloneBoard`, `grid.slice()`, `cloneState`) and
   * threading a `clone` callback through would only hide it.
   */
  board: Board;
  /** The board's status; deduction stops as soon as it leaves {@link incomplete}. */
  status(board: Board): Status;
  /** The status value that means "keep deducing" (`"unfinished"`, `UNFINISHED`, …). */
  incomplete: Status;
  /** The next forced firing from `board`, or `null` when deduction is exhausted. */
  next(board: Board): Firing | null;
  /**
   * Apply a firing to the working board. Omit when `next` already applies as
   * it goes (Subsets' rungs mutate their working state to find the firing at
   * all, so re-applying would be wrong, not merely redundant).
   */
  apply?(board: Board, firing: Firing): void;
  /** Hard cap on plan length — a UX bound, not a correctness one. */
  planCap?: number;
  /** Non-termination guard, ticked once per iteration (docs/games/hints.md § "The step budget"). */
  budget?: StepBudget;
}

export interface HintPlanResult<Firing, Status> {
  /**
   * The board's status when deduction stopped: {@link HintPlanSpec.incomplete}
   * when the plan ran dry (or hit its cap) with the board unfinished, otherwise
   * whatever the board reached.
   */
  status: Status;
  /** The firings in deduction order — the hint's steps, before narration. */
  plan: Firing[];
}

export function deduceHintPlan<Board, Firing, Status>(
  spec: HintPlanSpec<Board, Firing, Status>,
): HintPlanResult<Firing, Status> {
  const { board, planCap, budget } = spec;
  const plan: Firing[] = [];

  for (;;) {
    budget?.tick();

    const status = spec.status(board);
    if (status !== spec.incomplete) return { status, plan };
    if (planCap !== undefined && plan.length >= planCap)
      return { status: spec.incomplete, plan };

    // `== null`, not `!firing`: `Firing` is generic, so a falsy-but-real firing
    // (a cell index of 0, an empty string) must not read as "deduction exhausted".
    const firing = spec.next(board);
    if (firing == null) return { status: spec.incomplete, plan };

    spec.apply?.(board, firing);
    plan.push(firing);
  }
}
