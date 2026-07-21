# clusters Specification Delta — add-clusters-ts-port

## ADDED Requirements

### Requirement: Clusters game implements the Game interface

The engine SHALL provide `src/native/games/clusters/` implementing the `Game`
interface for Clusters, registered so the puzzle is served by the TypeScript
engine.

Parameters SHALL be a width and a height. Validation SHALL reject a board whose
area is at least 10000 ("too large") or less than 2 ("too small"), matching
upstream. A game ID SHALL encode the width and height (a bare single number read
as a square board) and round-trip through decode.

Because Clusters is a unique-solution logic puzzle with a built-in rule checker,
it SHALL declare a `findMistakes` hook so Check & Save can flag rule-violating
cells.

#### Scenario: Every preset produces a uniquely solvable board

- **WHEN** a new game is generated for any preset or legal size
- **THEN** a board is produced whose blank cells can be filled to satisfy the
  cluster rules in exactly one way, and the solver completes it

#### Scenario: A game ID round-trips through the parameters

- **WHEN** a parameter set is encoded to a game ID and decoded
- **THEN** the same width and height are recovered, and a bare single number is
  read as a square board

### Requirement: Clusters descriptions use the upstream run-length dot encoding

A Clusters description SHALL encode only the given dot clues, in row-major order:
a lowercase letter SHALL denote a red dot preceded by a run of blank cells, an
uppercase letter SHALL denote a blue dot preceded by a run of blank cells, and
`z` or `Z` SHALL denote a pure skip of twenty-five blank cells so that longer
runs chain. The accumulated position SHALL total the board area plus one.

Validation SHALL reject a description whose accumulated position is short of or
past the board area plus one (distinguishing "too short" from "too long"), and
SHALL reject any character outside the letter alphabet.

#### Scenario: A generated description round-trips

- **WHEN** a description is generated and then decoded into a board
- **THEN** re-encoding that board yields the identical description

#### Scenario: A description with the wrong number of cells is rejected

- **WHEN** a description whose accumulated position differs from the board area
  plus one is validated
- **THEN** it is rejected with a message distinguishing too short from too long

### Requirement: Clusters ports the contradiction solver and solver-gated generator

Clusters SHALL provide a solver that classifies a board as complete, unfinished
or invalid and marks the cells that break a rule. The solver SHALL fill forced
cells by contradiction — tentatively setting each colour in an empty cell and
taking the other colour when one makes the board invalid — and SHALL apply one
level of hypothetical lookahead. Clusters SHALL expose no difficulty tiers.

The generator SHALL use the solver to keep every board uniquely solvable: it
SHALL two-colour the grid at random, flip isolated cells until none remains,
reduce the board to dot clues, prune adjacent equal dots, and retry until the
solver completes the board. Generation from a given seed SHALL be reproducible.

#### Scenario: The solver completes a uniquely solvable board

- **WHEN** a generated board is solved
- **THEN** the solver fills every blank cell to the unique solution and reports
  the board complete

#### Scenario: Generation is reproducible from a seed

- **WHEN** the same seed is used twice for the same parameters
- **THEN** both runs produce the identical board description

### Requirement: Clusters input, mistakes and completion

Clusters SHALL be played by clicking or dragging to paint cells and by a keyboard
cursor. A left click or drag SHALL cycle a cell toward blue and a right click or
drag toward red, each also able to clear a cell; a drag SHALL paint every cell it
passes. The keyboard cursor SHALL place blue, red or blank via dedicated keys.
Given dot cells SHALL never be overwritten. A move that changes no non-given cell
SHALL produce no history entry.

The game SHALL report the cells that break a cluster rule through `findMistakes`
so Check & Save can hard-block on them. Solving SHALL fill the board to the
unique solution. Completion SHALL be reached when every cell is filled and no
rule is broken, and the board SHALL flash on completion. There SHALL be no
interpolated move animation.

#### Scenario: Dragging paints a run of cells

- **WHEN** a drag is started and moved across several blank cells
- **THEN** every non-given cell it passes is painted the drag colour on release

#### Scenario: A rule-breaking cell is reported as a mistake

- **WHEN** the board contains a cell that violates a cluster rule and mistakes
  are checked
- **THEN** that cell is reported, and Check & Save declines to save

#### Scenario: Completing the grid wins

- **WHEN** a move fills the last cell so every cell satisfies the cluster rules
- **THEN** the game is reported solved and flashes
