# add-game-difficulty-contract — design

## D1: The shape

```ts
export interface DifficultyContract<Params> {
  /** Tier names, easiest first, indexed by cap. Matches the game's difficulty
   *  `paramConfig` choices — NOT its DIFF_* constants (see D6). */
  readonly tiers: readonly string[];
  /** Which tier these params request. */
  tierOf(p: Params): number;
  /** The same params at a different tier. Pure — returns a new object. */
  withTier(p: Params, tier: number): Params;
  /** Run the game's solver with its ladder capped at `cap`, from fresh state. */
  solveAtCap(p: Params, desc: string, cap: number): DifficultyVerdict;
  /**
   * Tiers that deliberately do NOT promise a uniquely-solvable board, so
   * "solvable at some cap" is the wrong question. Added during implementation
   * (see D7) — Dominosa's "Ambiguous" is a real menu entry whose generator skips
   * the uniqueness search entirely.
   */
  readonly nonUniqueTiers?: readonly number[];
  /**
   * Declared only by a game whose solver is known NOT to be monotone in its cap,
   * with the spec requirement that records why. Boats is the sole case: its
   * second-tier disjoint-set check can report a contradiction a board does not
   * have. Declaring it swaps the monotonicity guard for the workaround guard
   * (see D4) rather than skipping the game.
   */
  readonly nonMonotone?: true;
}

export type DifficultyVerdict = "solved" | "unsolved" | "impossible";
```

**The verdict has three members, not four.** "Stuck" and "ambiguous" are not
separable by several of these solvers — Magnets' `0` documents itself as
"ambiguous *or* unfinished" — and a member no adapter can populate faithfully is
worse than no member at all. `"impossible"` stays distinct because it means the
*desc* is wrong rather than the cap too low, which is a different bug to report.

## D1a: The helpers take a closure, not a `Game`

`tasks.md` specified `solvableAtExactlyTier(game, params, desc)`. **That
signature cannot be used where the helper is meant to be used.** The contract
lives on the `Game` object in `<game>/index.ts`, and `index.ts` imports
`generator.ts`; a generator applying the acceptance rule would close an import
cycle. So the helpers take a `CappedSolve = (cap: number) => DifficultyVerdict`,
which a generator can build from its own solver with no upward import, and
`cappedSolveFor(contract, p, desc)` bridges from the contract for callers that
have one.

That also dissolves task 1.2a without a second contract member: for `tier > 0`
the helper asks `tier - 1` **first** and short-circuits, so a too-easy board is
rejected before the deep solve is ever paid for — the ordering
`add-clusters-difficulty-tiers` D3 measured making its generator faster than it
had been before it had tiers. The helper never dictates how many passes a
verdict costs, only which question is asked first.

**`solveAtCap` returns a discriminated verdict, not a number.** Every game's
solver currently reports `-1 / 0 / 1` and the meanings are *not* uniform —
Magnets' `0` is "ambiguous or unfinished", Boats' is "stuck", Clusters returns a
status enum. Mapping each to three named outcomes at the adapter is where the
per-game knowledge belongs; propagating three magic integers across a
cross-game guard would import 26 different conventions into one file.

## D2: Why this is on `Game`, not in `registry.ts` or a testing file

Three candidate homes, and the choice matters more than it looks.

**`registry.ts`** — rejected. It maps `puzzleId → Game` and `catalog-registry.test.ts`
asserts that map equals the catalog in both directions. Its exactness is its
value; a second responsibility (difficulty metadata for 26 of 57 entries) makes
"the registry is the catalog" no longer the whole truth about it.

**A test-only enrollment file** (`engine/testing/difficulty-games.ts`, mirroring
`hint-games.ts`) — rejected, and this was the first design. Two things kill it.
The generator-acceptance helper that `grade-difficulty-tiers-honestly` needs is
**production** code, so the abstraction cannot be test-only without being
duplicated. And `enforce-module-layering` exempts exactly one engine→games
importer *by name*, deliberately refusing a wildcard over `engine/testing/` so a
second violation could not hide behind the first; adding a second enrollment file
means widening that exemption within days of narrowing it.

