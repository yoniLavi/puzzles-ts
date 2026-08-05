# sticks Specification Delta — add-sticks-difficulty-tiers

> The change's own gating clause — *"if no second technique is found that both
> decides boards the first cannot and can be stated to a player, the parameter
> SHALL NOT be offered, and the finding SHALL be recorded"* — is what fired. So
> no difficulty requirement is added. What is added is the assurance the spike
> showed to be missing, and the measured reason for keeping two known bugs.

## MODIFIED Requirements

### Requirement: Sticks ports the deductive solver and solver-gated generator

Sticks SHALL provide a deductive solver that fills the blank cells with horizontal
or vertical lines consistent with every clue, or reports that the board is
invalid. The solver SHALL work by contradiction on single cells: it SHALL try each
blank cell as one orientation and, when that makes the board provably invalid,
commit the opposite orientation, iterating until no further cell is forced. The
solver SHALL NOT use backtracking, and SHALL classify a board as complete,
unfinished, or invalid.

Validity SHALL be checked against the puzzle rules: a numbered line SHALL have the
stated length, a line SHALL overlap at most one number, and a numbered black cell
SHALL connect to the stated number of lines.

The generator SHALL place black squares under the chosen symmetry, fill and clue
the board, and retain a candidate only while the deductive solver deduces it to a
unique completion; it SHALL then remove clues in a randomised order, keeping each
removal only while the board stays uniquely solvable. Generation from a given seed
SHALL be reproducible.

Sticks offers **one** difficulty tier, so grading it honestly means that tier is
what it claims to be. Every generated board SHALL therefore have **exactly one**
solution, and the shipped deduction SHALL reach it with no guessing anywhere.
Uniqueness SHALL be established by a witness independent of that solver: the
solver returning "complete" reports only on the line of play it followed, and is
not evidence about how many solutions exist. That witness SHALL itself be shown
capable of reporting more than one solution, or the assertion is vacuous.

The two ported look-behind bounds in the segment-reachability computation
(`x > 1` / `y > 1`, where the geometry admits `x > 0` / `y > 0`) SHALL be kept.
They are genuine bugs that make the checker weaker than intended, and they are
retained because correcting them was **measured** to change no verdict on any
board at any offered preset — not merely because upstream wrote them that way.

#### Scenario: The solver completes a soluble board

- **WHEN** a generated board is solved from its clues alone
- **THEN** the solver returns the unique completion, with every numbered line at
  its stated length and every numbered black cell at its stated connection count

#### Scenario: Generation is reproducible from a seed

- **WHEN** the same seed is used twice for the same parameters
- **THEN** both runs produce the identical board description

#### Scenario: A generated board has exactly one solution

- **WHEN** a generated board is enumerated by a search that propagates the shipped
  deduction and branches on the cells it leaves undecided
- **THEN** exactly one solution is found

#### Scenario: The uniqueness witness can report more than one

- **WHEN** that same search is run on a board carrying no clues at all
- **THEN** it reports more than one solution
