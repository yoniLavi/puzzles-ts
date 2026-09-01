# range Specification Delta — unify-cross-game-vocabulary

## MODIFIED Requirements

### Requirement: Range descriptions are run-length clue grids

The desc SHALL encode the board in scan order: the decimal digits of each
clue, a letter `a`-`z` for each run of 1-26 blank (non-clue) cells, and `_`
as an explicit separator where two clues or a clue and a run would otherwise
merge, exactly as upstream. `validateDesc` SHALL reject any other character,
any clue outside `1 .. w + h - 1`, and any desc whose decoded cell count
differs from `w * h`. `newState` SHALL parse the desc into the grid with clue
cells holding their value and every other cell `EMPTY`, `cheated` and
`completed` both false.

#### Scenario: A description round-trips

- **WHEN** a generated desc is parsed by `newState` and the clue grid is
  re-encoded
- **THEN** the re-encoded desc equals the original

#### Scenario: A malformed description is rejected

- **WHEN** `validateDesc` is given a desc with an invalid character, an
  out-of-range clue, or a decoded length mismatching the params
- **THEN** it returns a non-null error string

### Requirement: Range marks cells via three-state cycling moves

A `RangeMove` SHALL be a list of cell-sets (each painting a cell black, white,
or empty) plus an optional solve flag (upstream's `S`, marking the state
cheated and completed). `executeMove` SHALL be pure, throw on an out-of-bounds
or clue-cell target, and — unless the solve flag is set — recompute `completed`
as the absence of errors after applying the sets. Left-button / select on a
non-clue cell SHALL cycle empty → black → white → empty; right-button /
select2 SHALL cycle empty → white → black → empty; a clue cell SHALL be
inert. A keyboard cursor SHALL move within the grid, and shift + a cursor
direction SHALL place a white dot on the vacated and/or entered empty cells.

Range's grid is row-major and its own helpers take `(r, c)`. The keyboard
cursor is nevertheless the collection's shared `(x, y)` shape, so `cursor.x` is
this game's column and `cursor.y` its row — the one place in the collection
where the two conventions meet, and therefore the one place it is worth saying.

#### Scenario: Left and right cycle in opposite directions

- **WHEN** an empty non-clue cell receives a left-button action, then another,
  then another
- **THEN** it passes black → white → empty
- **AND** the same cell under three right-button actions passes white → black
  → empty

#### Scenario: Clue cells reject marking

- **WHEN** a marking action targets a cell holding a clue
- **THEN** `interpretMove` returns `null` and the cell is unchanged

#### Scenario: Completing the board is detected

- **WHEN** a move paints the final black square of the unique solution
- **THEN** `findErrors` reports no error, `completed` becomes true, `status`
  returns `"solved"`, and a flash plays
