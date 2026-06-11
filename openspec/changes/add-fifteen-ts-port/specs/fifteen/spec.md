# fifteen Specification

## ADDED Requirements

### Requirement: Fifteen game implements the Game interface

The engine SHALL provide a registered `fifteen` game implementing
`Game<FifteenParams, FifteenState, FifteenMove, FifteenUi, FifteenDrawState>`:
an `w×h` grid of numbered tiles with one empty gap, solved when the tiles read
`1..n-1` in row-major order with the gap last. Params SHALL be `w`, `h`,
encoded `WxH` with lenient decode (a bare `W` yields a square `W×W` board). The
single upstream preset (`4x4`) SHALL be offered, and `validateParams` SHALL
reject `w < 2` or `h < 2`. The game SHALL report `wantsStatusbar = true`,
`isTimed = false`, `canSolve = true`, and `canFormatAsText = true`. It SHALL
NOT provide a `findMistakes` hook (every reachable position is legal).

#### Scenario: Params round-trip and lenient decode

- **WHEN** params `{ w: 4, h: 4 }` are encoded
- **THEN** the result is `4x4`
- **AND** decoding `4x4` and `4` both yield `{ w: 4, h: 4 }`, while a
  non-square `5x4` decodes to `{ w: 5, h: 4 }`

#### Scenario: A generated board is solvable and starts unsolved

- **WHEN** a new game is created from any valid params
- **THEN** the tile array is a permutation whose parity matches the gap's
  chessboard parity (i.e. the board is reachable from the solved state)
- **AND** the initial state is not already in the solved arrangement and
  reports a not-completed status

### Requirement: Fifteen slide and solve moves transform state purely

A `FifteenMove` SHALL be either a slide carrying the destination gap cell
(`{ type: "move", x, y }`) or a solve (`{ type: "solve" }`). `interpretMove`
SHALL produce a slide only when the target cell shares exactly one coordinate
with the current gap (a click sharing zero or both coordinates, or out of
bounds, produces nothing); cursor keys SHALL slide the adjacent tile into the
gap immediately using the default arrow semantics (the pressed arrow moves a
tile in that direction). `executeMove` SHALL be pure (returning a new state):
a slide shifts every tile on the line between the old and new gap one cell
toward the old gap, incrementing the move count once per shifted tile and
recording completion when the solved arrangement is first reached; a solve
SHALL replace the grid with the solved permutation, set `usedSolve`, and
suppress the completion flash.

#### Scenario: A slide shifts a line of tiles into the gap

- **WHEN** a slide move targets a cell sharing one coordinate with the gap,
  three tiles away along that line
- **THEN** all three tiles shift one cell toward the old gap, the gap lands on
  the targeted cell, the move count increases by three, and the source state
  is unmutated

#### Scenario: Click geometry constrains legal slides

- **WHEN** a click targets a cell diagonal to the gap (sharing neither
  coordinate exactly, or sharing both)
- **THEN** no move is produced

#### Scenario: Solve snaps to the solved board

- **WHEN** the solve move executes
- **THEN** the new state is the solved permutation with `usedSolve` set, and
  the completion flash is suppressed on the following redraw

### Requirement: Fifteen offers a greedy full-solution hint plan

The Fifteen `hint()` SHALL return the whole greedy solution as a multi-step
plan: each step is the next single-cell gap slide chosen by the greedy human
solver (fill the shorter of the top row / left column tile-by-tile, moving the
next tile toward its home, with a hard-coded shortest-move table for the
end-of-line corner), narrated by the tile it slides and highlighting that tile.
Following the plan from any solvable board SHALL reach the solved state.
`hintKeepTrack` SHALL return `"completed"` for a player move that produces
exactly the board the current step expects (advancing the plan), and `"off"`
otherwise (dropping the plan so the next request recomputes). Returning the
whole plan — rather than one step per request — keeps the hint displayed while
it is followed, consistent with the other sliding-tile game.

#### Scenario: Hint plan solves a solvable board

- **WHEN** `hint()` is requested on an unsolved board and every step's move is
  applied in order
- **THEN** the steps are legal single-cell gap slides and the board reaches the
  solved arrangement within the upstream `5·n³` move bound

#### Scenario: Hint highlights the tile it moves

- **WHEN** `hint()` is requested on an unsolved board
- **THEN** the first step's move is a slide whose target is one cell from the
  gap, and its highlight names the tile that will slide into the gap

#### Scenario: Following the plan keeps it displayed; deviating drops it

- **WHEN** the player makes exactly the move the current step describes
- **THEN** `hintKeepTrack` reports the step completed and the plan advances
- **AND** a different move reports `"off"`, dropping the plan

### Requirement: Fifteen renders tiles, border, and slide animation

The Fifteen `redraw` SHALL draw a one-time recessed bevelled border, then each
tile as a bevelled square with its centred number (the gap drawn as plain
background), maintaining a per-tile cache so a tile is repainted only when it
changed, is animating, or the flash background changed. A slide SHALL animate
in two passes — cells vacated by moving tiles blanked first, then each moving
tile drawn interpolated one cell from its old position toward the gap over the
animation duration. A genuine completion (not a solve) SHALL flash the
background for two frames. The status bar SHALL show the move count, a
`COMPLETED!` prefix when solved, or `Moves since auto-solve` after a solve.

#### Scenario: First draw emits the border and numbered tiles

- **WHEN** `redraw` runs against a recording `GameDrawing` double for a fresh
  board
- **THEN** the recorded operations include the recessed border and one bevelled
  tile with its number for each non-gap cell

#### Scenario: A slide animates between cells

- **WHEN** a slide move has just executed and `redraw` runs mid-animation
- **THEN** the moving tiles are drawn at coordinates interpolated between their
  old and new cells, settling exactly on their destination cells at animation
  end
