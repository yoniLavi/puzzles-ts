# tracks Specification

## ADDED Requirements

### Requirement: Tracks game implements the Game interface

The engine SHALL provide a registered `tracks` game implementing
`Game<TracksParams, TracksState, TracksMove, TracksUi, TracksDrawState,
TracksMistake>`: lay a single continuous train track from an entrance on the
left edge to an exit on the bottom edge of a `w × h` grid, using only straight
and curved rails that neither cross nor form a loop, so every row and column
clue counts the number of track-bearing cells in that row/column. Params SHALL
be `w`, `h`, `diff` (Easy / Tricky / Hard) and `single_ones` (disallow
consecutive 1-clues), encoded `{w}x{h}` with a full-form `d{e|t|h}` difficulty
suffix and an `o` suffix when `single_ones` is false (square shorthand `{n}`).
All 12 upstream presets SHALL be offered. `validateParams` SHALL enforce a
minimum size of 4×4. The game SHALL report `canSolve = true` and
`canFormatAsText = true`, and SHALL drive a completion flash suppressed after
Solve.

#### Scenario: Params round-trip

- **WHEN** params `{ w: 10, h: 8, diff: Tricky, single_ones: false }` are
  encoded in full
- **THEN** the result is `10x8dto` and decoding it round-trips the params

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is given a grid smaller than 4×4
- **THEN** it returns a non-null error string

### Requirement: Tracks descriptions use the upstream encoding

The desc SHALL encode the `w × h` square grid row-major, one lowercase-run
character `a`–`z` compressing 1–26 consecutive non-clue squares and one
hexadecimal character (`0`–`9`, `A`–`F`) per clue square giving that clue's
two track-edge direction flags, followed by a `,`-separated list of `w + h`
clue numbers (column clues first, then row clues) with an `S` prefix marking
the exit column and the entrance row. `validateDesc` SHALL reject unknown
characters, clue flags whose bit-count is not exactly two, a number list that
is too short, and any description without exactly one entrance and one exit.
`newState` SHALL parse the desc into per-cell track edges and the shared,
immutable clue-number/station data, with the player grid initially blank.

#### Scenario: A description round-trips

- **WHEN** a generated desc is parsed by `newState` and re-encoded
- **THEN** the re-encoded desc equals the original

#### Scenario: A malformed description is rejected

- **WHEN** `validateDesc` is given a desc with a clue flag of the wrong
  bit-count, or without exactly one entrance and one exit
- **THEN** it returns a non-null error string

### Requirement: Tracks ports the graded solver faithfully

The port SHALL implement `tracks_solve` with its exact deductive power and rung
order at each difficulty. At Easy: edge/square flag propagation
(`update_flags`), row/column track-count deductions (`count_clues`), and
immediate loop avoidance over a `Dsf` (`check_loop`). At Tricky, additionally:
single-track reasoning (`check_single`), loose-end reasoning
(`check_loose_ends`), and the one-way neighbour deduction
(`check_neighbours(false)`). At Hard, additionally: the two-way neighbour
deduction (`check_neighbours(true)`) and the bridge-parity argument
(`check_bridge_parity`) over the shared `findLoops` bridge finder. The solver
SHALL return impossible / unique / non-converged verdicts identical to the C
solver on every board, reproducing C's edge-processing order where a later
deduction reads state a earlier one mutated. The solver SHALL be reused by
`solve()` and `findMistakes`.

#### Scenario: Generated boards solve at exactly their difficulty

- **WHEN** a board generated at Hard is solved
- **THEN** the Hard solver reaches the unique solution
- **AND** the Tricky solver fails to converge on it

#### Scenario: Solve recovers from a wrong mid-game state

- **WHEN** `solve()` runs against a state containing wrong track marks
- **THEN** the returned move yields the unique solution

### Requirement: Tracks generation is byte-identical to upstream

`newDesc` SHALL reproduce upstream `new_game_desc` byte-for-byte for the same
seed: `lay_path` (a random walk from a random left-edge entrance to a bottom
exit), clue-number derivation, rejection of boring boards and (under
`single_ones`) consecutive/exit 1-clues, `add_clues` (lay clues until soluble
at exactly the target difficulty, then strip redundant clues, re-running the
solver on each candidate), and the 4×4 Tricky/Hard → Easy fallback. A gated
differential test SHALL assert byte-equal descs against C-recorded fixtures
across all three difficulties and non-preset sizes, and that the TS solver
grades each C board at its recorded difficulty.