**`Game`** — chosen. It is already where a game declares optional capabilities
(`hint`, `hintKeepTrack`, `findMistakes`, `supersededDesc`, `paramConfig`,
`prefs`, `textFormat`). A tiered game declaring its tiers is that same shape. It
invents no new mechanism, needs no layering exemption, and is reachable from both
production and tests.

The cost is honest and worth stating: `Game` grows again, and an interface that
accretes optional hooks eventually needs splitting. It is at seven optional hooks
after this; that is not the threshold, but it is worth watching.

## D3: What this does NOT do

**It does not unify the difficulty *field name*.** Re-measured: 25 games spell it
`diff`, three `difficulty` (Bridges, Lightup, Pearl), and none `diffLevel` — the
proposal's "13 / 12 / 1" was wrong, and `diffLevel` is a local variable in
`singles/generator.ts`, never a params field. A rename would be safe but is 28
games of churn buying nothing the accessors do not.

**And the name split is not the obstacle anyway.** Eight games — Galaxies, Keen,
Mathrax, Singles, Spokes, Towers, Undead, Unequal — type the field as a **string
union or enum**, each with its own private `diffToLevel`. A cross-game caller
cannot write `{ ...p, diff: cap }` on a third of this population because `cap` is
an index and the field is not one. That, not the spelling, is why `tierOf` /
`withTier` are accessors going *through* the game rather than around it.

**It does not change any tier's meaning, or make any tier bind.** Making a tier
mean what it says is `grade-difficulty-tiers-honestly`; this change gives that one
the vocabulary and stops there. Keeping them separate is what lets this one be a
provable no-op.

**It does not add a `Game.generateAtTier`.** `newDesc(withTier(p, t), rng)` is
already that, and a second spelling of an existing capability is how a contract
starts to sprawl.

## D4: The guards, and the one exemption

The point of the contract is the cross-game guards it enables, in one file:

1. **Cap-monotonicity** — for each tiered game, generate a board, find the lowest
   cap that solves it, and assert every higher cap also solves it. This is the
   Boats defect class: a solver that solves at a *lower* cap what it fails at a
   higher one makes every consumer of the verdict unreliable, and it broke Check
   & Save on Easy boards without a single test noticing.
2. **Every declared tier is reachable** — generation at each tier succeeds.
3. **The declared tier list matches the game's difficulty `paramConfig`
   choices** (see D6 for why not its `DIFF_*` constants), and **every tier
   survives the params codec to a distinct game ID** — the second is the
   non-vacuous half, and is what fails when a game gains a rung and forgets to
   extend its `DIFF_CHARS`.
4. **The enrolled set is derived from the registry** — every registered game
   offering a difficulty choice must declare the contract, and vice versa. A
   hand-maintained list eventually goes stale, and the naming convention that
   would replace it has already missed Bridges once.

**Boats declares `nonMonotone` and the guard changes rather than skips.** A
skipped game is an untested game wearing a comment; instead Boats asserts the
property its spec actually promises — that solving at each tier in turn and
taking the first success always succeeds, which is the workaround every consumer
is required to apply. That way the exemption is itself under test, and if Boats
were ever fixed the guard would tell us.

## D5: Sizing, and the honest risk

28 adapters, each roughly: read the tier off params, clone params with a new
tier, and call the existing solver with a cap. The per-game work is small
*because* the solvers already take a cap — that is what
`adopt-shared-deduction-fixpoint` confirmed while reading them. What the sizing
missed is that the solvers take **seven different input shapes** (a `State`, a
game-specific board struct, a reusable `SolverScratch`, a solver class), so each
adapter also owns "build this game's solver input from a desc" — which is the
part that has to be got right, and where Mathrax's went wrong.

Four latin-family games (Group, Keen, Towers, Unequal) share one documented
return convention, so that mapping went into `engine/latin.ts` as `latinVerdict`
rather than into four adapters — four copies of one mapping is four places for a
sentinel to be forgotten.

