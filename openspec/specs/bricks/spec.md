# bricks Specification

## Purpose
TBD - created by archiving change add-bricks-ts-port. Update Purpose after archive.
## Requirements
### Requirement: Bricks game implements the Game interface

The engine SHALL provide `src/native/games/bricks/` implementing the `Game`
interface for Bricks (Tawamurenga), registered so the puzzle is served by the
TypeScript engine.

Parameters SHALL be a width, a height and a difficulty (Easy, Normal or Tricky).
Validation SHALL require width at least 2, height at least 2, and a known
difficulty. A game ID SHALL encode the width, height and difficulty and round-trip
through decode.

The board SHALL be a hexagon stored as a padded parallelogram: the actual grid
width SHALL be the parameter width plus the ceiling of half the height minus one,
with the two triangular corners masked as boundary cells, leaving exactly
width-by-height playable cells. Neighbours SHALL be the fixed six-direction hex
step set. This geometry SHALL be bespoke and SHALL NOT depend on the shared grid
tiling engine.

#### Scenario: Every preset produces a soluble board

- **WHEN** a new game is generated for any preset or legal size
- **THEN** a board is produced whose unique solution the solver reaches, marking it
  complete

#### Scenario: A game ID round-trips through the parameters

- **WHEN** a parameter set is encoded to a game ID and decoded
- **THEN** the same width, height and difficulty are recovered

### Requirement: Bricks descriptions use the run-length cell encoding

A Bricks description SHALL encode only the playable cells in canonical
left-to-right, top-to-bottom order: each numbered cell as its decimal value with a
separator inserted between two adjacent numbers, and each run of playable
(non-numbered) cells as a run-length lowercase count. Boundary cells SHALL be
re-derived from the geometry and SHALL NOT appear in the description.

Validation SHALL reject a description that decodes to more or fewer playable cells
than the board holds, distinguishing too many from too few, and SHALL reject a clue
value out of range.

#### Scenario: A generated description round-trips

- **WHEN** a description is generated and then decoded into a board
- **THEN** re-encoding that board yields the identical description

#### Scenario: A description with the wrong number of cells is rejected

- **WHEN** a description that decodes to more or fewer playable cells than the board
  has is validated
- **THEN** it is rejected with a message distinguishing too many from too few

### Requirement: Bricks ports the deductive solver and generator faithfully

Bricks SHALL provide a solver that decides whether a grid is complete, still
unfinished, or invalid, from three rules: no three consecutive shaded cells in a
horizontal line, every shaded cell supported by a shaded cell below it, and every
numbered cell's shaded-neighbour count consistent with its clue. The solver SHALL
place cells by contradiction — tentatively shading or unshading a cell and forcing
the opposite when that leads to an invalid grid — with bounded lookahead for the
harder difficulties. Every difficulty tier SHALL be solvable by pure deduction; the
solver SHALL NOT rely on guessing.

The generator SHALL use the solver to keep every puzzle uniquely solvable at its
target difficulty: it SHALL fill the grid under the support and run-length
constraints, number it, then remove numbers in a randomised order, keeping a
removal only while the puzzle stays uniquely solvable. Generation from a given seed
SHALL be reproducible.

#### Scenario: The solver reaches the unique solution

- **WHEN** a generated board is solved
- **THEN** the solver marks it complete and its cells match the intended solution

#### Scenario: Generation is reproducible from a seed

- **WHEN** the same seed is used twice for the same parameters
- **THEN** both runs produce the identical board description

### Requirement: Bricks input, mistake-checking and completion

Bricks SHALL be played by clicking or dragging to cycle a cell between shaded,
unshaded and empty, with the right button cycling in the reverse direction, and by a
hexagon-aware keyboard cursor. A numbered cell SHALL never be shadeable. Moving the
cursor up or down SHALL alternate between an orthogonal and a diagonal step to
follow the hexagonal grid.

Because Bricks is uniquely solvable and every rule violation is localised, it SHALL
provide a `findMistakes` hook that reports the offending cells, so that Check & Save
hard-blocks while a mistake is present. Rule violations SHALL additionally be shown
live during play — three-in-a-row bars, gravity error diamonds, and over-count
numbers.

The game SHALL be reported complete when the grid satisfies all three rules with no
cell left empty, and SHALL flash on completion. There SHALL be no interpolated
animation.

#### Scenario: Dragging paints a run of cells

- **WHEN** the player presses on a cell and drags across further playable cells
- **THEN** on release every dragged playable cell is set to the drag's colour in a
  single move

#### Scenario: A mistake blocks Check & Save

- **WHEN** the grid contains a rule violation and the player invokes Check & Save
- **THEN** `findMistakes` reports the offending cells and the save is blocked

#### Scenario: Satisfying every rule wins

- **WHEN** the last empty cell is set so that all three rules hold
- **THEN** the game is reported complete and flashes

