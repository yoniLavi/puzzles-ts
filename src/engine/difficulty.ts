/**
 * The cross-game difficulty contract: what a tiered game's tiers are, how to
 * read and set one on a params object, and how to run its solver capped at one.
 *
 * **Why this exists.** Twenty-eight of the fifty-seven games have difficulty
 * tiers, and before this contract no two of them could be asked about their
 * tiers the same way — so a property that is *about* tiers could only ever be
 * asserted one game at a time, by hand. The property in question is
 * cap-monotonicity (a board solvable with the ladder capped at `d` is solvable
 * at every cap above `d`), and it is not theoretical: Boats shipped a solver
 * that solved boards at a *lower* cap which it failed at a higher one, which
 * silently broke Check & Save on every Easy board, because "solvable at Easy"
 * and "solvable at Tricky" were both true statements about different code paths
 * and nothing compared them. Four games have since hand-written a version of
 * that test — in three different strengths, which is what a shared guard exists
 * to stop. `difficulty-contract.test.ts` is the shared guard.
 *
 * **Why the accessors, rather than a documented field name.** The obstacle is
 * not that the params field is spelled `diff` in twenty-five games and
 * `difficulty` in three. It is that **eight games do not hold a number there at
 * all** — Galaxies, Keen, Mathrax, Singles, Spokes, Towers, Undead and Unequal
 * type it as a string union or an enum, each with its own private
 * `diffToLevel`. A cross-game caller cannot write `{ ...p, diff: cap }` on a
 * third of this population, because `cap` is an index and the field is not one.
 * `tierOf` / `withTier` go through the game rather than around it.
 *
 * **Why a discriminated verdict, rather than the solvers' integers.** Every
 * game's solver reports some flavour of `-1 / 0 / 1`, and the meanings are not
 * uniform: Magnets' `0` is "ambiguous or unfinished", Boats' is "stuck",
 * Clusters returns a three-valued status enum, Tracks returns a record. Mapping
 * each to three named outcomes belongs in the per-game adapter, where the
 * knowledge is; propagating the raw integers would import twenty-eight
 * conventions into every cross-game consumer.
 *
 * **The contract describes; it never decides.** Adopting it changes no board a
 * game generates — a differential fixture that moves means an adapter
 * misreports its game's solver.
 */

/**
 * A capped solver's answer about one board.
 *
 * - `"solved"` — the solver reached the unique solution within the cap.
 * - `"unsolved"` — it ran out of technique (stuck, or the board is ambiguous at
 *   this cap). This is the *only* honest reading of most solvers' `0`, which is
 *   why "stuck" and "ambiguous" are not separate members: several games cannot
 *   distinguish them and a member no adapter can populate faithfully is worse
 *   than none.
 * - `"impossible"` — it proved the board inconsistent. Kept distinct from
 *   `"unsolved"` because it means the *desc* is wrong, not the cap too low, and
 *   a guard that saw it would be reporting a different bug.
 */
export type DifficultyVerdict = "solved" | "unsolved" | "impossible";

/** A solver bound to one board, callable at any cap. See
 * {@link solvableAtExactlyTier} for why the helpers take this rather than the
 * game: a generator applying its own acceptance rule cannot import its own
 * `index.ts` without closing a cycle, but it can always close over its solver. */
export type CappedSolve = (cap: number) => DifficultyVerdict;

/**
 * What a tiered game declares about its tiers. Optional on `Game`, exactly like
 * `hint` / `findMistakes` / `supersededDesc` before it: a game without tiers
 * omits it, and the twenty-nine untiered games need no edit.
 */
export interface DifficultyContract<Params> {
  /**
   * The tier names, easiest first, indexed by cap — the tiers a player can
   * actually select.
   *
   * This SHALL match the game's own difficulty `paramConfig` choices, and is
   * deliberately **not** derived from its `DIFF_*` constants, which cannot
   * carry that weight: a `DIFF_*` constant is sometimes a deduction rung and
   * sometimes a solver verdict. Solo declares eight and offers six
   * (`DIFF_AMBIGUOUS` and `DIFF_IMPOSSIBLE` are outcomes); Galaxies' `DIFF_NAMES`
   * has five entries and two tiers; Singles has a `DIFF_MAX` *and* a `DIFF_ANY`;
   * Salad has a `DIFF_HOLESONLY` at −1.
   */
  readonly tiers: readonly string[];

  /** Which tier these params request, as an index into {@link tiers}. */
  tierOf(p: Params): number;

  /** The same params at a different tier. Pure — returns a new object and
   * never mutates `p`, so a caller may probe every tier of one params object. */
  withTier(p: Params, tier: number): Params;

