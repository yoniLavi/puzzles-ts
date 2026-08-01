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

Because generation is already uniform through `Game.newDesc(params, rng)`, the
contract SHALL NOT add a separate "generate at tier" entry point —
`newDesc(withTier(p, t), rng)` is that, and a second spelling of an existing
capability is how a contract sprawls.

#### Scenario: A newly tiered game is enrolled by declaring the contract

- **WHEN** a game with difficulty tiers declares `difficulty`
- **THEN** every cross-game difficulty guard covers it without further enrollment
- **AND** its declared tier list is checked against the game's own difficulty
  constants, so a game that gains a tier cannot ship a stale list

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
