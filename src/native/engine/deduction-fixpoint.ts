/**
 * The shared deduction-fixpoint runner: the one ordered-rung loop every logic
 * game's solver/hint hand-rolled before this.
 *
 * A logic game's generator and its explained hint are two projections of **one
 * deduction engine** (`adopt-narratable-deduction-engine`): the generator runs
 * the technique rungs to a fixpoint with no recorder (accepting a board only
 * when they solve it), and the hint runs the *same* rungs with a recorder that
 * captures each firing to narrate. Either way the *loop* is identical — an
 * ordered ladder of techniques, easiest first, that restarts from the top the
 * moment any rung fires ("return after first firing", which keeps one firing =
 * one hint group), stops when nothing fires (or the board is solved), caps the
 * ladder while grading, and — on the recording path only — ticks a step budget
 * so a rung that reports progress without changing the board fails loud instead
 * of hanging.
 *
 * The **techniques stay per-game** (a nonogram overlap is nothing like a sudoku
 * hidden single); only this loop, the difficulty cap, the recorder-gated budget,
 * and the grade bookkeeping live here. Call sites: `engine/latin.ts`
 * (`latinSolverTop`), `games/filling/solver.ts` (`FillingSolver.run`),
 * `games/undead/solver.ts` (`recordUndeadDeductions`), and
 * `games/pattern/solver.ts` (`deduceHintPlan`).
 */
import type { StepBudget } from "./step-budget.ts";

/**
 * One technique rung: apply the technique once from the current board and report
 * the outcome as a signed number, mirroring the per-game solvers' `-1 / 0 / >0`
 * convention:
 * - `> 0` — the rung fired (changed the board). The runner restarts the ladder
 *   and records this rung's index as a grade candidate.
 * - `0` — the rung found nothing to do; the runner falls through to the next.
 * - `< 0` — the rung proved the board inconsistent; the runner stops with
 *   `impossible: true`.
 *
 * On the recording (hint) path a rung also records its firing as a side effect
 * (through the game's own recorder / plan array); the runner is oblivious to it.
 */
export type DeductionRung = () => number;

export interface DeductionFixpointOptions {
  /**
   * Ordered rungs, easiest first. A pass tries them in order and restarts from
   * the first the moment one fires.
   */
  rungs: readonly DeductionRung[];
  /**
   * Highest rung index to attempt (inclusive). Caps the ladder while grading a
   * tier a cheaper rung already decides — no point paying for the expensive top
   * rung on a board a cheaper tier rejects anyway. Defaults to the last rung.
   */
  maxRung?: number;
  /**
   * The grade returned when no rung ever fires (the floor / "simple"
   * difficulty). Defaults to `0`.
   */
  baseGrade?: number;
  /**
   * The recording-path step budget, ticked once per outer iteration. Present
   * only on the hint/recording path; the generator/solve path omits it and runs
   * unguarded (and byte-for-byte unchanged).
   */
  budget?: StepBudget;
  /**
   * Run once before each rung attempt — e.g. `latinSolverTop` bumps its
   * firing-group id here so every record of one firing shares a `group`.
   */
  beforeRung?: (rung: number) => void;
  /**
   * Optional early-out, checked at the top of every iteration (after the budget
   * tick, before any rung): return `true` when the board is fully solved (or a
   * contradiction has surfaced) so the ladder stops without a wasted no-op pass
   * — Filling checks `nempty === 0`, Undead `anyEmpty`, Pattern "no cell left
   * unknown". Checking at the top (not after a firing) also means a rung is
   * never run on an already-finished board, so it can't manufacture a spurious
   * step.
   */
  solved?: () => boolean;
}

export interface DeductionFixpointResult {
  /** The highest rung index that fired, or `baseGrade` if none did. */
  grade: number;
  /** A rung reported a contradiction (returned `< 0`). */
  impossible: boolean;
}

/**
 * Run the ordered technique rungs to a fixpoint (see the module doc). Returns
 * the reached grade and whether a rung proved the board inconsistent; callers
 * handle `impossible` first (the reported `grade` is meaningless then).
 */
export function runDeductionFixpoint(
  opts: DeductionFixpointOptions,
): DeductionFixpointResult {
  const { rungs, baseGrade = 0, budget, beforeRung, solved } = opts;
  const cap = opts.maxRung ?? rungs.length - 1;
  let grade = baseGrade;

  for (;;) {
    budget?.tick();
    if (solved?.()) break;
    let fired = false;
    for (let r = 0; r <= cap; r++) {
      beforeRung?.(r);
      const ret = rungs[r]();
      if (ret < 0) return { grade, impossible: true };
      if (ret > 0) {
        grade = Math.max(grade, r);
        fired = true;
        break;
      }
    }
    if (!fired) break;
  }

  return { grade, impossible: false };
}