  /** Run the game's solver over `desc` with its deduction ladder capped at
   * `cap`, from a *fresh* solver state. Freshness is load-bearing: reusing a
   * live scratch is how `grade-difficulty-tiers-honestly`'s first Ascent gate
   * under-rejected, because a retained `foundEndpoints` deliberately weakens
   * that solver — and it left side effects behind for the next caller. */
  solveAtCap(p: Params, desc: string, cap: number): DifficultyVerdict;

  /**
   * Tier indices that deliberately do **not** promise a uniquely-solvable
   * board, so "solvable at some cap" is the wrong question to ask of them.
   *
   * Dominosa is the sole case, and it was found by this contract's own guards
   * rather than anticipated: the fifth entry in its difficulty menu is
   * **"Ambiguous"**, and its generator branches on it to skip the uniqueness
   * search entirely (`if (diff === DIFF_AMBIGUOUS) as.trivial(rng)`). So a tier
   * is not always a rung of the deduction ladder — it can instead be a
   * *relaxation of what the puzzle promises*, and a board generated there is
   * meant to have several solutions.
   *
   * Declaring the tier **swaps** the guard rather than skipping it: the board
   * must actually come out non-unique. If a future change made Ambiguous
   * generate unique boards, the tier would have stopped meaning what it says,
   * and that is worth failing over.
   */
  readonly nonUniqueTiers?: readonly number[];

  /**
   * Declared only by a game whose solver is known **not** to be monotone in its
   * cap, alongside the spec requirement that records why. Boats is the sole
   * case: its `checkDsf` rung, which runs from Normal upward, counts an
   * unfinished run of length `k` as a completed size-`k` boat, so it can report
   * a contradiction the board does not have.
   *
   * Declaring this **swaps** the monotonicity guard for the workaround guard —
   * it does not skip the game. A skipped game is an untested game wearing a
   * comment, and the exemption has to be under test so that fixing the
   * underlying defect becomes visible.
   */
  readonly nonMonotone?: true;
}

/** Bind a contract to one board, for the closure-shaped helpers below. */
export function cappedSolveFor<Params>(
  contract: DifficultyContract<Params>,
  p: Params,
  desc: string,
): CappedSolve {
  return (cap) => contract.solveAtCap(p, desc, cap);
}

/**
 * Does this board genuinely need tier `tier` — solvable there, and *not* at the
 * tier below it?
 *
 * This is the generator-acceptance rule that makes a tier mean what it says.
 * `grade-difficulty-tiers-honestly` had to spell it out four separate times
 * (Bricks, Mathrax, Salad, Ascent) because there was nowhere to put it;
 * `add-subsets-difficulty-tiers` and `add-sticks-difficulty-tiers` apply this
 * instead.
 *
 * **It takes a closure, not a `Game`.** A generator is where this rule belongs,
 * and a generator cannot reach the contract on its own `Game` — `index.ts`
 * imports `generator.ts`, so the call would close an import cycle. Closing over
 * the game's own solver has no such problem and needs no new module.
 *
 * **It asks the cheap question first.** For `tier > 0` it solves at `tier - 1`
 * before `tier`, so a board the easier ladder already cracks is rejected
 * without ever paying for the deeper solve — and a generator that retries in a
 * loop pays the cheap half far more often than the expensive one. That ordering
 * is not a micro-optimisation: `add-clusters-difficulty-tiers` (D3) measured it
 * making the whole generator *faster than it had been before it had tiers*
 * (10×10 Tricky worst case 25.0 s → 10.9 s). It also leaves a game free to
 * answer both questions from a single fixpoint if its tiers are nested rungs of
 * one — this helper never dictates how many passes a verdict costs, only which
 * question is asked first.
 *
 * The easiest tier has nothing below it, so there it means "solvable at all".
 */
export function solvableAtExactlyTier(solve: CappedSolve, tier: number): boolean {
  if (tier > 0 && solve(tier - 1) === "solved") return false;
  return solve(tier) === "solved";
}

/**
 * The lowest cap at which this board solves, or `null` if no cap up to
 * `tierCount - 1` does.
 *
 * Scanning upward is also the shape of Boats' `solveAtAnyTier` workaround, which
 * is why a non-monotone game's guard can be phrased in terms of this: on a
 * monotone solver "the lowest cap that works" and "every cap from there up
 * works" are the same statement, and on a non-monotone one only the first
 * survives.
 */
export function lowestSolvingCap(solve: CappedSolve, tierCount: number): number | null {
  for (let cap = 0; cap < tierCount; cap++) {
    if (solve(cap) === "solved") return cap;
  }
  return null;
}
