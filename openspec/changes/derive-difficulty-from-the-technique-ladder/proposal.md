# derive-difficulty-from-the-technique-ladder

Realizes: `docs/framework-rdd/game-definition.md` § "Params and presets" —
*"if your techniques carry tiers … there is no hand-written
`DifficultyContract`; it is a projection of the technique ladder"*.

**Outcome: the ladder cannot supply it, and something better could.** The
proposal's premise did not survive task 1's reading. What shipped is the
projection that *does* exist — and it removes more per-game surface than the
proposed one would have, across more than twice as many games.

## Why

**28 games hand-wrote a `DifficultyContract`** whose `tiers` array duplicated the
tier names their own custom-params form already declared, held together only by
`difficulty-contract.test.ts` asserting the two agreed. A projection removes the
opportunity for them to disagree in the first place, which is the
`derive-hint-enrollment` move: stop asserting that two hand-maintained things
match, and derive one from the other.

The proposal expected the technique ladder to be the source, because
`declare-deduction-techniques` had just given every technique a declared `tier`
and *"the ladder now knows its own tiers, and nothing reads them"*. It knows its
tier **numbers**. That is the gap the reading found.

## What the reading found

**Scope (task 1), by reading rather than grepping.** 14 games run a solver on the
shared fixpoint runner — Group, Keen, Mathrax, Salad, Towers and Unequal through
`engine/latin.ts`; Clusters, Filling, Magnets, Pattern, Singles, Spokes, Undead
and Unruly directly. 29 games declare a difficulty contract (not 28 — the count
in `difficulty.ts` and in two test headers had drifted). **The overlap is 12**:
Filling and Pattern are on the runner and untiered. Boats and Loopy name
`runDeductionFixpoint` only in doc comments explaining why they do *not* use it,
exactly as the proposal warned; a third name-keyed scan failed here too, because
`grep 'latinSolver('` misses the six real call sites, which are all written
`latinSolver<Ctx>(`.

**The projection is impossible, for three independent reasons.** Each is fatal
alone, so the no-go does not depend on the scope figure:

1. **A ladder declares tier *indices*; a tier list is *names*.**
   `DeductionTechnique.tier` is a `number`; `tiers` is the strings a player reads.
2. **The projection runs the wrong way.** `runDeductionFixpoint` *receives*
   `maxTier`. Every ladder is an array literal built inside a solve, closing over
   board state — there is nothing to interrogate at module load, which is when
   `paramConfig` and the params codec need the list. `engine/latin.ts` is the
   sharpest case: it synthesizes rungs `0..maxdiff`, so asking that ladder for
   its tiers returns the cap it was handed.
3. **A tier is not always a rung.** Five latin games put their top tier on
   `latinSolverRecurse`, outside the fixpoint (and the latin ladder still
   synthesizes a permanently-dead rung for it); Dominosa's "Ambiguous" is a
   relaxation of what the puzzle promises; **Undead's** only ladder on the shared
   runner is its *hint recorder*, two techniques both on tier 0, while the game
   offers three tiers.

Recorded as a spec requirement so it is answered by reading rather than by
re-surveying the games.

## What Changes

- **`tiers` is gone from `DifficultyContract`.** The tier list is
  `difficultyTiers(game)` — the game's own difficulty `paramConfig` choices,
  which is the list a player picks from and the only one reachable at module
  load. 29 hand-written `tiers` declarations deleted.
- **Eight games stop declaring their tier names twice.** Bridges, Keen, Singles,
  Solo, Towers and Unruly wrote a second string literal into `paramConfig`; they
  now spread their own constant. Loopy ran the same `.map` twice. Galaxies and
  Lightup's single literal is now the only one.
- **`tierOf` / `withTier` stay per-game**, as proposed — they are about the
  params *record*, which no menu and no ladder knows anything about.
- **`solveAtCap` stays per-game, decided on evidence.** Read across all 29: the
  only shared step is `newState(p, desc)`, one line each; the cap passes straight
  through and the verdict mapping is the per-game knowledge the discriminated
  verdict exists to hold. The shared part was `latinVerdict`, already extracted.
- **The lost assertion is replaced by a stronger one.** `tiers === choices` could
  pass on two equal arrays belonging to different params fields. The new guard
  asserts the form item's `get`/`set` and the contract's `tierOf`/`withTier` move
  the same tier, at every tier — which is what actually fails if the derivation
  finds the wrong `choices` item. Two further checks a single list can still
  fail — no duplicate tier names, no blank ones — did not exist before.

## Impact

- Affected specs: `ts-engine` (the difficulty contract requirement; a new
  requirement recording the ladder no-go).
- Affected code: `src/engine/difficulty.ts`, 29 game `index.ts` files, and five
  test files that read the tier list.
- **Behavior unchanged, and it was already proven so before the edit.**
  `difficulty-contract.test.ts` asserted `tiers === choices` for all 29 games and
  was green in the gate, so the derived list is the hand-written list by an
  existing proof rather than by inspection.
