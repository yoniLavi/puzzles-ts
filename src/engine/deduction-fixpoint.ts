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
 * **Two games do not fit, and the list is re-derived whenever this contract
 * changes — never carried forward.** That rule has now earned itself twice:
 * `declare-deduction-techniques` gave a technique its own `tier` and Unruly
 * stopped being a no-go; `re-derive-the-fixpoint-no-gos` then read the remaining
 * five solvers instead of their recorded reasons and found that **three of them
 * had never needed anything added** — Singles, Clusters and Spokes all adopted
 * with no new option on this runner. The reasons had been written against a
 * runner that graded by array position, and then read as facts about the games.
 * So: a reason that describes a loop's *syntax* is not evidence; only a reason
 * that names a promise this runner makes, and that the game must break, is.
 *
 * - **Loopy** — each firing reports *the cheapest rung that could use the new
 *   information*, and the next pass then skips techniques below it. The promise
 *   it breaks is the central one: *a pass attempts every technique at or below
 *   the cap*, which is what makes one firing = one hint step and grading honest.
 *   It transcribes mechanically (three closures over a mutable pair) — and that
 *   is the argument against doing it: today the protocol is four lines in one
 *   place, labeled load-bearing for which boards generate, and transcribing it
 *   would satisfy the interface while hiding it inside it.
 * - **Lightup** — there is no ladder. Its two techniques are interleaved *per
 *   cell* inside a single grid scan whose order is load-bearing, and the pass
 *   sweeps the whole grid before restarting; "return after first firing" is
 *   precisely what it must not do. Wrapping the fused scan in one technique
 *   would buy indirection and no shared behavior: a one-rung ladder has no
 *   tier, no cap and nothing to restart.
 *
 * Both carry the bespoke-loop hatch's obligations (narratability, honest
 * grading, budgets — `docs/games/solver-and-generator.md` § "Where the fixpoint
 * does not fit"). One is honestly unmet: **Loopy ships no `hint()`**, so its
 * narratability obligation is vacuous rather than satisfied.
 *
 * **A conditionally-available technique guards itself in `run` and returns `0`.**
 * Unruly set the precedent (its `unique` variant is a rule of the board, not a
 * rung-ordering question) and Spokes needs it for a look-ahead that runs at
 * *exactly* Tricky rather than Tricky-and-above. This runner grows no `when`
 * predicate, deliberately: it would be indistinguishable from returning `0` and
 * would exist only to document, which is how a runner becomes a configuration
 * language.
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
 * grade bookkeeping and the non-termination attribution live here.
 *
 * **Sixteen call sites, of which seven arrived at once**
 * (`adopt-the-deduction-runner-where-it-rewires`, 2026-09-09). The earlier nine
 * are `engine/latin.ts` (`latinSolverTop`, and through it the **six** games that
 * call `latinSolver` — Group, Keen, Mathrax, Salad, Towers, Unequal; this said
 * "eleven" until `derive-difficulty-from-the-technique-ladder` counted them,
 * because ten more games import `engine/latin.ts` for `latinGenerate`,
 * `matching`, `latinVerdict` or the repeat types, and Solo hand-rolls its own
 * `mainloop`), plus Filling, Undead, Pattern, Magnets, Unruly, Singles,
 * Clusters and Spokes. The seven added are **Tracks, Seismic, Subsets, Rome,
 * Ascent, Galaxies and Bridges** — every game whose hand-written loop already
 * wrote this runner's shape, found by reading all 30 off-engine solvers
 * (`explore-the-deduction-engine-reach`).
 *
 * **Write the query, not its answer**: the live list is a comment-stripped scan
 * for `runDeductionFixpoint` under `src/games/`, because five name-keyed counts
 * of this population went wrong in one session — Loopy's and Boats' headers
 * *explain why they do not use this runner* and a plain grep counted them in.
 *
 * **Each of the seven ships a ladder-equivalence test**
 * (`engine/testing/ladder-equivalence.ts`), and the reason is worth knowing
 * before adopting an eighth: Tracks' byte-match differential passed the
 * adoption and could not have failed it. Deleting one of its eight rungs
 * entirely left all 39 of its tests green, because that rung fires on no board
 * its generator produces. A fixture corpus certifies only the rungs it fires and
 * cannot tell you which those are.
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

/**
 * Per-rung firing counts, keyed by {@link DeductionTechnique.id}.
 *
 * Counts rather than a set of ids, because the step budget's non-termination
 * attribution needs *how many* — "a runaway technique holds ~the whole budget
 * against its name" — and a census that only needs membership reads the keys.
 * One map serves both; two would be two things to keep in step.
 */
export type FiringTally = Map<string, number>;

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
   * A caller-supplied tally the runner writes each firing into, keyed by
   * {@link DeductionTechnique.id} — **how a caller observes which rungs a board
   * actually reached.**
   *
   * A ladder's rungs are not all reachable, and nothing in a game's own results
   * says which are: `ladder-equivalence.ts` exists because deleting one of
   * Tracks' eight rungs left all 39 of its tests green. So a corpus that walks
   * the ladder needs a census, and this is where it comes from.
   *
   * **A sink rather than a returned value, deliberately.** This runner is called
   * *inside* a game's solver, so a tally on {@link DeductionFixpointResult}
   * would have to be threaded back out through each game's own return shape —
   * seven different shapes, each widened for a reader that is not the game. A
   * sink passes straight through in one line. It replaced seven copies of a
   * ladder-wrapping closure that did the same counting by hand
   * (`return-the-firing-tally-from-the-runner`).
   *
   * **Omit it and the runner allocates nothing**, which is the generator path's
   * standing rule. When a `budget` is present the runner needs a tally anyway
   * for non-termination attribution; supplying one here means both read the same
   * map, so a budget trip on a recording path is attributed through the caller's
   * own census.
   */
  firings?: FiringTally;
  /**
   * Run once before each technique attempt — e.g. `latinSolverTop` bumps its
   * firing-group id here so every record of one firing shares a `group`. Not
   * called for a technique the tier cap excludes.
   */
  beforeTechnique?: (technique: DeductionTechnique) => void;
  /**
   * Optional early-out, checked at the top of every iteration (after the budget
   * tick, before any technique): return `true` when **the ladder should stop
   * because there is nothing left for it to do**.
   *
   * That is deliberately broader than "solved", which is what this was called
   * until `re-derive-the-fixpoint-no-gos` and what it has never meant: Undead
   * has always used it to stop on a *contradiction* (`anyEmpty`), Clusters stops
   * on complete-or-invalid, and Spokes also stops when the action budget its own
   * `DIFF_LIMITED` tier imposes is spent. Only Filling (`nempty === 0`) and
   * Pattern ("no cell left unknown") mean solved. A hook whose name is wrong for
   * most of its callers is one you have to read the doc comment to use at all.
   *
   * Checking at the top (not after a firing) also means a technique is never run
   * on an already-settled board, so it can't manufacture a spurious step.
   */
  settled?: () => boolean;
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
  const { techniques, maxTier, baseGrade = 0, beforeTechnique, settled } = opts;
  let grade = baseGrade;
  // A tally exists only where a caller asked for one or a budget needs one, so
  // the generator path allocates nothing and runs the loop it always ran.
  const firings = opts.firings ?? (opts.budget ? new Map<string, number>() : null);
  const budget =
    opts.budget && firings ? attributingBudget(opts.budget, firings) : undefined;

  for (;;) {
    budget?.tick();
    if (settled?.()) break;
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
