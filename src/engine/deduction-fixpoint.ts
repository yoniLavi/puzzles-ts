/**
 * The shared deduction-fixpoint runner: an ordered ladder of *declared*
 * techniques that several logic games' solvers and hints share.
 *
 * **It does not fit every logic game, and it is important not to read it as
 * though it should.** This header used to claim it was "the one ordered-rung
 * loop every logic game hand-rolled", and that claim did real damage: it turns
 * the question "does this game fit?" into "why has this game not been adopted
 * yet?", and it produced two separate handoffs asserting that Loopy fits when it
 * does not. The audited position (`adopt-shared-deduction-fixpoint`, 2026-08-01)
 * is that the ladder *shape* is near-universal while the bookkeeping wrapped
 * around it is per-game — and that bookkeeping is often what decides which
 * puzzles exist. A solver whose loop *looks* like this one is not evidence that
 * it is this one; the differential is.
 *
 * Known no-gos, **re-derived against this contract** by
 * `declare-deduction-techniques` rather than carried forward (a reason a game
 * did not fit an earlier runner is not evidence about this one — and Unruly,
 * which used to head this list because it "grades by difficulty constant, not
 * rung index", now fits and has adopted). Each is a hook this runner refuses to
 * grow, because one hook per game turns it into a configuration language:
 *
 * - **Loopy** — each firing reports *the cheapest rung that could use the new
 *   information*, and rungs below that are skipped. A skip protocol, not a cap,
 *   and load-bearing for which boards generate.
 * - **Singles** — drains an op queue at the top of every iteration, runs four
 *   techniques once before the loop, and signals contradiction through a
 *   `state.impossible` flag rather than a `< 0` return.
 * - **Spokes** — its tier is an accumulated action *count*, so no per-technique
 *   `tier` can produce it.
 * - **Clusters** — its early-out is the three-valued `clustersValidate` verdict,
 *   which is also the function's return value.
 * - **Lightup** — its rungs are fused into one pass in upstream's scan order,
 *   load-bearing for generation. There is no ladder to declare.
 *
 * A logic game's generator and its explained hint are two projections of **one
 * deduction engine** (`adopt-narratable-deduction-engine`): the generator runs
 * the techniques to a fixpoint with no recorder (accepting a board only when
 * they solve it), and the hint runs the *same* techniques with a recorder that
 * captures each firing to narrate. Either way the *loop* is identical — an
 * ordered ladder, easiest first, that restarts from the top the moment any
 * technique fires ("return after first firing", which keeps one firing = one
 * hint group), stops when nothing fires (or the board is solved), caps the
 * ladder by tier while grading, and — on the recording path only — ticks a step
 * budget so a technique that reports progress without changing the board fails
 * loud instead of hanging, **naming itself as it does**.
 *
 * The **techniques stay per-game** (a nonogram overlap is nothing like a sudoku
 * hidden single); only this loop, the tier cap, the recorder-gated budget, the
 * grade bookkeeping and the non-termination attribution live here. Call sites:
 * `engine/latin.ts` (`latinSolverTop`, and through it the eleven latin-family
 * games), `games/filling/solver.ts` (`FillingSolver.run`),
 * `games/undead/solver.ts` (`recordUndeadDeductions`),
 * `games/pattern/solver.ts` (`deduceHintPlan`), `games/magnets/solver.ts`
 * (`solve`, `solveUnnumbered`) and `games/unruly/solver.ts` (`solveGame`).
 */
import { type StepBudget, StepBudgetExceeded } from "./step-budget.ts";

/**
 * One rung of a game's deduction ladder, **declared rather than anonymous**.
 *
 * A technique used to be a bare `() => number`, and its difficulty was its
 * *index in the array* — which meant a game whose techniques do not map
 * one-to-one onto its tiers could not use this runner at all (Unruly has five
 * techniques across three tiers, so it hand-rolled the loop). Declaring `tier`
 * decouples the grade from the position; declaring `id` gives the ladder names
 * a reader can see and a runaway loop can be blamed on.
 */
export interface DeductionTechnique {
  /**
   * Stable, greppable name — `"single-gap"`, `"wall-parity"`. Appears in the
   * step-budget's non-termination error, so it should name the technique the
   * way the game's own docs and narrations do.
   */
  id: string;
  /**
   * The difficulty tier this technique belongs to, in the game's own tier
   * numbering. Several techniques may share a tier; a tier need not be the
   * technique's position in the ladder, and grading never uses that position.
   */
  tier: number;
  /**
   * Apply the technique once from the current board and report the outcome as a
   * signed number, mirroring the per-game solvers' `-1 / 0 / >0` convention:
   * - `> 0` — fired (changed the board). The runner restarts the ladder from the
   *   top and takes this technique's `tier` as a grade candidate.
   * - `0` — nothing to do; the runner falls through to the next technique.
   * - `< 0` — proved the board inconsistent; the runner stops with
   *   `impossible: true`.
   *
   * On the recording (hint) path a technique also records its firing as a side
   * effect (through the game's own recorder / plan array); the runner is
   * oblivious to it.
   */
  run: () => number;
}