#### Scenario: Differential fixtures match

- **WHEN** `newDesc` runs with a fixture's params and seed
- **THEN** the emitted desc equals the C-recorded desc byte-for-byte
- **AND** the TS solver grades the C board at the recorded difficulty

### Requirement: Tracks computes live errors and completion as upstream

`executeMove` SHALL recompute error state exactly as upstream
`check_completion` with marking: a cell with more than two track edges is an
error; every cell on a track loop (via the shared `findLoops` over the track
graph) is an error; once a continuous entrance→exit path exists, any track cell
not on that path is an error; and a row or column whose track cells exceed its
clue, whose no-track cells exceed the complement, or whose completed track
count fails to match the clue once a path exists, is a clue error. The board is
complete when no errors exist and every clue's completed track count matches;
the completed flag SHALL latch.

#### Scenario: A loop is flagged

- **WHEN** track edges are placed forming a closed loop
- **THEN** every cell on the loop carries the error flag

#### Scenario: An over-filled clue is flagged

- **WHEN** a row has more track cells than its clue number
- **THEN** that row's clue is marked in error

#### Scenario: Completion latches

- **WHEN** a continuous entrance→exit track is laid meeting every clue with no
  loop
- **THEN** the state reports completed

### Requirement: Tracks input maps drag, click and cursor

`interpretMove` SHALL support: a left-drag that paints track along a single
straight row or column (right-drag paints no-track), toggling based on the
drag-start cell's current state; a click near a cell centre that toggles the
square's track (or no-track on right-click); a click near a cell edge that
toggles that edge's track (or no-track); and a half-grid keyboard cursor whose
select toggles a square (at a cell centre) or an edge (on a cell border), with
select2 toggling no-track. Moves that would change nothing, and interactions
outside the grid, SHALL produce no history move.

#### Scenario: A drag lays a straight run of track

- **WHEN** the player left-drags across three cells of one row from a blank
  start
- **THEN** those three cells are marked as track

#### Scenario: A no-op interaction produces no move

- **WHEN** a right-drag (no-track) covers only cells that already hold track,
  so no flag can change
- **THEN** `interpretMove` returns no history move

#### Scenario: A drag that drifts out of bounds keeps its last valid extent

- **WHEN** an in-progress straight drag is continued to a position on neither
  the start row nor the start column (e.g. the pointer wanders off the grid)
- **THEN** the drag stays active with its last valid extent frozen (rather
  than resetting to the start cell, as upstream did), and resumes when the
  pointer returns to the start row/column

### Requirement: Tracks ships findMistakes

`findMistakes(state)` SHALL re-solve the board's clues to the unique solution
and, when one exists, return one mistake per square or edge the player has
marked that contradicts that solution (a track where the solution has none, or
a no-track where the solution lays track); unmarked cells are never mistakes.
It SHALL return an empty list when the board is not uniquely solvable. Mistakes
SHALL render with the fork's red mistake styling, carried in the render diff
key so a mistake highlights even on a tile that did not otherwise change.

#### Scenario: A wrong mark blocks Check & Save

- **WHEN** a cell is marked as track where the unique solution has none and
  `findMistakes` runs
- **THEN** that cell is reported and rendered red

#### Scenario: A mistake overlay repaints an unchanged tile

- **WHEN** a tile is painted, `findMistakes` flags it, and `redraw` runs again
  with no other change to that tile
- **THEN** the second paint renders the red mistake styling

### Requirement: Tracks renders to full parity with the C build

`redraw` SHALL render, using the `NARROW_BORDERS` geometry (zero gutter, a
one-tile margin holding the clue numbers and the A/B entrance/exit labels):
straight rails drawn with sleepers, curved rails, no-track crosses on squares
and edges, the in-progress drag preview (a newly-set piece in `COL_DRAGON`
blue, a cleared piece in `COL_DRAGOFF` light blue), row/column clue numbers
(red on a clue error), the cursor highlight, and the upstream completion flash
that travels along the finished track. The drawstate SHALL diff a per-cell
`Int32Array` of committed and drag flags plus a clue-error sidecar, with the
findMistakes overlay carried in the diff key. The palette SHALL be
index-for-index with the C colour enum.

#### Scenario: A completed row clue turns red when over-filled

- **WHEN** a row holds more track cells than its clue
- **THEN** that row's clue number renders in the error colour

#### Scenario: A drag preview shows provisional pieces

- **WHEN** a left-drag is in progress over blank cells
- **THEN** the covered cells render their provisional track in the drag colour
