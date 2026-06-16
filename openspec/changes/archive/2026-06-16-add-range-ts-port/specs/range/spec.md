## ADDED Requirements

### Requirement: Range game implements the Game interface

The engine SHALL provide a registered `range` game implementing
`Game<RangeParams, RangeState, RangeMove, RangeUi, RangeDrawState>`: the
Nikoli puzzle Kurodoko / Kuromasu, in which the player paints some white
squares black so that no two black squares are orthogonally adjacent, all
white squares stay connected, and every numbered clue equals the number of
white squares visible from it in a straight line (itself counted once,
`h + v - 1`). Params SHALL be `w` and `h`, encoded `{w}x{h}`. The 4 upstream
presets — 9×6, 12×8, 13×9, 16×11 — SHALL be offered. `validateParams` SHALL
reject non-positive dimensions, a `w + h` that overflows the cell encoding,
and (when `full`) the degenerate 1×1, 1×2, 2×1, and 2×2 grids that admit no
good puzzle. The game SHALL report `wantsStatusbar = false`,
`isTimed = false`, `canSolve = true`, and `canFormatAsText = true`.

#### Scenario: Params round-trip

- **WHEN** params `{ w: 13, h: 9 }` are encoded
- **THEN** the result is `13x9`
- **AND** decoding `13x9` round-trips the params
- **AND** decoding the bare `12` yields `{ w: 12, h: 12 }`

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is called with full generation on a 2×2 grid, or
  with a non-positive dimension
- **THEN** it returns a non-null error string

### Requirement: Range descriptions are run-length clue grids

The desc SHALL encode the board in scan order: the decimal digits of each
clue, a letter `a`-`z` for each run of 1-26 blank (non-clue) cells, and `_`
as an explicit separator where two clues or a clue and a run would otherwise
merge, exactly as upstream. `validateDesc` SHALL reject any other character,
any clue outside `1 .. w + h - 1`, and any desc whose decoded cell count
differs from `w * h`. `newState` SHALL parse the desc into the grid with clue
cells holding their value and every other cell `EMPTY`, `hasCheated` and
`wasSolved` both false.

#### Scenario: A description round-trips

- **WHEN** a generated desc is parsed by `newState` and the clue grid is
  re-encoded
- **THEN** the re-encoded desc equals the original

#### Scenario: A malformed description is rejected

- **WHEN** `validateDesc` is given a desc with an invalid character, an
  out-of-range clue, or a decoded length mismatching the params
- **THEN** it returns a non-null error string

### Requirement: Range generates uniquely solvable symmetric boards

`newDesc` SHALL generate a board by painting up to `n / 3` randomly chosen
squares black (skipping any that would touch an existing black square or
disconnect the white region), computing every white square's clue from its
horizontal and vertical white runs, then removing clues — all clues
rotationally symmetric to a black square, then rotationally symmetric pairs
in random order — keeping only removals that leave the board solvable
**without** recursion, retrying the whole generation when the symmetric
removals cannot all be made. Every generated board SHALL be uniquely solvable
by the deductive solver without recursion, contain at least one black square,
and have two-way rotationally symmetric clues.

#### Scenario: Generated boards are valid and solvable

- **WHEN** `newDesc` runs for a seeded RNG across all four presets
- **THEN** every desc passes `validateDesc`
- **AND** the deductive solver (without recursion) solves every resulting
  board from its visible clues alone to a state with no errors

### Requirement: Range solves boards with four deductive rules plus recursion

The solver SHALL reach a unique solution by repeatedly applying, to a
fixpoint: (1) a cell adjacent to a black cell is white; (2) a clue whose
visible white run in three directions is fixed forces the remaining count
into the fourth direction, and a cell whose inclusion would exceed the clue
is black; (3) a square whose painting black would disconnect the white region
(a cut vertex of the white graph) is white; and only when those stall, (4)
recursion — try a cell both colours and force the surviving colour when one
leads to a contradiction. `solve` SHALL run the full solver (including
recursion) from the initial clues and return the completing sequence of
cell-sets, or an error when the board contains a contradiction.

#### Scenario: The adjacency rule whitens a neighbour

- **WHEN** the solver runs on a grid with a black cell beside an empty cell
- **THEN** that empty cell is set white

#### Scenario: Solve completes a generated board

- **WHEN** the Solve command runs on a generated board
- **THEN** it returns a move whose cell-sets paint every undecided cell, after
  which `status` returns `"solved"` and `findErrors` reports no error

### Requirement: Range marks cells via three-state cycling moves

A `RangeMove` SHALL be a list of cell-sets (each painting a cell black, white,
or empty) plus an optional solve flag (upstream's `S`, marking the state
cheated and solved). `executeMove` SHALL be pure, throw on an out-of-bounds or
clue-cell target, and — unless the solve flag is set — recompute `wasSolved`
as the absence of errors after applying the sets. Left-button / select on a
non-clue cell SHALL cycle empty → black → white → empty; right-button /
select2 SHALL cycle empty → white → black → empty; a clue cell SHALL be
inert. A keyboard cursor SHALL move within the grid, and shift + a cursor
direction SHALL place a white dot on the vacated and/or entered empty cells.

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
- **THEN** `findErrors` reports no error, `wasSolved` becomes true, `status`
  returns `"solved"`, and a flash plays

### Requirement: Range highlights errors live and checks mistakes against the solution

`redraw` SHALL highlight, in the error colour, every cell currently violating
a rule — a black cell orthogonally adjacent to another black cell, a clue
whose visible white run cannot equal its number, or a white cell cut off from
the main white component — recomputed each frame from `findErrors`, matching
upstream's live error display. Separately, `findMistakes` SHALL re-solve the
puzzle from its initial clues and return every player-marked non-clue cell
whose mark contradicts the unique solution (black where the solution is white,
or white-dotted where the solution is black), returning none when the marks
are consistent or undecided.

#### Scenario: A black-adjacency violation reddens live

- **WHEN** two orthogonally adjacent cells are both painted black
- **THEN** `redraw` draws both in the error colour without any explicit check
  action

#### Scenario: findMistakes flags a wrong black

- **WHEN** the player paints black a cell that is white in the unique solution
  and Check & Save runs
- **THEN** `findMistakes` returns that cell
- **AND** a board whose marks all agree with the solution returns no mistakes
