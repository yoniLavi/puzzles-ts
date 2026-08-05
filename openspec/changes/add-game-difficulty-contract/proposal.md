# add-game-difficulty-contract

## Why

**Twenty-eight games have difficulty tiers and no two of them can be asked about
them the same way.** There is no way to write a sentence about "every tiered
game" in code.

**Three corrections to the counts this change was scaffolded on, all
instructive** — and the third is the one that decides the design.

1. The original `DIFF_*` grep missed **Bridges**, whose tiers are a plain
   `difficulty: number` against a `DIFFICULTY_NAMES` array
   (`grade-difficulty-tiers-honestly` D1) — so this change's proposed guard
   *"the declared tier count matches the game's own `DIFF_*` constants"*
   inherits a blind spot that would let exactly that game ship a stale list.
   **Enumerate from the registry and `paramConfig`, not from a naming
   convention.** And **Clusters** gained tiers on 2026-08-04
   (`add-clusters-difficulty-tiers`), which is why the headline says 28: the
   population is not fixed, so the enumeration must be derived, not transcribed.

2. A `DIFF_*` constant is **not reliably a tier**. Solo declares eight of them
   and offers six (`DIFF_AMBIGUOUS` and `DIFF_IMPOSSIBLE` are solver *verdicts*);
   Galaxies' `DIFF_NAMES` has five entries and two selectable tiers; Singles has
   a `DIFF_MAX` *and* a `DIFF_ANY`; Salad has a `DIFF_HOLESONLY` at `-1`. So the
   guard anchors on the difficulty **`paramConfig` `choices`** instead — the
   tiers a player can actually select, which cannot go stale without the
   custom-params dialog going wrong. 27 games spell that item `kw: "difficulty"`
   and Loopy spells it `kw: "diff"`.

3. **The stated field split was itself mismeasured, and the truth is a stronger
   argument.** The proposal said `diff` (13) / `difficulty` (12) / `diffLevel`
   (Singles); re-measured against the declared `Params` interfaces it is `diff`
   (25) / `difficulty` (3: Bridges, Lightup, Pearl) / `diffLevel` (**0** — it is
   a local variable in `singles/generator.ts`, never a params field). But **eight
   games do not carry a number there at all**: Galaxies, Keen, Mathrax, Singles,
   Spokes, Towers, Undead and Unequal type it as a string union or enum
   (`diff: Difficulty`, `diff: GalaxiesDiff`), each with its own private
   `diffToLevel`. That is why `tierOf`/`withTier` are accessors rather than a
   documented field name: a cross-game guard cannot write `{ ...p, diff: cap }`
   on a third of this population, because `cap` is a number and the field is not.

That is three counts in this change's lineage that were wrong about their unit,
which is the standing reason to check an instrument before acting on it.

**The live reason is that cap-monotonicity is asserted for four games out of 28.**
The property — *a board solvable with the ladder capped at `d` is solvable at
every cap above `d`* — is what Boats violated, silently breaking Check & Save on
Easy boards, because "solvable at Easy" and "solvable at Tricky" were both true
statements about different code paths and nothing compared them. Magnets, Rome
and Salad have since each hand-written their own version of the test, and Boats
has its workaround; the other 24 games have nothing. The archived audit recorded
the reason as *"there is no uniform way to call their solvers — a cross-game
version needs a per-game `(generate, solveAtCap)` registry that does not
exist."* **This change is that registry**, and the four hand-written tests are
its worked examples: three phrasings of one property, already drifting (Magnets
sweeps every cap, Rome checks only the top, Salad folds it into a generation
test), which is what a shared guard exists to stop.

**A note on this change's age.** It was scaffolded on 2026-08-01 with a second
justification — *"`grade-difficulty-tiers-honestly` has to write the same fix 26
times"* — describing that change as scaffolded and next in the owner's order.
**That reason has expired**: `grade-difficulty-tiers-honestly` landed and was
archived on 2026-08-04, and it needed **four** games, not 26. It is not a
pending consumer of this contract and is not why this change is worth doing. The
downstream consumers that remain are `add-subsets-difficulty-tiers` and
`add-sticks-difficulty-tiers`, which have tiers still to build, plus the four
tiers that change *did* fix, which now have no cross-game guard keeping them
honest.

**Generation is already uniform; only the solving half is missing.**
`Game.newDesc(params, rng)` is on the production interface and every game
implements it. So the contract this change adds is small: what the tiers are, how
to read and set one on a params object, and how to run the solver capped at one.

## What Changes

- **Add an optional `Game.difficulty` contract** — the tier names, `tierOf(params)`,
  `withTier(params, tier)`, and `solveAtCap(params, desc, cap)` returning a
  discriminated verdict. Optional, like `hint`, `findMistakes` and
  `supersededDesc` before it, so the 31 untiered games are untouched.
- **Implement it for all 28 tiered games.** Each game's solver already takes a cap
  (Magnets' `solve(diff)`, and so on), so the adapter is a small closure, not new
  logic — but the solvers take **seven different input shapes** (a `State`, a
  game-specific board struct, a reusable `SolverScratch`, a solver class), so the
  adapter is where "build this game's solver input from a desc" gets written down
  once per game instead of once per test.
- **Do not make `solvableAtExactlyTier` mandate two solver runs.** Clusters is the
  worked counter-example: its tiers are *nested rungs of one fixpoint* rather than
  two solvers, so it answers "solvable at `d`?" and "solvable at `d-1`?" from a
  single pass — run the cheap rung first, and the deeper solve resumes from that
  same fixpoint for free (`add-clusters-difficulty-tiers` D3). That ordering is
  not a micro-optimisation there: it made the *whole generator* faster than it was
  before it had tiers. A helper whose contract is "call the solver twice" would
  forbid it, so the helper should take the game's verdict and let the game decide
  how many passes produce it.
- **Ship the guards the contract makes possible**, as one cross-game test file:
  - **cap-monotonicity** for every tiered game — the Boats defect class, hunted
    across the collection instead of one game at a time;
  - **a tier is reachable** — each declared tier actually generates;
  - **the declared tiers match the game's own difficulty `paramConfig`**, so a
    game that gains a tier cannot forget to declare it — **not** against its
    `DIFF_*` constants, which the survey found cannot carry that weight: Solo has
    eight `DIFF_*` constants and six tiers, Galaxies five names and two tiers,
    Singles a `DIFF_MAX` *and* a `DIFF_ANY`, because a `DIFF_*` constant is
    sometimes a deduction rung and sometimes a solver verdict. The custom-params
    `choices` list is the tiers a player can actually pick, and it cannot go
    stale without the dialog going wrong;
  - **the enrolled set is derived, not transcribed** — every registered game with
    a difficulty `paramConfig` item must declare the contract, so a newly tiered
    game is conscripted rather than invited.
- **Ship a shared generator-acceptance helper** (`solvableAtExactlyTier`) that
  `add-subsets-difficulty-tiers` and `add-sticks-difficulty-tiers` can apply
  uniformly rather than re-deriving per game — and that expresses, in one place,
  the rule `grade-difficulty-tiers-honestly` had to spell out four times.
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
- Affected code: `engine/game.ts`, a new `engine/difficulty.ts`, 28 game
  `index.ts` files, and one new cross-game test file.
- **No behaviour change.** The contract is additive and describes what each game
  already does; no differential may move. A moving fixture means an adapter
  misreports its game's solver, which is a defect in this change.
- **Expect the guards to find something.** The cap-monotonicity property has never
  been checked on 24 of these games, and it was false on Boats. Any failure is a
  shipped bug, and gets fixed and reported under its own change
  rather than absorbed here.
