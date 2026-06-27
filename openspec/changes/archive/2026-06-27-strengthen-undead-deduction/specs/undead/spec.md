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

Every board Undead accepts SHALL be solvable by the deductive ladder alone — **zero
guessing or recursion** — per the fork's guess-free generation policy. A board that
requires recursion (nested hypothesising) SHALL be rejected at generation.

Undead ships **no `Unreasonable` tier**: the re-grade measurement (≈6,800 candidate
boards across all tiers) found a **zero** uniquely-solvable recursion residual — every
uniquely-solvable Undead board is cracked by the deductive ladder, and the boards the
ladder cannot solve are exactly the non-unique ones the brute-force oracle already
rejects. The `Unreasonable` tier remains the policy's sole sanctioned guess-allowed
exception for *other* games; Undead does not need it.

#### Scenario: Generated board is unique and on-difficulty

- **WHEN** `newDesc` returns a board for a given size and difficulty
- **THEN** the deductive ladder solves it uniquely with no recursion
- **AND** the board's grade matches the highest rung the ladder needed (Easy =
  arc-consistency within the pass cap, Normal = arc beyond the cap or counting,
  Tricky = forcing)
- **AND** the brute-force oracle confirms exactly one solution

#### Scenario: Every tier is guess-free

- **WHEN** any board is accepted for any tier (Easy, Normal, Tricky)
- **THEN** the deductive ladder (arc-consistency + counting + depth-1 forcing) solves
  it to completion without invoking the brute-force/recursive search

#### Scenario: Recursion-only boards are rejected

- **WHEN** a candidate board is solvable only by recursion (nested hypothesising)
- **THEN** it is rejected at generation (such boards are non-unique; Undead ships no
  `Unreasonable` tier)

#### Scenario: Solve fills the unique solution

- **WHEN** `solve` is invoked on a freshly generated game
- **THEN** it returns a move that places every monster at its unique-solution type
