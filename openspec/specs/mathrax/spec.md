# mathrax Specification

## Purpose
TBD - created by archiving change add-mathrax-ts-port. Update Purpose after archive.
## Requirements
### Requirement: Mathrax game implements the Game interface

The engine SHALL provide `src/games/mathrax/` implementing the `Game`
interface for Mathrax, registered so the puzzle is served by the TypeScript engine.

Parameters SHALL be a grid size, a difficulty (Easy, Normal, Tricky or Recursive),
and a set of enabled clue types (addition, subtraction, multiplication, division,
equality, even/odd). Validation SHALL require the size to be at least 3 and at most 9,
the difficulty to be known, and — when validating for generation — at least one clue
type enabled. A game ID SHALL encode the size, difficulty and enabled clue types and
round-trip through decode, where an empty encoded clue-type set means all clue types
are enabled.

The objective SHALL be to fill the grid with digits from 1 to the grid size so that no
digit repeats in any row or column and every clue is satisfied.

#### Scenario: A game ID round-trips through the parameters

- **WHEN** a parameter set is encoded to a game ID and decoded
- **THEN** the same size, difficulty and enabled clue types are recovered

#### Scenario: Every preset produces a uniquely solvable board

- **WHEN** a new game is generated for any preset or legal size
- **THEN** a board is produced whose filled solution is unique and satisfies every
  clue

### Requirement: Mathrax clues constrain the four digits around each intersection

Clues SHALL sit on the interior grid intersections. Each clue SHALL constrain the four
digits diagonally adjacent to it. An arithmetic clue (add, subtract, multiply, divide)
SHALL require the operation to give the same result on both diagonal pairs and SHALL
display that result; an equality clue SHALL require each diagonal pair to be equal; an
even clue SHALL require all four digits to be even and an odd clue all four to be odd.

#### Scenario: An arithmetic clue is satisfied on both diagonals

- **WHEN** the four digits around an addition clue showing `n` are examined
- **THEN** the two diagonally-opposite pairs each sum to `n`

#### Scenario: A parity clue constrains all four digits

- **WHEN** an even clue sits on an intersection
- **THEN** all four digits around it are even

### Requirement: Mathrax descriptions use the run-length grid-and-clue encoding

A Mathrax description SHALL encode the immutable given digits and then the clues, in
two comma-separated run-length parts. In the grid part each square SHALL be a digit or
part of a run of empty squares; in the clue part each intersection SHALL be an
arithmetic clue with its number, an equality, even or odd marker, or part of a run of
empty intersections. Encoding and decoding SHALL be exact inverses.

Validation SHALL reject a description whose grid part carries more squares than the
grid holds, that contains a digit larger than the grid size, that uses an unknown
character, that names an unknown clue or a clue number that is too large, or whose grid
or clue part stops short of covering the grid.

#### Scenario: A generated description round-trips

- **WHEN** a description is generated and then decoded into a board
- **THEN** re-encoding that board yields the identical description

#### Scenario: An out-of-range digit is rejected

- **WHEN** a description containing a given digit larger than the grid size is
  validated
- **THEN** it is rejected

### Requirement: Mathrax ports the Latin-square solver and generator faithfully

Mathrax SHALL solve using the shared Latin-square solver framework, contributing its
own clue deductions: for each cell it SHALL intersect its candidate digits with those
permitted by each adjacent clue given the opposite cell's candidates, across the Easy,
Normal, Tricky and Recursive difficulty levels. The generator SHALL produce a full
Latin square, derive a candidate clue at every interior intersection, and then remove
given digits and clues in a randomised order while the puzzle remains **uniquely**
solvable at the target difficulty. Generation from a given seed SHALL be reproducible.

Uniqueness is required at *every* difficulty, including the guess-and-verify
`Recursive` tier. This is a deliberate divergence from upstream, which tests its
solver's verdict for bare truthiness and so accepts an *ambiguous* verdict as grounds
to keep removing — leaving that whole tier with puzzles that have several solutions
(measured: 30 of 30 sampled boards, and the recorded C descriptions for it are blank
grids). A board with no unique answer cannot be mistake-checked, so Check & Save would
silently pass anything played on it.

#### Scenario: The solver solves a generated board

- **WHEN** a generated board is solved
- **THEN** the returned grid is the board's unique Latin-square solution and satisfies
  every clue

#### Scenario: Generation is reproducible from a seed

- **WHEN** the same seed is used twice for the same parameters
- **THEN** both runs produce the identical board description

#### Scenario: Even the guess-and-verify tier yields a unique solution

- **WHEN** a board is generated at the `Recursive` difficulty
- **THEN** it has exactly one solution, and it cannot be solved without the
  guess-and-verify step

### Requirement: Mathrax input, notes and completion

Mathrax SHALL be played with the Solo-style control scheme: a cell is selected for ink
by left-click or cursor and for pencil marks by right-click, digit keys enter a value
or toggle a pencil mark, and backspace, space or zero clear. Immutable given cells
SHALL NOT be editable. Entering the value already present in a cell SHALL be a no-op.
The game SHALL support filling every empty cell with all candidate pencil marks, and
SHALL provide an on-screen digit keypad sized to the grid.

The game SHALL be reported solved when every cell is filled with no row, column or clue
violation, and SHALL flash on completion.

#### Scenario: A digit is entered into a selected cell

- **WHEN** an empty mutable cell is selected and a digit within range is typed
- **THEN** that digit is placed in the cell

#### Scenario: Completing the grid correctly wins

- **WHEN** the last cell is filled so that every row, column and clue is satisfied
- **THEN** the game is reported solved and flashes

#### Scenario: An on-screen keypad is offered for digit entry

- **WHEN** the on-screen keys are requested for a size-`o` game
- **THEN** the keypad offers the digits 1 to `o` and a clear key

### Requirement: Mathrax flags mistakes against the unique solution

Because Mathrax has a unique solution, it SHALL provide `findMistakes`, so that Check &
Save can hard-block saving a wrong board. It SHALL re-solve from the immutable clues to
the unique solution and flag every placed digit that contradicts it, and every empty
cell whose pencil notes have crossed out that cell's solution value. A cell whose notes
merely carry extra candidates SHALL NOT be flagged, and the solution SHALL be derived
from placed values only, never from the notes. When the board is not uniquely
deducible, no cell SHALL be flagged.

#### Scenario: A wrong placed digit is flagged

- **WHEN** a cell holds a digit that differs from the unique solution and mistakes are
  checked
- **THEN** that cell is reported as a mistake

#### Scenario: A note that rules out the solution value is flagged

- **WHEN** an empty cell's pencil notes are non-empty and have crossed out that cell's
  solution value
- **THEN** that cell is reported as a mistake

#### Scenario: Extra candidate notes are not a mistake

- **WHEN** an empty cell's pencil notes include the solution value alongside other
  candidates
- **THEN** that cell is not reported as a mistake

