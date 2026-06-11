# flood Specification

## Purpose
TBD - created by archiving change add-flood-ts-port. Update Purpose after archive.
## Requirements
### Requirement: Flood game implements the Game interface

The engine SHALL provide a registered `flood` game implementing
`Game<FloodParams, FloodState, FloodMove, FloodUi, FloodDrawState>`: a `w×h`
grid of coloured squares solved by flood-filling the top-left corner until the
whole grid is one colour within a move limit. Params SHALL be `w`, `h`,
`colours` (3–10), and `leniency`, encoded `WxH` with `c{colours}m{leniency}`
appended when `full`, with lenient decode (a bare `W` yields a square `W×W`
board). The seven upstream presets SHALL be offered. `validateParams` SHALL
reject `w·h < 2`, `colours` outside 3–10, and negative `leniency`. The game
SHALL report `wantsStatusbar = true`, `isTimed = false`, `canSolve = true`,
`canFormatAsText = true`, and SHALL NOT provide `findMistakes` (no per-move
mistake; the failure mode is the lose status).

#### Scenario: Params round-trip and lenient decode

- **WHEN** params `{ w: 12, h: 12, colours: 6, leniency: 5 }` are encoded with
  `full = true`
- **THEN** the result is `12x12c6m5`
- **AND** decoding `12x12c6m5` round-trips, and a bare `12` decodes to a 12×12
  board with the default colours/leniency

#### Scenario: A generated board is completable with its move limit

- **WHEN** a new game is created from any valid params
- **THEN** the grid is not already one colour, and the move limit equals the
  solver's move count plus the leniency

### Requirement: Flood fill and solve moves transform state purely

A `FloodMove` SHALL be a fill carrying a colour (`{ type: "fill", colour }`) or a
solve (`{ type: "solve" }`). `interpretMove` SHALL produce a fill only when the
clicked / cursor-selected cell's colour differs from the current corner colour
and the game is not complete; cursor keys SHALL move the cursor (clamped).
`executeMove` SHALL be pure: a fill floods the corner region to the chosen
colour, increments the move count, and sets `complete` when the whole grid is
one colour; a solve SHALL run the solver, apply its fills to reach the solved
grid, and set `cheated`.

#### Scenario: A fill floods the corner region

- **WHEN** a fill move with a colour adjacent to the controlled region executes
- **THEN** the corner region and all newly-adjacent same-colour squares become
  that colour, the move count increases by one, and the source state is unmutated

#### Scenario: A fill that does not change the corner colour is rejected

- **WHEN** input targets a cell whose colour equals the current corner colour
- **THEN** no move is produced

#### Scenario: Solve snaps to a completed grid

- **WHEN** the solve move executes
- **THEN** the grid becomes a single colour, `complete` is set, and `cheated`
  is set

### Requirement: Flood reports win and lose status

The Flood `status()` SHALL return `"solved"` when the grid is complete within the
move limit, `"lost"` when the move count reaches the limit before completing,
and `"ongoing"` otherwise. The status bar SHALL reflect the move count against
the limit with `COMPLETED!` / `FAILED!` / `Auto-solved` prefixes as appropriate.

#### Scenario: Exhausting the move limit loses

- **WHEN** the player makes the move that brings the move count up to the limit
  without completing the grid
- **THEN** `status()` returns `"lost"`

#### Scenario: Completing within the limit wins

- **WHEN** a fill completes the grid with the move count at or below the limit
- **THEN** `status()` returns `"solved"`

### Requirement: Flood offers a solver-backed hint plan

The Flood `hint()` SHALL return the solver's whole remaining move sequence as a
multi-step plan: each step is a fill, narrated by its colour and highlighting the
squares that fill will absorb. `hintKeepTrack` SHALL advance the plan when the
player makes the step's fill and drop it otherwise.

#### Scenario: Hint plan completes the board

- **WHEN** `hint()` is requested on an unsolved board and each step's fill is
  applied in order
- **THEN** the fills are legal and the grid reaches a single colour

#### Scenario: Following the plan keeps it; deviating drops it

- **WHEN** the player makes the current step's fill
- **THEN** `hintKeepTrack` reports it completed and the plan advances
- **AND** a different fill reports `"off"`

