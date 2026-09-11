/**
 * The cross-game difficulty contract: how to read and set a tier on a params
 * object, and how to run the game's solver capped at one. **What the tiers
 * *are* is not part of it** — see {@link difficultyTiers}.
 *
 * **Why this exists.** Without one contract no two tiered games can be asked
 * about their tiers the same way, so a property that is *about* tiers can only
 * be asserted one game at a time, by hand. The property in question is
 * cap-monotonicity (a board solvable with the ladder capped at `d` is solvable
 * at every cap above `d`), and it is not theoretical: Boats shipped a solver
 * that solved boards at a *lower* cap which it failed at a higher one, which
 * silently broke Check & Save on every Easy board, because "solvable at Easy"
 * and "solvable at Tricky" were both true statements about different code paths
 * and nothing compared them. `difficulty-contract.test.ts` is the shared guard.
 *
 * **Why the accessors, rather than a documented field name.** The obstacle is
 * not that the params field is spelled `diff` in some games and `difficulty` in
 * others. It is that several games do not hold a number there at all — Galaxies,
 * Keen, Spokes and others type it as a string union or an enum, each with its
 * own private `diffToLevel`. A cross-game caller cannot write
 * `{ ...p, diff: cap }` for those, because `cap` is an index and the field is
 * not one. `tierOf` / `withTier` go through the game rather than around it.
 *
 * **Why a discriminated verdict, rather than the solvers' integers.** Every
 * game's solver reports some flavor of `-1 / 0 / 1`, and the meanings are not
 * uniform: Magnets' `0` is "ambiguous or unfinished", Boats' is "stuck",
 * Clusters returns a three-valued status enum, Tracks returns a record. Mapping
 * each to three named outcomes belongs in the per-game adapter, where the
 * knowledge is; propagating the raw integers would import every game's
 * convention into every cross-game consumer.
 *
 * **The contract describes; it never decides.** Adopting it changes no board a
 * game generates — a differential fixture that moves means an adapter
 * misreports its game's solver.
 */
// Type-only, so the `game.ts` ⇄ `difficulty.ts` pair is erased at compile time
// and no runtime cycle exists.
import type { ParamConfigItem } from "./game.ts";

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
 * How to *operate* on a tiered game's tiers — read one off a params record, set
 * one, solve capped at one. Optional on `Game`: a game without tiers omits it.
 *
 * **The tier list itself is not here** — it is {@link difficultyTiers}, read
 * off the game's own custom-params form. The contract is operations; the
 * declaration is the menu.
 */
export interface DifficultyContract<Params> {
  /** Which tier these params request, as an index into
   * {@link difficultyTiers}. */
  tierOf(p: Params): number;

  /** The same params at a different tier. Pure — returns a new object and
   * never mutates `p`, so a caller may probe every tier of one params object. */
  withTier(p: Params, tier: number): Params;

  /** Run the game's solver over `desc` with its deduction ladder capped at
   * `cap`, from a *fresh* solver state. Freshness is load-bearing: a reused
   * scratch can carry state that weakens the solver (Ascent's retained
   * `foundEndpoints` does) and leaves side effects for the next caller. */
  solveAtCap(p: Params, desc: string, cap: number): DifficultyVerdict;

