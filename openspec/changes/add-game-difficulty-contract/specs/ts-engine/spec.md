# ts-engine — delta

## ADDED Requirements

### Requirement: A tiered game declares its difficulty contract

A game with difficulty tiers SHALL declare an optional `difficulty` contract on
its `Game`: the tier names easiest-first, `tierOf(params)`, a pure
`withTier(params, tier)`, and `solveAtCap(params, desc, cap)` running the game's
solver with its deduction ladder capped at `cap`. A game without tiers omits it,
exactly as a game without a solver omits `solve`.

`solveAtCap` SHALL return a **discriminated verdict** (`"solved"` /
`"unsolved"` / `"impossible"`), not the raw integer its solver uses. The
collection's solvers report `-1 / 0 / 1` with meanings that are **not uniform** —
one game's `0` is "ambiguous", another's is "stuck", another returns a status
enum — so the per-game translation belongs in the adapter. Propagating the raw
integers would import 26 conventions into every cross-game consumer.

The contract SHALL describe what the game already does and SHALL NOT change any
board it generates: adopting it is a no-op, and a differential fixture that moves
means an adapter misreports its game's solver.

The tier list SHALL be **declared**, not derived from the game's `DIFF_*`
constants, and SHALL match the difficulty choices the game's custom-params form
offers. A `DIFF_*` constant is not reliably a tier: Solo declares eight and
offers six (two are solver verdicts), Galaxies' names list has five entries and
two tiers, Singles has a `DIFF_MAX` *and* a `DIFF_ANY`, and Salad has a
`DIFF_HOLESONLY` at −1.

A tier that the game's solver understands but that the generator refuses at every
size SHALL still be declared, because a saved game or a description-carrying game
ID may request it and `solveAtCap` must be able to answer. Its refusal SHALL come
from `validateParams` with a human-readable reason, never from silent failure.

A tier that deliberately does **not** promise a uniquely-solvable board SHALL
declare itself, so that the cross-game guard asserts what that tier actually
promises rather than the opposite. Dominosa is the case, and it was found by the
guards rather than anticipated: the last entry in its difficulty menu is
"Ambiguous", and its generator branches on it to skip the uniqueness search
entirely — so a tier is not always a rung of the deduction ladder, it can instead
be a relaxation of what the puzzle promises.

Because generation is already uniform through `Game.newDesc(params, rng)`, the
contract SHALL NOT add a separate "generate at tier" entry point —
`newDesc(withTier(p, t), rng)` is that, and a second spelling of an existing
capability is how a contract sprawls.

#### Scenario: A newly tiered game is enrolled by declaring the contract

- **WHEN** a game with difficulty tiers declares `difficulty`
- **THEN** every cross-game difficulty guard covers it without further enrollment
- **AND** its declared tier list is checked against the difficulty choices its
  custom-params form offers, so a game that gains a tier cannot ship a stale list
- **AND** a game that offers such a choice without declaring the contract fails
  the guard, so enrollment is conscription rather than invitation

#### Scenario: A tier is declared but generates at no size

- **WHEN** a tier exists in the solver's ladder but the generator refuses it
  everywhere
- **THEN** the tier stays declared, so a saved game or game ID can still name it
- **AND** `validateParams` refuses it with a human-readable reason, which the
  guard requires — a tier that fails to generate and says nothing about why is a
  silent downgrade wearing a menu entry

#### Scenario: An adapter misreports its solver

- **WHEN** an adapter maps a solver's return value to the wrong verdict
- **THEN** the "every declared tier is reachable" guard fails, because a board
  the game's own generator just produced at that tier is reported unsolved
- **AND** the adapter is corrected rather than the guard relaxed

### Requirement: The difficulty contract lives on the Game interface

The difficulty contract SHALL be declared on `Game`, not added to the
`puzzleId → Game` registry and not held in a test-only enrollment module.

The registry's single responsibility is identity lookup, and
`catalog-registry.test.ts` asserts it equals the catalog in both directions;
attaching metadata for 26 of 57 entries makes that statement no longer the whole
truth about it. A test-only enrollment module is excluded for two independent
reasons: the generator-acceptance helper built on this contract is **production**
code and would have to be duplicated, and the module-layering rule exempts
exactly one engine→games importer *by name* — deliberately refusing a wildcard —
so a second enrollment file would widen an exemption that was made narrow on
purpose.

#### Scenario: A capability is proposed for the registry

- **WHEN** a change proposes attaching per-game capability metadata
- **THEN** it goes on the `Game` interface as an optional hook, alongside `hint`,
  `findMistakes` and `supersededDesc`
- **AND** the registry keeps its single responsibility
