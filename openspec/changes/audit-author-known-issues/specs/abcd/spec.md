# abcd Specification Delta — audit-author-known-issues

## MODIFIED Requirements

### Requirement: ABCD input, entry, marks and completion

ABCD SHALL be played by selecting a cell — by mouse click or arrow-key cursor — and
entering one of the letters, with a pencil-mark mode for candidate marks. Entering a
letter SHALL accept the letter keys and the bare digit keys `1` to `9` up to the
letter count; clearing SHALL accept Backspace, Space, and `0`. A fill-all-marks
command SHALL set every empty cell's candidate marks. A Solve command SHALL fill the
grid with the unique solution.

An entry that would leave the state exactly as it is SHALL produce no move, and so
no history entry: re-entering the letter a cell already holds, or clearing a cell
that is already empty and carries no marks. Clearing an empty cell that *does*
carry marks SHALL remain a real move, because it wipes them. The decision SHALL be
made locally from that cell's own contents, never by comparing serialised states.

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

#### Scenario: Re-entering the letter already present costs no undo step

- **WHEN** a cell already holds a letter and that same letter is entered again
- **THEN** no move is produced and the undo history is unchanged

#### Scenario: Clearing a cell that holds only marks is a real move

- **WHEN** an empty cell carrying pencil marks is cleared
- **THEN** a move is produced, and undoing it restores the marks

#### Scenario: Completing the grid correctly wins

- **WHEN** the final cell is filled so that every clue is met and no identical
  letters are adjacent
- **THEN** the game is reported solved and flashes

#### Scenario: An entry that contradicts the solution is flagged

- **WHEN** the mistake check runs and a cell holds a letter that differs from the
  puzzle's unique solution
- **THEN** that cell is reported as a mistake
