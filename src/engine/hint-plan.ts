/**
 * The shared plan-accumulation loop every recording deduction pass runs.
 *
 * A hint that is "a second projection of the solver" (docs/games/hints.md §
 * "Re-derive the named technique") always ends up writing the same five lines:
 * from a working copy of the player's board, while the board is still
 * unfinished, ask for the *single* next forced firing, stop when there is none,
 * apply it, record it.
 *
 * Only the **loop** is shared. Every `next` rung order, every reason type and
 * every narration string stays in its game — an exemplar hint never loses a
 * word to an abstraction.
 *
 * **Both bounds are parameters, deliberately.** Spokes and Bricks bound the
 * plan by *length* ("the player rarely follows more than a few steps before
 * diverging, and a recompute yields the next batch"); Clusters and Subsets
 * bound it by a {@link StepBudget} (the non-termination guard, which catches a
 * rule reporting progress without changing the board). Those answer different
 * questions, so the helper takes both.
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
  /**
   * Whether a firing is worth putting in front of the player. Omit it and every
   * firing is a step.
   *
   * **A firing that is not showable still advances the working board** — it is
   * a real deduction and later firings may rest on it — but it becomes no step.
   * That is the whole mechanism, and it carries two obligations the loop cannot
   * check for you:
   *
   * - **Hide only what the player can already see.** A later step may cite a
   *   hidden firing's conclusion as a premise. That is fine when the player's
   *   own board already shows it (Tracks: a blocked side beside a square they
   *   have marked empty) and a lie when it does not.
   * - **Never hide a change the win condition needs**, or following the plan
   *   never finishes the board. `hint-resume.test.ts` catches that one.
   *
   * It is judged *after* the firing is applied (by `apply`, or by a `next` that
   * applies as it detects), so it must read only facts the firing itself cannot
   * have created.
   *
   * Two games derive it from move legality, from opposite directions. Galaxies
   * hides a firing whose move the game would **refuse** (an arrow drawn inside a
   * closed region); Tracks hides one whose **contrary** move the game would
   * refuse, because then the player's board has already decided it. Both are
   * docs/games/hints.md § "Show only what the board does not already say".
   */
  showable?(board: Board, firing: Firing): boolean;
  /**
   * Hard cap on plan length — a UX bound, not a correctness one. It counts
   * **shown** steps: a cap on firings silently becomes a refusal when a run of
   * hidden ones spends it.
   */
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
  /** The shown firings in deduction order — the hint's steps, before narration. */
  plan: Firing[];
  /**
   * How many firings advanced the board without being shown. The number a
   * test needs to prove its corpus exercised {@link HintPlanSpec.showable} at
   * all — a guard over hidden firings that saw none proves nothing.
   */
  hidden: number;
}

export function deduceHintPlan<Board, Firing, Status>(
  spec: HintPlanSpec<Board, Firing, Status>,
): HintPlanResult<Firing, Status> {
  const { board, planCap, budget } = spec;
  const plan: Firing[] = [];
  let hidden = 0;

  for (;;) {
    // Ticked for hidden firings too, so a run of them that never ends still
    // throws rather than hanging.
    budget?.tick();

    const status = spec.status(board);
    if (status !== spec.incomplete) return { status, plan, hidden };
    if (planCap !== undefined && plan.length >= planCap)
      return { status: spec.incomplete, plan, hidden };

    // `== null`, not `!firing`: `Firing` is generic, so a falsy-but-real firing
    // (a cell index of 0, an empty string) must not read as "deduction exhausted".
    const firing = spec.next(board);
    if (firing == null) return { status: spec.incomplete, plan, hidden };

    spec.apply?.(board, firing);
    if (spec.showable && !spec.showable(board, firing)) {
      hidden++;
      continue;
    }
    plan.push(firing);
  }
}
