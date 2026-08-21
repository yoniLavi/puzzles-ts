# abcd Specification Delta — bound-abcd-generable-sizes

## ADDED Requirements

### Requirement: ABCD refuses board sizes it cannot generate

Parameter validation SHALL reject, when validating for generation, any
combination of grid size and letter count whose measured generation-success rate
is too low to produce a board in an acceptable time, giving a reason — rather
than retrying until an attempt budget is exhausted. Generation accepts a random
fill only when the deductive solver finds its clue counts uniquely solvable, and
that acceptance rate falls towards zero as the board grows, so a large board can
consume a multi-million-attempt budget and still fail.

The bound SHALL be derived from measurement across grid size, grid *shape* and
letter count, since none of them alone determines the rate: two boards of equal
area, or of equal clue-to-cell ratio, can differ by orders of magnitude in
acceptance rate. Diagonal mode SHALL be bounded separately, being markedly more
generable rather than less. Validation SHALL NOT apply the bound when a
description is already in hand, so that a previously shared game ID remains
loadable. Every shipped preset SHALL pass validation, and the bound SHALL be
asserted in both directions — that it admits configurations measured generable
as well as refusing those measured un-generable.

The generator's retry cap SHALL be sized to what the bound admits, so that
exhausting it continues to signal a defect rather than an ordinary player
request.

#### Scenario: A board of the same area as a refused one is still offered

- **WHEN** a long thin board is entered whose area equals that of a refused
  squarer board
- **THEN** it is accepted, because its generation rate is measured to be high

#### Scenario: Diagonal mode is bounded on its own measurements

- **WHEN** a board is entered that is un-generable with diagonal touching
  allowed but generable without it
- **THEN** it is refused in the first mode and accepted in the second

#### Scenario: An un-generable configuration is refused immediately

- **WHEN** a configuration below the measured rate is entered in the Custom
  dialog
- **THEN** it is refused with a reason, without the generator being run

#### Scenario: An existing game ID outside the bound still loads

- **WHEN** a game ID whose parameters fall outside the bound is opened, with its
  description present
- **THEN** the board loads and is playable
