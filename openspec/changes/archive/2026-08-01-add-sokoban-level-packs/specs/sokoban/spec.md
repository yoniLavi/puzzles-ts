# sokoban Specification Delta — add-sokoban-level-packs

## ADDED Requirements

### Requirement: Sokoban serves authored levels alongside generated ones

Sokoban SHALL offer a curated set of authored levels, because its own author
records that its random generation is "too simplistic to be credible" and that
the game is meant to be played "with hand-written level descriptions". Randomly
generated boards SHALL remain available.

Because a curated pack is a fixed enumerated list rather than a size-and-seed
space, selecting a level SHALL have an addressing scheme that deep links and
saved games survive.

Every shipped level SHALL be verified solvable by the ported solver before it is
committed, and any level not authored by this project SHALL carry an attribution
and a licence compatible with this project's licensing.

#### Scenario: A player picks an authored level

- **WHEN** the player selects a level from the curated set
- **THEN** that level loads, and its link and saved game resolve back to the same
  level later

#### Scenario: Random generation is still available

- **WHEN** the player asks for a randomly generated board
- **THEN** one is generated as before
