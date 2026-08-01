# palisade — delta

## ADDED Requirements

### Requirement: Palisade shares its border-marking mechanic rather than owning a copy

Palisade SHALL obtain the grid-edge marking mechanic it shares with Separate from
a shared engine module rather than from its own copy: the border/disabled bit
vocabulary and direction tables, the closest-edge hit test from a pointer
coordinate, the undecided→wall→no-wall tri-state cycle under left and right
button, the paired edit of the two cells adjacent to a marked edge, and the
half-cell keyboard cursor coordinate scheme.

Palisade's clue semantics (each cell's count of adjacent walls), its solver, its
generator, its difficulty grading and its clue rendering SHALL remain entirely
its own. Only the substrate is shared.

Adopting the shared module SHALL NOT change any board Palisade generates or any
frame it draws: its differential fixtures and render snapshots SHALL pass
unmodified. Input handling is downstream of generation and touches none of it, so
a correct extraction is a provable no-op — a snapshot that requires
re-baselining is evidence the extraction is wrong, not a new baseline.

#### Scenario: The shared mechanic is adopted without moving a board

- **WHEN** Palisade is changed to consume the shared border-grid module
- **THEN** every Palisade differential fixture passes without modification
- **AND** every Palisade render snapshot passes without `vitest -u`

#### Scenario: A fix to the shared mechanic reaches both games

- **WHEN** a defect is found in the edge hit test or the tri-state cycle
- **THEN** it is fixed once in the shared module
- **AND** both Palisade and Separate receive the fix, rather than one game
  silently retaining the defect
