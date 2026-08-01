# add-game-difficulty-contract — design

## D1: The shape

```ts
export interface DifficultyContract<Params> {
  /** Tier names, easiest first, indexed by cap. Matches the game's DIFF_NAMES. */
  readonly tiers: readonly string[];
  /** Which tier these params request. */
  tierOf(p: Params): number;
  /** The same params at a different tier. Pure — returns a new object. */
  withTier(p: Params, tier: number): Params;
  /** Run the game's solver with its ladder capped at `cap`. */
  solveAtCap(p: Params, desc: string, cap: number): DifficultyVerdict;
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

**It does not unify the difficulty *field name*.** 26 games spell it `diff` (13),
`difficulty` (12) and `diffLevel` (1). A rename would be safe — the field is
internal TypeScript, and the params *encoding* that game IDs depend on is
separate — but it is 26 games of churn buying nothing the contract's `tierOf` /
`withTier` accessors do not already buy. "Noticeably cleaner" is the standing bar
for a refactor and a field rename behind an accessor does not reach it.

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
3. **The declared tier list matches the game's own constants** — so a game that
   gains a tier cannot declare a stale list, which is the failure mode a
   hand-maintained enrollment list always eventually has.

**Boats declares `nonMonotone` and the guard changes rather than skips.** A
skipped game is an untested game wearing a comment; instead Boats asserts the
property its spec actually promises — that solving at each tier in turn and
taking the first success always succeeds, which is the workaround every consumer
is required to apply. That way the exemption is itself under test, and if Boats
were ever fixed the guard would tell us.

## D5: Sizing, and the honest risk

26 adapters, each roughly: read the tier off params, clone params with a new
tier, and call the existing solver with a cap. The per-game work is small
*because* the solvers already take a cap — that is what
`adopt-shared-deduction-fixpoint` confirmed while reading them.

The real risk is not the adapters, it is **an adapter that lies**: mapping a
game's `0` to `"unsolved"` when it means "impossible" would make a guard pass
vacuously. Two mitigations, both cheap: every adapter is written against the
solver's own documented return contract (each solver's header states it), and the
"every tier is reachable" guard fails loudly if an adapter reports `unsolved` for
a board its own generator just produced at that tier.
