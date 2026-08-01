# subsets Specification Delta — add-subsets-difficulty-tiers

## ADDED Requirements

### Requirement: Subsets repairs the disabled arrow deduction and grades on it

The solver SHALL implement both halves of the arrow deduction: eliminating a
superset candidate with no smaller subset candidate available across the arrow,
**and** its mirror — eliminating a subset candidate that fits inside no remaining
superset candidate. Upstream wrote the second half, disabled it (`TODO repair
this`) and shipped without it.

The repaired rule SHALL be proven sound before the generator depends on it: it
SHALL never eliminate a candidate that the board's solution uses. An unsound
elimination produces a puzzle with no solution, which is worse than a weak solver.

Subsets SHALL then offer a difficulty parameter of at least two tiers, the harder
requiring the repaired rule and not being soluble without it. Because the board is
fixed at 4×4 over four letters — the only size where the sixteen possible sets
fill the sixteen cells — difficulty SHALL come from deductive depth rather than
from size.

The difficulty SHALL be encoded in the game ID, and an ID carrying none SHALL
decode to a playable board.

Because solver strength decides which cells the generator leaves blank, the
description no longer matches the C reference byte for byte; assurance SHALL rest
on every generated board being uniquely solvable at exactly its stated tier.

#### Scenario: The repaired rule never removes a true candidate

- **WHEN** the repaired deduction runs on a board whose solution is known
- **THEN** no candidate belonging to that solution is eliminated

#### Scenario: The harder tier needs the repaired rule

- **WHEN** a board generated at the harder tier is solved with the repaired rule
  disabled
- **THEN** the solver does not reach a solution
