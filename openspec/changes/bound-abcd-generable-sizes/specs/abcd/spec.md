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

The bound SHALL be derived from measurement across both grid size and letter
count, since neither alone determines the rate. Validation SHALL NOT apply the
bound when a description is already in hand, so that a previously shared game ID
remains loadable. Every shipped preset SHALL pass validation.

#### Scenario: An un-generable configuration is refused immediately

- **WHEN** a configuration below the measured rate is entered in the Custom
  dialog
- **THEN** it is refused with a reason, without the generator being run

#### Scenario: An existing game ID outside the bound still loads

- **WHEN** a game ID whose parameters fall outside the bound is opened, with its
  description present
- **THEN** the board loads and is playable
