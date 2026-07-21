# subsets Specification Delta — add-subsets-ts-port

## ADDED Requirements

### Requirement: Subsets game implements the Game interface

The engine SHALL provide `src/native/games/subsets/` implementing the `Game`
interface for Subsets, registered so the puzzle is served by the TypeScript
engine.

Parameters SHALL be a width, a height and a universe size `n`. Validation SHALL
accept only `4×4` with `n = 4`, matching upstream, and there SHALL be a single
preset for those parameters. A game ID SHALL encode the width, height and universe
size and round-trip through decode. No Custom-parameters dialog SHALL be offered,
because only one configuration is legal.

Subsets is a deductive puzzle with a unique solution, so it SHALL declare a
`findMistakes` hook.

#### Scenario: The preset produces a soluble board

- **WHEN** a new game is generated for the preset
- **THEN** a board is produced whose given clues are internally consistent and
  whose full solution the solver reaches

#### Scenario: A game ID round-trips through the parameters

- **WHEN** a parameter set is encoded to a game ID and decoded
- **THEN** the same width, height and universe size are recovered

#### Scenario: Unsupported parameters are rejected

- **WHEN** parameters other than `4×4` with `n = 4` are validated
- **THEN** they are rejected with the upstream "only 4x4 supported" message

### Requirement: Subsets descriptions use the per-cell arrow encoding

A Subsets description SHALL encode the grid in row-major order as one
comma-separated token per cell: a decimal set number for a given cell or an
underscore for a blank cell, immediately followed by any of the arrow markers `U`,
`R`, `D`, `L` for the horseshoe clues leaving that cell.

Validation SHALL reject a description that carries more or fewer cells than the
grid holds (distinguishing which), that contains a set number out of range for the
universe, that omits a required separator, that uses an unexpected character, that
places an arrow pointing off the grid, or that places two arrows on one edge which
contradict each other.

#### Scenario: A generated description round-trips

- **WHEN** a description is generated and then decoded into a board
- **THEN** re-encoding that board yields the identical description

#### Scenario: A description with the wrong number of cells is rejected

- **WHEN** a description carrying more or fewer cells than the grid has is
  validated
- **THEN** it is rejected with a message distinguishing too much data from too
  little

#### Scenario: Contradicting arrows on one edge are rejected

- **WHEN** a description places an arrow from a cell to its neighbour and the
  opposite arrow from that neighbour back
- **THEN** the description is rejected as contradictory

### Requirement: Subsets ports the deductive solver and uniqueness-gated generator

Subsets SHALL provide a solver that reports whether a board is complete,
unfinished or invalid, driven by a candidate-elimination fixpoint over the set of
possible set-values per cell. The solver SHALL apply arrow propagation (a superset
cell contains its subset neighbour's confirmed letters, and a subset cell cannot
hold letters its superset lacks), missing-arrow disjointness, single-count and
single-position placement, and the advanced arrow-subset elimination, in the
upstream order. The solver SHALL NOT include upstream's disabled advanced-rule
branch, so that its strength matches the compiled C exactly.

The generator SHALL assign every set-value to the grid by a single shuffle, derive
all arrow clues from the subset relation, then blank cells in a shuffled order,
keeping a cell blank only while the solver still reaches a complete solution.
Generation from a given seed SHALL be reproducible, and the TypeScript generator
SHALL reproduce the C description byte-for-byte for the same seed.

#### Scenario: The solver classifies a board

- **WHEN** a solvable board, an ambiguous board and a rule-violating board are each
  solved
- **THEN** the solver reports complete, unfinished and invalid respectively

#### Scenario: Generation is reproducible from a seed

- **WHEN** the same seed is used twice for the preset parameters
- **THEN** both runs produce the identical board description

#### Scenario: The TypeScript generator matches the C description

- **WHEN** a board is generated from a seed by both the C reference and the
  TypeScript port
- **THEN** the two descriptions are byte-for-byte identical

### Requirement: Subsets input, marking, mistakes and completion

Subsets SHALL be played by toggling individual letter slots within each cell. A
left-click or select SHALL cycle a slot unknown → known → cleared → unknown, a
right-click or secondary select SHALL cycle unknown → cleared → known → unknown,
and a middle-click or backspace SHALL reset a slot to unknown; a given (immutable)
slot SHALL NOT change. A keyboard cursor SHALL navigate slots, skipping the gaps
between cell blocks. A move SHALL be modelled as a discriminated union, not a move
string.

The game SHALL flag mistakes for Check & Save: a set-value placed in more than one
cell, and any edge whose horseshoe (or missing-horseshoe disjointness) relation is
violated by two decided cells. A Solve action SHALL fill the board from the solver
unless the board is invalid, and SHALL complete the game as solved-with-help
without firing the win flash — a deliberate divergence from upstream, whose solve
move omits the completion bookkeeping (the collection convention wins). The board
SHALL be formattable as text. Rendering
SHALL show each cell's letter slots, the horseshoe arrows, a tally of every
set-value with its placement count, and a completion flash; there SHALL be no move
animation.

#### Scenario: Toggling a letter slot cycles its state

- **WHEN** a mutable letter slot is left-clicked repeatedly
- **THEN** it advances unknown → known → cleared and back to unknown, and a given
  slot does not change

#### Scenario: Completing the grid wins and flashes

- **WHEN** every set is placed exactly once so that all clues hold
- **THEN** the game is reported solved and flashes

#### Scenario: A duplicated placement is flagged as a mistake

- **WHEN** the same set-value is fully placed in two cells and mistakes are checked
- **THEN** both offending cells are reported as mistakes
