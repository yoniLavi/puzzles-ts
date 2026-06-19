# singles Specification

## Purpose
TBD - created by archiving change add-singles-ts-port. Update Purpose after archive.
## Requirements
### Requirement: Singles game implements the Game interface

The engine SHALL provide a registered `singles` game implementing
`Game<SinglesParams, SinglesState, SinglesMove, SinglesUi, SinglesDrawState,
SinglesMistake>`: the Nikoli puzzle Hitori on a `w × h` grid of numbers, in
which the player blackens cells so that no number repeats among the remaining
(white) cells of any row or column, no two black cells are orthogonally
adjacent, and the white cells form one orthogonally-connected region. Params
SHALL be `w`, `h`, and `diff` (Easy or Tricky), encoded `{w}x{h}d{c}` when full
(`c` = `e`/`k`) and `{w}x{h}` otherwise, with presets at 5×5, 6×6, 8×8, 10×10,
and 12×12 in both Easy and Tricky. `validateParams` SHALL require `w ≥ 2`,
`h ≥ 2`, both `≤ 62`, and (when full) a known difficulty. The game SHALL report
`wantsStatusbar = false`, `isTimed = false`, `canSolve = true`, and
`canFormatAsText = true`.

#### Scenario: Params round-trip

- **WHEN** params `{ w: 8, h: 8, diff: "tricky" }` are encoded with `full = true`
- **THEN** the result is `8x8dk`
- **AND** decoding it round-trips the params
- **AND** encoding with `full = false` yields `8x8`

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is called with `w < 2` or `h < 2`
- **THEN** it returns a non-null error string

### Requirement: Singles descriptions are fixed-length number grids

The desc SHALL encode the board's numbers in scan order, one character per cell:
digits `0`–`9` for `0`–`9`, letters `a`–`z` for `10`–`35`, `A`–`Z` for `36`–`61`.
`validateDesc` SHALL require the desc length to equal `w·h` exactly and every
decoded number to lie in `1..max(w,h)`. `newState` SHALL decode the desc into an
immutable `nums` grid with all flags blank.

#### Scenario: Description decodes to the number grid

- **WHEN** a valid desc for a `w × h` board is decoded by `newState`
- **THEN** each cell holds its decoded number
- **AND** every cell starts neither black nor circled

#### Scenario: Wrong-length description is rejected

- **WHEN** `validateDesc` is given a desc whose length is not `w·h`
- **THEN** it returns a non-null error string

### Requirement: Singles toggle moves and cursor

`interpretMove` SHALL map a left-click / `CURSOR_SELECT` on a grid cell to a move
that toggles the cell black (clearing it to empty if it was already black or
circled), and a right-click / `CURSOR_SELECT2` to a move that toggles the cell
circled (clearing it to empty if already set). A click outside the grid SHALL
toggle the show-black-numbers preference (a `UI_UPDATE`). Keyboard cursor moves
SHALL move the cursor and SHALL return a `UI_UPDATE` (revealing the cursor on the
first arrow press) rather than a history move. `executeMove` SHALL clear both the
black and circle bits on each targeted cell before applying the new value, and
SHALL set the board completed when `checkComplete` reports no errors.

#### Scenario: Left-click cycles a cell through black and back to empty

- **WHEN** the player left-clicks an empty cell, then left-clicks it again
- **THEN** the first move marks it black
- **AND** the second move clears it to empty

#### Scenario: Completion is detected

- **WHEN** the player reaches a configuration with no repeated white numbers in
  any row or column, no adjacent blacks, and a single white region
- **THEN** `status` reports the game solved

### Requirement: Singles deductive solver

