# ts-engine Specification (delta)

## ADDED Requirements

### Requirement: A shared cell-region helper for candidate-elimination games

The shared candidate-elimination module (`src/native/engine/candidate-hint.ts`) SHALL
provide a single representation of "the uniqueness regions a cell belongs to" that all
three consumers — the placement classifier, the basic-strike opening, and a placement's
duplicate cull — share, so they cannot disagree about a cell's regions.

A candidate-elimination game SHALL supply a per-game region provider (`regionsOf(state,
x, y)`) returning the regions in which the value at `(x, y)` must be unique (each a cell
list plus a game tag for naming). The module SHALL provide a `findRegionDuplicate` that,
given the board and the provider, returns one firing of a placed value still present as a
pencil note in one of its regions (subsuming the per-game `basicLatinStrike` /
`basicRegionStrike`), and a placement duplicate-cull that returns the marks a placement
strikes from its regions. The placement classifier (`classifyPlacementInRegions`) SHALL
consume the same provider.

Routing a game's hint through the shared region helper SHALL be behaviour-preserving: the
game's observable narration, journeys, keep-track verdicts, resume guarantee and rendered
frames are unchanged.

#### Scenario: The three consumers agree on a cell's regions

- **WHEN** a candidate-elimination game's hint classifies a placement, finds a basic-strike
  duplicate, and culls a placement's region duplicates
- **THEN** all three derive the cell's regions from the one per-game `regionsOf` provider,
  and the game's hint suite + `hint-resume.test.ts` pass with no snapshot change

#### Scenario: A cage is not a uniqueness region

- **WHEN** the game is Keen (digits may repeat within an arithmetic cage)
- **THEN** `regionsOf` returns only the row and column, so neither the cleanup nor the
  basic-strike removes a candidate that is legal under the cage constraint
