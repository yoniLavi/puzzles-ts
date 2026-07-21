# sticks Specification

## Purpose
TBD - created by archiving change add-sticks-ts-port. Update Purpose after archive.
## Requirements
### Requirement: Sticks game implements the Game interface

The engine SHALL provide `src/native/games/sticks/` implementing the `Game`
interface for Sticks (Tatebo-Yokobo), registered so the puzzle is served by the
TypeScript engine.

Parameters SHALL be a width, a height, a percentage of black squares, and a
symmetry (none, 2-way mirror, 2-way rotational, 4-way mirror, or 4-way
rotational). Validation SHALL require width and height each at least 2, and, for a
full parameter check, the black-square percentage between 5 and 100, a known
symmetry, and 4-way rotational symmetry only on a square grid. A game ID SHALL
encode the width, height, black-square percentage and symmetry, and round-trip
through decode; a bare `width x height` ID SHALL decode without a symmetry marker.

Sticks SHALL be a uniquely-solvable logic puzzle and SHALL therefore declare a
`findMistakes` hook, so Check & Save can hard-block a save that contradicts the
solution.

#### Scenario: Every preset produces a uniquely solvable board

- **WHEN** a new game is generated for any preset or legal size
- **THEN** a board is produced that the deductive solver can complete to the
  unique solution

#### Scenario: A game ID round-trips through the parameters

- **WHEN** a parameter set is encoded to a game ID and decoded
- **THEN** the same width, height, black-square percentage and symmetry are
  recovered

### Requirement: Sticks descriptions use the run-length blank encoding

A Sticks description SHALL encode the fixed puzzle data — black cells and clue
numbers — over the grid cells in row-major order: runs of plain blank cells SHALL
be abbreviated with lowercase letters, a black cell SHALL carry a marker with an
optional adjacent clue digit, and a clue number SHALL be written inline as decimal
digits. The description SHALL account for exactly the grid's cell count.

Validation SHALL reject a description that accounts for more or fewer cells than
the grid holds, distinguishing too many from too few, and SHALL reject a
description containing an unknown character.

#### Scenario: A generated description round-trips

- **WHEN** a description is generated and then decoded into a board
- **THEN** re-encoding that board yields the identical description

#### Scenario: A description with the wrong number of cells is rejected

- **WHEN** a description accounting for more or fewer cells than the grid has is
  validated
- **THEN** it is rejected with a message distinguishing too long from too short

### Requirement: Sticks ports the deductive solver and solver-gated generator

Sticks SHALL provide a deductive solver that fills the blank cells with horizontal
or vertical lines consistent with every clue, or reports that the board is
invalid. The solver SHALL work by contradiction on single cells: it SHALL try each
blank cell as one orientation and, when that makes the board provably invalid,
commit the opposite orientation, iterating until no further cell is forced. The
solver SHALL NOT use backtracking, and SHALL classify a board as complete,
unfinished, or invalid.

Validity SHALL be checked against the puzzle rules: a numbered line SHALL have the
stated length, a line SHALL overlap at most one number, and a numbered black cell
SHALL connect to the stated number of lines.

The generator SHALL place black squares under the chosen symmetry, fill and clue
the board, and retain a candidate only while the deductive solver deduces it to a
unique completion; it SHALL then remove clues in a randomised order, keeping each
removal only while the board stays uniquely solvable. Generation from a given seed
SHALL be reproducible.

#### Scenario: The solver completes a soluble board

- **WHEN** a generated board is solved from its clues alone
- **THEN** the solver returns the unique completion, with every numbered line at
  its stated length and every numbered black cell at its stated connection count

#### Scenario: Generation is reproducible from a seed

- **WHEN** the same seed is used twice for the same parameters
- **THEN** both runs produce the identical board description

### Requirement: Sticks input, mistake-checking and completion

Sticks SHALL be played by dragging to draw a line, clicking to place a line
(left-click a vertical line, right-click a horizontal line), or using a keyboard
cursor with keys to place or clear a line. A drag SHALL draw the orientation of
its dominant axis across the cells it passes and SHALL clear matching lines when
started on one. Black cells SHALL never take a line, and placing a line already in
that state SHALL be a no-op that does not reach the undo history.

`findMistakes` SHALL re-solve the board from its fixed clues and flag every cell
whose player-drawn line contradicts the unique solution; a merely missing line
SHALL NOT be flagged. The game SHALL be reported solved when every blank cell
carries a line consistent with all clues, and SHALL flash once on completion.
There SHALL be no interpolated animation of line placement.

#### Scenario: Dragging draws a line

- **WHEN** the pointer is dragged horizontally or vertically within the grid past
  the drag threshold
- **THEN** a line of the dragged orientation is placed in the cells the drag
  crosses

#### Scenario: A contradicting line is flagged as a mistake

- **WHEN** the board is checked and a placed line differs from the unique
  solution's line for that cell
- **THEN** that cell is reported as a mistake

#### Scenario: Completing the grid consistently wins

- **WHEN** every blank cell carries a line consistent with all clues
- **THEN** the game is reported solved and flashes