export interface DeductionFixpointOptions {
  /**
   * The ladder, easiest first. A pass tries the techniques in order and
   * restarts from the first the moment one fires.
   */
  techniques: readonly DeductionTechnique[];
  /**
   * Highest `tier` to attempt (inclusive). Caps the ladder while grading a tier
   * a cheaper technique already decides — no point paying for the expensive top
   * technique on a board a cheaper tier rejects anyway. Defaults to no cap.
   *
   * It **excludes by tier, not by position**: a cheap technique placed after an
   * expensive one still runs under a low cap. That is the honest reading of
   * "this technique belongs to Easy", and it is why a ladder whose tiers are not
   * monotonically increasing is legal here.
   */
  maxTier?: number;
  /**
   * The grade returned when no technique ever fires (the floor / "simple"
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
   * Run once before each technique attempt — e.g. `latinSolverTop` bumps its
   * firing-group id here so every record of one firing shares a `group`. Not
   * called for a technique the tier cap excludes.
   */
  beforeTechnique?: (technique: DeductionTechnique) => void;
  /**
   * Optional early-out, checked at the top of every iteration (after the budget
   * tick, before any technique): return `true` when the board is fully solved
   * (or a contradiction has surfaced) so the ladder stops without a wasted no-op
   * pass — Filling checks `nempty === 0`, Undead `anyEmpty`, Pattern "no cell
   * left unknown". Checking at the top (not after a firing) also means a
   * technique is never run on an already-finished board, so it can't manufacture
   * a spurious step.
   */
  solved?: () => boolean;
}

export interface DeductionFixpointResult {
  /** The highest `tier` that fired, or `baseGrade` if none did. */
  grade: number;
  /** A technique reported a contradiction (returned `< 0`). */
  impossible: boolean;
}

/**
 * Wrap the recording path's budget so that tripping it answers the question
 * `stepBudget`'s message has always asked and never been able to answer — *"a
 * hint rule is reporting progress without changing the board?"* — by naming the
 * techniques, by firing count, most-fired first. A runaway technique holds ~the
 * whole budget against its name; everything honest has a handful.
 *
 * Only `tick()` is wrapped, not the ladder: a `StepBudgetExceeded` thrown from
 * *inside* a technique (a game whose deduction runs its own budgeted sub-solve)
 * belongs to that budget and must pass through unattributed. Narrowing it here
 * also keeps the fixpoint loop's own shape untouched.
 */
function attributingBudget(
  budget: StepBudget,
  firings: ReadonlyMap<string, number>,
): StepBudget {
  return {
    tick(): void {
      try {
        budget.tick();
      } catch (e) {
        if (!(e instanceof StepBudgetExceeded)) throw e;
        const byCount = [...firings].sort((a, b) => b[1] - a[1]);
        const tally = byCount.length
          ? byCount.map(([id, n]) => `${id} ×${n}`).join(", ")
          : "no technique fired (the early-out or the caller's tick, not a technique)";
        throw new StepBudgetExceeded(`${e.message} Techniques by firings: ${tally}.`, {
          cause: e,
        });
      }
    },
  };
}

/**
 * Run the ordered techniques to a fixpoint (see the module doc). Returns the
 * reached grade and whether a technique proved the board inconsistent; callers
 * handle `impossible` first (the reported `grade` is meaningless then).
 */
export function runDeductionFixpoint(
  opts: DeductionFixpointOptions,
): DeductionFixpointResult {
  const { techniques, maxTier, baseGrade = 0, beforeTechnique, solved } = opts;
  let grade = baseGrade;
  // Firing attribution exists only where the budget does, so the generator path
  // allocates nothing and runs the loop it always ran.
  const firings = opts.budget ? new Map<string, number>() : null;
  const budget =
    opts.budget && firings ? attributingBudget(opts.budget, firings) : undefined;

  for (;;) {
    budget?.tick();
    if (solved?.()) break;
    let fired = false;
    for (const technique of techniques) {
      if (maxTier !== undefined && technique.tier > maxTier) continue;
      beforeTechnique?.(technique);
      const ret = technique.run();
      if (ret < 0) return { grade, impossible: true };
      if (ret > 0) {
        firings?.set(technique.id, (firings.get(technique.id) ?? 0) + 1);
        if (technique.tier > grade) grade = technique.tier;
        fired = true;
        break;
      }
    }
    if (!fired) break;
  }

  return { grade, impossible: false };
}