The game SHALL provide a deductive solver reproducing the upstream techniques:
the auto-cascade (a black forces its neighbours white; a circled cell forces
same-numbered cells in its row/column black), `singlesep`, `doubles`, `corners`,
`offsetpair` (Tricky and above), `allblackbutone`, and `removesplits` (Tricky
and above). It SHALL detect impossibility (e.g. a white cell with no white
escape, or a contradiction in the cascade). `solve` SHALL attempt to solve the
current state and then the initial state, returning the move that completes the
board or an error when neither can be solved, and SHALL mark the state as
solved-with-help.

#### Scenario: Solver completes a generated board

- **WHEN** a board generated at a given difficulty is solved by the solver from
  its initial numbers
- **THEN** the solver fully determines every cell (black or white) with no errors

#### Scenario: Solve reports failure on an unsolvable position

- **WHEN** `solve` is called on a board the solver cannot complete
- **THEN** it returns a non-null error and applies no move

### Requirement: Singles generator produces unique, difficulty-graded boards

`newDesc` SHALL generate a board by constructing a Latin rectangle, adding black
squares at random with solver assistance (forced whites laid between
placements), and assigning numbers under the black squares so the solution stays
unique. It SHALL accept the board only when it is solvable at the requested
difficulty and *not* solvable one difficulty level below (with the sneaky
generation-artefact deduction enabled), regenerating otherwise. Difficulty SHALL
downgrade to Easy when `min(w, h) < 4`. The generation SHALL be RNG-faithful to
upstream so that, over the bit-identical `random.ts`, the produced desc matches
the C reference byte-for-byte for the same seed.

#### Scenario: Generated boards are uniquely solvable at their difficulty

- **WHEN** a board is generated at difficulty D
- **THEN** the solver solves it at D
- **AND** (for Tricky) the solver fails to solve it at the level below D even
  with the sneaky deduction

#### Scenario: Desc matches the C reference byte-for-byte

- **WHEN** `newDesc` runs for a seed and params recorded from the C build
- **THEN** the produced desc equals the recorded C desc exactly

### Requirement: Singles rendering

`redraw` SHALL draw a grid-outlined tile per cell: black (or red on error) fill
for a blackened cell, otherwise the background (or lowlight during the
completion flash); a circle ring for a circled (white-marked) cell; the cell's
number always for a white cell and, when the show-black-numbers preference is
on, also for a black cell; cursor corners on the cursor cell; and a red grid
outline when the board is in an impossible state. The palette SHALL be ordered
index-for-index with the upstream colour enum. A genuine completion (not a
solved-with-help) SHALL trigger the completion flash.

#### Scenario: A blackened cell renders black with no number by default

- **WHEN** a cell is blackened and the show-black-numbers preference is off
- **THEN** the tile is filled with the black colour and no number is drawn

#### Scenario: An erroneous cell renders in the error colour

- **WHEN** `checkComplete` flags a cell as an error
- **THEN** that cell is drawn in the error colour

### Requirement: Singles show-black-numbers preference

The game SHALL expose a single boolean preference, "Show numbers on black
squares" (keyword `show-black-nums`), via the engine `prefs` hook, stored on the
`Ui` and read by `redraw`. It SHALL default to off.

#### Scenario: Preference toggles numbers on black squares

- **WHEN** the show-black-numbers preference is turned on
- **THEN** subsequent redraws draw each black cell's number

### Requirement: Singles mistake-checking

The game SHALL implement `findMistakes(state)`: re-solve the board from its
immutable numbers to the unique solution and return every player cell whose
black/white choice contradicts that solution (a cell marked black where the
solution is white, or circled where the solution is black). Undecided cells SHALL
never be reported. It SHALL return an empty result when the board is consistent
with the unique solution, so the shell's Check & Save control hard-blocks a save
only on a genuine mistake.

#### Scenario: A wrong black is flagged

- **WHEN** the player blackens a cell that the unique solution leaves white
- **THEN** `findMistakes` includes that cell

#### Scenario: A correct partial board reports no mistakes

- **WHEN** every black/circle the player has placed agrees with the unique
  solution
- **THEN** `findMistakes` returns an empty result

