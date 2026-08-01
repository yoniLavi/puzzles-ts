# separate — delta

## ADDED Requirements

### Requirement: Separate shares its border-marking mechanic rather than owning a copy

Separate SHALL obtain the grid-edge marking mechanic it shares with Palisade from
a shared engine module rather than from its own copy: the border/disabled bit
vocabulary and direction tables, the closest-edge hit test from a pointer
coordinate, the undecided→wall→no-wall tri-state cycle under left and right
button, the paired edit of the two cells adjacent to a marked edge, and the
half-cell keyboard cursor coordinate scheme.

Separate's region constraints (required region sizes and the cells that must be
kept apart), its solver, its generator and its clue rendering SHALL remain
entirely its own. Only the substrate is shared.

Adopting the shared module SHALL NOT change any board Separate generates or any
frame it draws: its differential fixtures and render snapshots SHALL pass
unmodified.

#### Scenario: The shared mechanic is adopted without moving a board

- **WHEN** Separate is changed to consume the shared border-grid module
- **THEN** every Separate differential fixture passes without modification
- **AND** every Separate render snapshot passes without `vitest -u`

#### Scenario: The games' move formats stay independent

- **WHEN** the shared module reports which edge a pointer or cursor action
  targets and how its state should cycle
- **THEN** each game constructs its own `Move` from that description
- **BECAUSE** a shared move type would couple two save formats that have no
  reason to be identical
