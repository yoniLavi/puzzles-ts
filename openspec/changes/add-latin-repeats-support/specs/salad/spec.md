# salad Specification Delta — add-latin-repeats-support

## MODIFIED Requirements

### Requirement: Salad ports the solver as a shared Latin-square consumer

Salad's solver SHALL be built on the shared Latin-square solver, expressing the
empty square as a symbol with a per-line multiplicity rather than translating
between holes and candidates in the game. The translation layer that stood in for
that support SHALL be removed.

The solver SHALL implement the techniques the direct representation makes
expressible, so that the difficulty tiers reflect real deductive depth, and the
Number Ball generator SHALL gate on that solver — its boards are only as
interesting as the reasoning available to reject a dull one.

Because the solver's strength decides which boards the generator produces, its
description no longer matches the C reference byte for byte. Assurance SHALL rest
instead on every generated board being uniquely solvable at exactly its stated
difficulty, with the frozen C fixtures retained as solver-verdict checks where
they remain meaningful.

#### Scenario: A generated board is uniquely solvable at its stated tier

- **WHEN** a board is generated at any tier
- **THEN** the solver finds exactly one solution at that tier

#### Scenario: The empty square is reasoned about directly

- **WHEN** the solver deduces a placement that turns on where empty squares can
  and cannot go
- **THEN** that deduction is expressed over the shared cube's repeatable symbol

#### Scenario: The solver deduces the unique solution without guessing

- **WHEN** a generated board is solved at its difficulty
- **THEN** the solver reaches the unique completion using only its deductive
  techniques, never backtracking search

#### Scenario: Generation is reproducible from a seed

- **WHEN** the same seed is used twice for the same parameters
- **THEN** both runs produce the identical board description
