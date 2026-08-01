# latin-solver Specification Delta — add-latin-repeats-support

## ADDED Requirements

### Requirement: The Latin cube supports a symbol that may repeat in a line

The shared Latin-square solver SHALL support puzzles in which one declared symbol
may appear a stated number of times in each row and column, rather than exactly
once. This is what a *pseudo*-Latin puzzle needs — Salad's empty square is such a
symbol — and expressing it in the cube is what allows deduction techniques to be
written about it.

The support SHALL be opt-in, and SHALL be inert when not requested: a puzzle that
declares no repeatable symbol SHALL produce exactly the deductions, in exactly the
order, that it produces today. Because every Latin-family game's generator is
solver-gated, this is verified by those games' existing byte-match differentials
remaining green.

#### Scenario: A pseudo-Latin puzzle is expressed directly

- **WHEN** a puzzle declares a symbol with a per-line multiplicity greater than
  one
- **THEN** the solver reasons about that symbol's placements in the cube, without
  the caller translating it into and out of a single-occurrence encoding

#### Scenario: Existing consumers are unaffected

- **WHEN** a puzzle declaring no repeatable symbol is solved
- **THEN** the solver's deductions and their order are unchanged, and every
  Latin-family byte-match differential still passes
