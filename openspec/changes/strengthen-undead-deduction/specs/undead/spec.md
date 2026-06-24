## MODIFIED Requirements

### Requirement: Undead solves and generates uniquely-solvable graded boards

The solver SHALL provide a **deductive ladder** — a per-sightline
candidate-intersection pass (arc-consistency, iterated to a fixpoint), a global
**exact-count** rung (the monster totals as equality constraints, with Hall-type
deductions: a fully-placed type struck everywhere, a type whose remaining count
equals its candidate cells forcing them all, too few candidate cells a
contradiction), and a depth-1 **forcing** rung (hypothesise one cell's candidate, run
the arc-consistency + counting fixpoint, eliminate the candidate on contradiction) —
run to a combined fixpoint **without recursion**, plus a separate whole-grid
brute-force search used only as the uniqueness **oracle**. Forcing SHALL NOT nest (the
inner fixpoint never forces); a board solvable only by nested hypothesising is
"requires recursion".

`newDesc` SHALL generate a grid of random mirrors and monster cells (rejecting grids
that are too sparse, too dense, or have an over-long sightline), seed unique-solution
sightlines until a difficulty-dependent fraction of the grid is determined, fill the
remainder with random monsters, and grade the board by **which rung of the deductive
ladder is required** (arc-consistency / counting / forcing). Every generated board
SHALL be uniquely solvable (verified against the brute-force oracle).

A board accepted for any difficulty tier **other than** an explicitly-named
`Unreasonable` tier SHALL be solvable by the deductive ladder alone — **zero guessing
or recursion** — per the fork's guess-free generation policy. A board that requires
recursion SHALL only be accepted under an `Unreasonable` tier, the sole sanctioned
guess-allowed exception; whether Undead ships such a tier (versus rejecting
recursion-only boards entirely) is determined by measuring the recursion-only residual
after the deductive ladder is in place.

#### Scenario: Generated board is unique and on-difficulty

- **WHEN** `newDesc` returns a board for a given size and a non-`Unreasonable`
  difficulty
- **THEN** the deductive ladder solves it uniquely with no recursion
- **AND** the board's grade matches the highest rung the ladder needed
- **AND** the brute-force oracle confirms exactly one solution

#### Scenario: Non-Unreasonable tiers never require guessing

- **WHEN** any board is accepted for an Easy, Normal, or Tricky tier
- **THEN** the deductive ladder (arc-consistency + counting + depth-1 forcing) solves
  it to completion without invoking the brute-force/recursive search

#### Scenario: Recursion-only boards are confined to the Unreasonable exception

- **WHEN** a candidate board is solvable only by recursion (nested hypothesising)
- **THEN** it is rejected at generation unless an `Unreasonable` tier is being
  generated, in which case it MAY be accepted there

#### Scenario: Solve fills the unique solution

- **WHEN** `solve` is invoked on a freshly generated game
- **THEN** it returns a move that places every monster at its unique-solution type