The real risk is not the adapters, it is **an adapter that lies**: mapping a
game's `0` to `"unsolved"` when it means "impossible" would make a guard pass
vacuously. Two mitigations, both cheap: every adapter is written against the
solver's own documented return contract (each solver's header states it), and the
"every tier is reachable" guard fails loudly if an adapter reports `unsolved` for
a board its own generator just produced at that tier.

## D6: The tier list is declared, and checked against `paramConfig` — not `DIFF_*`

The proposal's guard *"the declared tier count matches the game's own `DIFF_*`
constants"* cannot be written, because **a `DIFF_*` constant is not reliably a
tier**. Solo declares eight and offers six (`DIFF_AMBIGUOUS` and
`DIFF_IMPOSSIBLE` are solver verdicts); Galaxies' `DIFF_NAMES` has five entries
and two selectable tiers; Singles has a `DIFF_MAX` *and* a `DIFF_ANY`; Salad has
a `DIFF_HOLESONLY` at −1. The family mixes rungs with outcomes, and no naming
rule separates them.

The anchor is the difficulty **`paramConfig` choices** — the tiers a player can
actually select, which cannot go stale without the custom-params dialog going
wrong. 27 games spell that item `kw: "difficulty"`; Loopy spells it `"diff"`, so
the guard matches the prefix.

**The honest limit, stated because the repo's own history demands it.** For the
seventeen games whose `paramConfig` spreads the same `DIFF_NAMES` the contract
names, this comparison is trivially true. That is the *better* outcome — one
source cannot drift from itself — and the check earns its keep on the eleven that
write the names out twice. What is genuinely non-vacuous everywhere is the second
guard: every declared tier must survive `encodeParams`/`decodeParams` to a
*distinct* game ID, which is what fails when a game gains a rung and forgets to
extend its `DIFF_CHARS`.

## D7: What implementation found that the proposal had not

Three things, all surfaced by the guards rather than by reading:

1. **A tier can relax the puzzle's promise rather than deepen its ladder.**
   Dominosa's difficulty menu ends with **"Ambiguous"**, and `newDominosaDesc`
   branches on it to skip the uniqueness search (`as.trivial(rng)`), so a board
   generated there is *meant* to have several solutions and solves at no cap.
   The contract gained `nonUniqueTiers`, and — following `nonMonotone`'s shape —
   the guard **swaps** the assertion rather than skipping: the board must
   actually come out non-unique, so a change that made Ambiguous start producing
   unique boards fails rather than passing quietly.

2. **An adapter did lie, and the guard caught it on the first run.** D5 named
   "an adapter that lies" as the real risk and predicted the reachability guard
   would catch it. Mathrax's first adapter passed a blank grid on the claim that
   the game has no givens; it has `F_IMMUTABLE` clues, and without them no board
   is solvable at any cap. Reported as a failure within seconds of the guard
   existing.

3. **A tier may be declared and generable nowhere, and that is legal.** Bricks
   refuses Tricky at every size (`grade-difficulty-tiers-honestly` measured that
   its rung decides nothing Normal's has not), yet the tier stays in the menu so
   a saved game or a desc-carrying game ID can still name it. So the guard is
   *"every tier generates **or** is refused with a reason"* — a tier that fails
   to generate and says nothing about why is a silent downgrade wearing a menu
   entry.

## D8: The sample size was measured, not chosen

The guard's first version generated **one** board per tier. Removing Boats'
`nonMonotone` declaration — the "prove it fails before trusting it" step — showed
it **did not fire**: Boats' first tier-0 seed happens to be monotone, so a guard
written specifically to hunt the Boats defect class was passing on luck. A direct
probe put the real rate at **7 of 8** Boats Easy boards non-monotone; four boards
per tier miss it about once in 4,000, and with four the exemption's removal fails
on the first board.

Cost: the whole file is 143 tests in ~6 s, across 28 games and every tier. The
slow tier (`npm run test:slow`) raises it to twelve.

**The transferable half**: a cross-game guard's *sampling* is where it silently
becomes decorative, and the only way to know is to break something it claims to
catch.
