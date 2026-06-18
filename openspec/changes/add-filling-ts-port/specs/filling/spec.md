## ADDED Requirements

### Requirement: Filling game implements the Game interface

The engine SHALL provide a registered `filling` game implementing
`Game<FillingParams, FillingState, FillingMove, FillingUi, FillingDrawState>`:
the Nikoli puzzle Fillomino on a `w × h` grid in which every cell is filled with
a number `n` such that each maximal orthogonally-connected region of equal
numbers contains exactly `n` cells. Params SHALL be `w` and `h`, encoded
`{w}x{h}`, with presets 9×7, 13×9 (default), and 17×13. `validateParams` SHALL
require `w ≥ 1`, `h ≥ 1`, and `w·h` not unreasonably large. The game SHALL
report `wantsStatusbar = false`, `isTimed = false`, `canSolve = true`, and
`canFormatAsText = true`.

#### Scenario: Params round-trip

- **WHEN** params `{ w: 13, h: 9 }` are encoded
- **THEN** the result is `13x9`
- **AND** decoding it round-trips the params
- **AND** decoding a bare `9` yields a 9×9 square grid

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is called with `w < 1` or `h < 1`
- **THEN** it returns a non-null error string

### Requirement: Filling descriptions are run-length number grids

The desc SHALL encode the immutable clue cells in scan order: a lowercase letter
`a`–`z` advances past a run of `1`–`26` empty (unclued) cells, and a digit
places a clue of that value. `validateDesc` SHALL reject any other character and
SHALL require the decoded area to equal `w·h` exactly. `newState` SHALL decode
the desc into an immutable `clues` grid and a mutable player `board` initialised
to a copy of the clues.

#### Scenario: Description decodes to the clued board

- **WHEN** a valid desc for a `w × h` board is decoded by `newState`
- **THEN** each clued position holds its number and is immutable
- **AND** every other cell is empty and player-editable

#### Scenario: Mismatched description length is rejected

- **WHEN** `validateDesc` is given a desc whose decoded area is less than or
  greater than `w·h`
- **THEN** it returns a non-null error string

### Requirement: Filling generates uniquely solvable boards

`newDesc` SHALL build a board by partitioning the grid into regions whose sizes
equal their cell values (capped at `min(max(max(w,h),3), 9)`), then reduce the
clue set — removing whole regions and then individual clues — keeping a removal
only while the solver still solves the board, so the published clues uniquely
determine the solution. Generation SHALL be byte-faithful to upstream over the
shared bit-identical RNG (same shuffle and `randomUpto` draw sequence).

#### Scenario: Every generated board is solvable

- **WHEN** a board is generated for any preset
- **THEN** the solver fills every cell
- **AND** each resulting region's size equals its number

### Requirement: Filling solver deduces the unique solution

The solver SHALL apply four sound, confluent deductive techniques to fixpoint —
forced single-direction region growth, capacity-forced expansion / isolated
`1`-drop, critical distant squares, and per-cell possible-number bitmap
elimination (including inference of unclued "ghost" regions) — and SHALL report
whether the board was fully solved. `solve` SHALL return the completed board as
a move.

#### Scenario: Solver completes a generated board

- **WHEN** the solver runs on a freshly generated puzzle's clues
- **THEN** it reports solved
- **AND** the produced board has every region sized to its number

### Requirement: Filling fill moves and selection

`interpretMove` SHALL support selecting cells (left-click / left-drag build a
selection, keyboard cursor with multi-select, CURSOR_SELECT2 toggle, Esc clear)
and filling them: a digit key `0`–`9` (backspace ≡ `0`) sets every selected
non-clue cell — or the cursor cell when nothing is selected — to that value,
emitting a single move that changes at least one cell, and is rejected when the
value exceeds `max(w,h)` (or `3` for a 2×2 board). `executeMove` SHALL write the
value into each listed cell and mark the state completed when every cell's value
equals its region size. The selection SHALL be cleared after every committed
move.

#### Scenario: Filling a selection sets every selected cell

- **WHEN** two non-clue cells are selected and the digit `3` is pressed
- **THEN** the emitted move sets both cells to `3`
- **AND** after executing it the selection is cleared

#### Scenario: A completed grid is detected

- **WHEN** a move fills the last cells so every region's size equals its number
- **THEN** the resulting state reports `solved`

### Requirement: Filling rendering shows regions, errors, and completion

`redraw` SHALL draw each cell's number (clue cells and player-filled cells in
distinct colours), bold borders between cells that differ where at least one is
filled or either region is complete/overfull, a selection highlight, a cursor
outline, a completed-region shade, and an error shade for a region whose size
exceeds its number or an incomplete region that is fully boxed in. On the
transition to solved (not via Solve) it SHALL flash. The renderer SHALL paint no
pixels the engine owns: the first-draw branch draws the grid frame and each cell
fills its own background.

#### Scenario: Overfull region is flagged

- **WHEN** the board contains a region whose connected size exceeds its number
- **THEN** that region's cells are drawn with the error shade

### Requirement: Filling reports mistakes for Check & Save

The game SHALL implement `findMistakes(state)` by re-solving from the immutable
clues to the unique solution and returning every player-filled cell whose number
contradicts the solution, returning an empty result when the clues are not
uniquely solvable. This makes the shell's Check & Save control hard-block a save
on a wrong board.

#### Scenario: A wrong fill is flagged and clears

- **WHEN** a player fills a cell with a number that contradicts the unique
  solution and `findMistakes` is called
- **THEN** that cell is reported as a mistake
- **AND** when the cell is corrected the mistake is no longer reported
