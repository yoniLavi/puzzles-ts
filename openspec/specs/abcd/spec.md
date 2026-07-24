# abcd Specification

## Purpose
TBD - created by archiving change add-abcd-ts-port. Update Purpose after archive.
## Requirements
### Requirement: ABCD game implements the Game interface

The engine SHALL provide `src/native/games/abcd/` implementing the `Game`
interface for ABCD, registered so the puzzle is served by the TypeScript engine.

Parameters SHALL be a width, a height, a letter count, a "disallow diagonal
adjacency" flag, and a "remove clues" flag. Validation SHALL require width and
height at least 2, a letter count of at most 9 and at least 3 (at least 5 when
diagonal adjacency is disallowed), matching upstream. A game ID SHALL encode the
width, height, letter count and the diagonal flag and round-trip through decode;
the "remove clues" flag is a generation-time setting and SHALL appear only in the
full parameter encoding.

Because ABCD has a unique solution, it SHALL declare a `findMistakes` hook that
re-solves the clues to the canonical grid and reports every entered letter that
differs from it.

#### Scenario: A game ID round-trips through the parameters

- **WHEN** a parameter set is encoded to a game ID and decoded
- **THEN** the same width, height, letter count and diagonal flag are recovered

#### Scenario: Invalid letter counts are rejected

- **WHEN** parameters request fewer than 3 letters in normal mode, fewer than 5
  letters with diagonal adjacency disallowed, or more than 9 letters
- **THEN** validation rejects them with a message naming the offending bound

### Requirement: ABCD descriptions use the edge-clue encoding

An ABCD description SHALL encode the puzzle as a comma-terminated list of
`(width + height) × letters` clue numbers — the row clues followed by the column
clues, each row's or column's clues in letter order — with a bare `-` standing for
a hidden clue.

Validation SHALL reject a description whose clue count is not exactly
`(width + height) × letters`, distinguishing too few clues from too many, whose row
clue exceeds `1 + width / 2` or whose column clue exceeds `1 + height / 2`, or that
contains an unrecognised character. Encoding and decoding SHALL be exact inverses.

#### Scenario: A generated description round-trips

- **WHEN** a description is generated and then decoded into a state
- **THEN** re-encoding that state's clue numbers yields the identical description

#### Scenario: A description with the wrong number of clues is rejected

- **WHEN** a description carrying more or fewer clue entries than
  `(width + height) × letters` is validated
- **THEN** it is rejected with a message distinguishing too few from too many

### Requirement: ABCD ports the deductive solver and solver-gated generator

ABCD SHALL provide a deductive solver that, given the clue numbers, reports whether
the puzzle is uniquely solvable, ambiguous, or contradictory. The solver SHALL
apply, to a fixpoint and without backtracking, elimination of a letter from a line
whose count is already met, placement of a cell's single remaining candidate, and
the run-length technique that forces letters when a line's maximum placement equals
its required count. The solver SHALL NOT depend on any leaf library.

The generator SHALL fill the grid with random letters that respect the no-touch
rule, count the resulting clues, and accept the puzzle only when the solver reports
it uniquely solvable, retrying otherwise. When "remove clues" is set, the generator
SHALL hide clues in a randomised order, keeping each removal only while the puzzle
stays uniquely solvable. Generation from a given seed SHALL be reproducible.

#### Scenario: The solver classifies a puzzle

- **WHEN** the solver is run on a clue set
- **THEN** it reports uniquely solvable, ambiguous, or contradictory, and for a
  uniquely solvable set it yields the solution grid

#### Scenario: Generation is reproducible from a seed

- **WHEN** the same seed is used twice for the same parameters
- **THEN** both runs produce the identical description

### Requirement: ABCD input, entry, marks and completion

ABCD SHALL be played by selecting a cell — by mouse click or arrow-key cursor — and
entering one of the letters, with a pencil-mark mode for candidate marks. Entering a
letter SHALL accept the letter keys and the bare digit keys `1` to `9` up to the
letter count; clearing SHALL accept Backspace, Space, and `0`. A fill-all-marks
command SHALL set every empty cell's candidate marks. A Solve command SHALL fill the
grid with the unique solution.

Rendering SHALL draw the letter grid with edge clues and corner letters, SHALL show
pencil marks in empty cells and the cursor highlight, SHALL colour a clue and a
letter red while a rule is violated (a clue over- or under-satisfied, or identical
letters adjacent — orthogonally, and diagonally when that is disallowed), and SHALL
flash on completion. There SHALL be no move animation.

The game SHALL be reported solved when every cell is filled, every clue is
satisfied, and no two identical letters are adjacent under the active adjacency
rule.

#### Scenario: Entering a letter fills the selected cell

- **WHEN** a cell is selected and a letter key (or its digit) within the letter
  count is pressed
- **THEN** that letter is placed in the cell

#### Scenario: Completing the grid correctly wins

- **WHEN** the final cell is filled so that every clue is met and no identical
  letters are adjacent
- **THEN** the game is reported solved and flashes

#### Scenario: An entry that contradicts the solution is flagged

- **WHEN** the mistake check runs and a cell holds a letter that differs from the
  puzzle's unique solution
- **THEN** that cell is reported as a mistake