  /**
   * Tier indices that deliberately do **not** promise a uniquely-solvable
   * board, so "solvable at some cap" is the wrong question to ask of them.
   *
   * Dominosa is the sole case: the fifth entry in its difficulty menu is
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

/**
 * A tiered game's tier names, easiest first, indexed by cap — **read off the
 * game's own custom-params form**, which is where a player picks one.
 * `undefined` for a game that offers no difficulty choice.
 *
 * **One declaration, not two.** The form is the only list: it is the one a
 * player actually sees, and it is reachable at module load with no board in
 * hand. A second copy on the contract could only be held equal to it by an
 * assertion.
 *
 * **Why not from the technique ladder.** Three independent reasons, each fatal
 * on its own:
 *
 * 1. **The ladder declares tier *indices*; a tier list is *names*.**
 *    `DeductionTechnique.tier` is a `number`. "Easy" and "Unreasonable" are
 *    strings a player reads, and no projection invents them from integers.
 * 2. **The projection runs the wrong way.** `runDeductionFixpoint` *receives*
 *    `maxTier`, derived from a tier index — it is downstream of the tier list.
 *    And every ladder in this repo is an array literal built *inside* a solve,
 *    closing over board state, so there is nothing to interrogate at module
 *    load, which is when `paramConfig` and the params codec need the list.
 *    `engine/latin.ts` makes this vivid: it synthesizes its rungs as
 *    `0..maxdiff`, so asking that ladder for its tiers returns the cap it was
 *    handed.
 * 3. **A tier is not always a rung.** Towers/Keen/Group/Unequal/Mathrax put
 *    their top tier on `latinSolverRecurse`, outside the fixpoint entirely;
 *    Dominosa's "Ambiguous" is a relaxation of what the puzzle promises
 *    ({@link DifficultyContract.nonUniqueTiers}); Undead's only ladder on the
 *    shared runner is its *hint recorder*, whose two techniques both sit on
 *    tier 0 while the game offers three tiers. A ladder-derived list would be
 *    short for all of them.
 *
 * The prefix match, rather than `kw === "difficulty"`, because Loopy spells its
 * `kw` `diff`, and matching the prefix keeps a future `diff-level` enrolled
 * instead of silently unwatched.
 */
export function difficultyTiers<Params>(game: {
  paramConfig?: readonly ParamConfigItem<Params>[];
}): readonly string[] | undefined {
  return difficultyChoiceItem(game)?.choices;
}

/**
 * The custom-params item {@link difficultyTiers} reads, whole — its `get` /
 * `set` included.
 *
 * Exported because the tier list alone cannot prove the finder found the
 * *difficulty* item, so the coupling is asserted against the contract's own
 * accessors instead: `item.set(p, i)` must be the same thing as
 * `withTier(p, i)`, for every tier. `difficulty-contract.test.ts` makes it.
 */
export function difficultyChoiceItem<Params>(game: {
  paramConfig?: readonly ParamConfigItem<Params>[];
}): Extract<ParamConfigItem<Params>, { type: "choices" }> | undefined {
  const item = game.paramConfig?.find(
    (i) => i.type === "choices" && /^diff/.test(i.kw),
  );
  return item?.type === "choices" ? item : undefined;
}

/**
 * The collection's difficulty scale, easiest first — the words a game's tiers
 * are named from unless it declares an override.
 *
 * `Unreasonable` is deliberately **not** in it: it is not a rung of this scale
 * but a promise about one, reserved by the `ts-engine` spec for a tier whose
 * boards can require Search and forbidden elsewhere. {@link tierNames} appends
 * it on request, which is why that request is a declared fact about the top
 * rung rather than a position.
 */
const TIER_SCALE = ["Easy", "Normal", "Tricky", "Hard", "Extreme"] as const;

/**
 * The conventional names for a game with `count` tiers: the first `count` of
 * {@link TIER_SCALE}, with the last replaced by `"Unreasonable"` when the
 * game's top rung can require Search.
 *
 * ```
 *   tierNames(2)                    Easy · Normal
 *   tierNames(2, { search: true })  Easy · Unreasonable
 *   tierNames(4)                    Easy · Normal · Tricky · Hard
 *   tierNames(4, { search: true })  Easy · Normal · Tricky · Unreasonable
 *   tierNames(6, { search: true })  Easy · Normal · Tricky · Hard · Extreme · Unreasonable
 * ```
 *
 * **Why positional.** Deriving the name from the position makes it a bijection
 * — "Tricky" is the third rung everywhere it appears — which is the only
 * property that makes a tier name worth reading across a collection, and it
 * spares a new game from inventing names for its levels (an owner decision:
 * convention over configuration).
 *
 * **`search` is about the rung, never the count.** A two-tier game whose harder
 * rung backtracks is `Easy · Unreasonable`; a six-tier game whose top rung is a
 * bounded tactic never earns the word. Getting this from the position instead
 * would publish the promise `features.md` § "Difficulty" makes to players and
 * break it.
 *
 * **Override by writing the array instead**, and say why in the change. Dominosa
 * is the standing case: its fifth entry is "Ambiguous", a relaxation of what the
 * puzzle promises rather than a difficulty, and it declares that already through
 * {@link DifficultyContract.nonUniqueTiers} — so the guard checks its first four
 * against the convention and leaves the fifth alone, with no list to maintain.
 */
export function tierNames(count: number, opts?: { search?: boolean }): string[] {
  const room = TIER_SCALE.length + (opts?.search ? 1 : 0);
  if (!Number.isInteger(count) || count < 2 || count > room) {
    // Loud rather than short: a silently-truncated list would give the game
    // fewer tier names than tiers, and every cross-game guard iterates the
    // names. Widen TIER_SCALE deliberately if a game ever needs a seventh rung.
    throw new RangeError(
      `tierNames: ${count} tiers is outside the scale (2..${room}${
        opts?.search ? " with search" : ""
      })`,
    );
  }
  const named = TIER_SCALE.slice(0, opts?.search ? count - 1 : count);
  return opts?.search ? [...named, "Unreasonable"] : [...named];
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
 * is not a micro-optimization: it measured making Clusters' whole generator
 * *faster than it had been before it had tiers* (10×10 Tricky worst case
 * 25.0 s → 10.9 s). It also leaves a game free to
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
