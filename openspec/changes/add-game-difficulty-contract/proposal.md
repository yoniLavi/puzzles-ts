# add-game-difficulty-contract

## Why

**Twenty-six games have difficulty tiers and no two of them can be asked about
them the same way.** Measured 2026-08-01: 26 games carry `DIFF_*` constants, and
the field naming alone is three-way split — `diff` (13 games), `difficulty` (12),
`diffLevel` (Singles). There is no way to write a sentence about "every tiered
game" in code.

That gap has already cost twice, in different currencies:

1. **`adopt-shared-deduction-fixpoint` could assert cap-monotonicity for exactly
   one game.** The property — *a board solvable with the ladder capped at `d` is
   solvable at every cap above `d`* — is what Boats violated, silently breaking
   Check & Save on Easy boards, because "solvable at Easy" and "solvable at
   Tricky" were both true statements about different code paths and nothing
   compared them. Magnets now has that test. The other 25 do not, and the
   archived audit recorded the reason as *"there is no uniform way to call their
   solvers — a cross-game version needs a per-game `(generate, solveAtCap)`
   registry that does not exist."* This change is that registry.

2. **`grade-difficulty-tiers-honestly` has to write the same fix 26 times.** That
   change (already scaffolded, and next in the owner's order) makes a tier mean
   what it says: reject a board that a *lower* tier already solves. Every tiered
   game needs the same acceptance rule, and without a shared way to express
   "solve at cap `d-1`" each generator re-implements it — which is precisely how
   Bricks and Mathrax ended up with the defect while eight other games did not.

**Generation is already uniform; only the solving half is missing.**
`Game.newDesc(params, rng)` is on the production interface and every game
implements it. So the contract this change adds is small: what the tiers are, how
to read and set one on a params object, and how to run the solver capped at one.

## What Changes

- **Add an optional `Game.difficulty` contract** — the tier names, `tierOf(params)`,
  `withTier(params, tier)`, and `solveAtCap(params, desc, cap)` returning a
  discriminated verdict. Optional, like `hint`, `findMistakes` and
  `supersededDesc` before it, so the 31 untiered games are untouched.
- **Implement it for all 26 tiered games.** Each game's solver already takes a cap
  (Magnets' `solve(diff)`, and so on), so the adapter is a small closure, not new
  logic.
- **Ship the guards the contract makes possible**, as one cross-game test file:
  - **cap-monotonicity** for every tiered game — the Boats defect class, hunted
    across the collection instead of one game at a time;
  - **a tier is reachable** — each declared tier actually generates;
  - **the declared tier count matches the game's own `DIFF_*` constants**, so a
    game that gains a tier cannot forget to declare it.
- **Ship a shared generator-acceptance helper** (`solvableAtExactlyTier`) that
  `grade-difficulty-tiers-honestly` can then apply uniformly rather than
  re-deriving per game.
- **Record Boats' exemption in the contract itself**, not in a comment: its
  non-monotonicity is a known, worked-around property (`boats` spec), so it
  declares itself non-monotone and the guard asserts the *workaround* holds
  instead — that solving at each tier and taking the first success always
  succeeds.

## On combining it with the existing registry

The owner's suggestion was to fold this into "the game registry that we already
use to expose the games to the menu". **The better version of that instinct is
the `Game` interface, not `registry.ts`** — and this change takes it.

`registry.ts` is a `Map<string, Game>` whose only job is id→implementation
lookup; `catalog-registry.test.ts` asserts it equals the catalog in both
directions, and giving it a second responsibility would blur a boundary that is
currently exact. The `Game` interface is where a game already declares its
optional capabilities, so a tiered game declaring its tiers is the same shape as
a hinting game declaring `hint`. Nothing new is invented and the registry stays
one thing.

It is deliberately **not** a test-only enrollment file in the
`engine/testing/hint-games.ts` style either. That was the first design, and it is
wrong here for two reasons: the generator-acceptance helper above is *production*
code, and `enforce-module-layering` exempts exactly one engine→games importer by
name — a second one would widen an exemption that was made narrow on purpose.

## Impact

- Affected specs: `ts-engine` (the new optional hook), `ts-migration` (the
  cross-game guarantee, replacing the one-game version).
- Affected code: `engine/game.ts`, a new `engine/difficulty.ts`, 26 game
  `index.ts` files, and one new cross-game test file.
- **No behaviour change.** The contract is additive and describes what each game
  already does; no differential may move. A moving fixture means an adapter
  misreports its game's solver, which is a defect in this change.
- **Expect the guards to find something.** The cap-monotonicity property has never
  been checked on 25 of these games, and it was false on Boats. Any failure is a
  shipped bug, and gets fixed and reported under `grade-difficulty-tiers-honestly`
  rather than absorbed here.
