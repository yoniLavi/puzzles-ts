## ADDED Requirements

### Requirement: Same Game implements the Game interface

The engine SHALL provide a registered `samegame` game implementing
`Game<SamegameParams, SamegameState, SamegameMove, SamegameUi,
SamegameDrawState>`: a block-clearing puzzle on a `w×h` grid of coloured tiles
(colours `1..ncols`, `0` = empty) in which the player removes
orthogonally-connected groups of one colour. Params SHALL be `w`, `h`, `ncols`,
`scoresub` (1 or 2), and `soluble`, encoded `{w}x{h}c{ncols}s{scoresub}[r]`
(the trailing `r` present only when `full` and not `soluble`) with lenient
decode. The five upstream presets — `5×5`, `10×5`, `15×10` (all 3 colours),
`15×10` and `20×15` (4 colours), all `scoresub = 2`, soluble — SHALL be offered.
`validateParams` SHALL require `w ≥ 1`, `h ≥ 1`, `ncols ≤ 9`, `scoresub ∈ {1,2}`,
and — when soluble — `ncols ≥ 3` and `w·h > 1`, or — when not soluble —
`ncols ≥ 2` and `w·h ≥ 2·ncols`. The game SHALL report `wantsStatusbar = true`,
`isTimed = false`, `canSolve = false`, and `canFormatAsText = true`, and SHALL
NOT provide `solve`, `hint`, or `findMistakes`.

#### Scenario: Params round-trip and lenient decode

- **WHEN** params `{ w: 15, h: 10, ncols: 4, scoresub: 2, soluble: true }` are
  encoded with `full = true`
- **THEN** the result is `15x10c4s2`
- **AND** decoding `15x10c4s2` round-trips those params
- **AND** encoding the same params with `soluble: false` and `full = true`
  yields `15x10c4s2r`, which round-trips with `soluble: false`

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is called with `{ soluble: true, ncols: 2 }`
- **THEN** it returns a non-null error string
- **AND** `{ soluble: false, w: 2, h: 2, ncols: 3 }` (area `4 < 2·ncols`) also
  returns a non-null error string

### Requirement: Same Game generates guaranteed-soluble and random boards

`newDesc` SHALL produce the board as a comma-separated list of `w·h` colour
integers in row-major order. When `soluble` is true it SHALL use the
inverse-move generator (repeatedly inserting a verified connected blob whose
removal reproduces the prior grid, so the board is clearable); when `soluble` is
false it SHALL use the legacy random generator (at least two tiles of every
colour, the remainder filled at random). The generated desc SHALL be
byte-identical to the C build for the same random seed and params.
`validateDesc` SHALL reject a desc without exactly `w·h` comma-separated
integers, or any integer outside `0..ncols`. `newState` SHALL parse the desc into
the tile grid with score 0 and the complete/impossible flags clear.

#### Scenario: A soluble description is byte-identical to C

- **WHEN** `newDesc` runs for a soluble preset with a fixed seed
- **THEN** the desc equals the C engine's desc for that seed byte-for-byte
- **AND** `validateDesc` accepts it and `newState` parses `w·h` tiles

#### Scenario: A malformed description is rejected

- **WHEN** `validateDesc` is given a desc with too few numbers, or one
  containing a colour greater than `ncols`
- **THEN** it returns a non-null error string

### Requirement: Same Game removes connected groups, scores, and compacts

A `SamegameMove` SHALL be `{ type: "remove"; tiles: number[] }` carrying the grid
indices to clear. `executeMove` SHALL be pure: it SHALL range-check each index,
set those tiles empty, add `max(0, n − scoresub)²` to the score (where `n` is the
number of removed tiles), let remaining tiles fall to the bottom of their
columns, shuffle non-empty columns to the left, and recompute `complete` (the
grid is empty) and `impossible` (no two orthogonally-adjacent tiles share a
colour). `status` SHALL return `"solved"` when `complete` and otherwise
`"ongoing"` — a no-moves-left (`impossible`) position is NOT `"lost"` (it is
rescuable by Undo).

#### Scenario: Removing a group scores and compacts

- **WHEN** a `remove` move clearing a group of 4 tiles is executed with
  `scoresub = 2`
- **THEN** the new state's score increases by `(4 − 2)² = 4`
- **AND** tiles above the cleared cells have fallen and empty columns have moved
  right, and the source state is unmutated

#### Scenario: Clearing the last tiles wins

- **WHEN** a `remove` move empties the final non-empty tiles
- **THEN** the new state is `complete` and `status()` returns `"solved"`

#### Scenario: A stuck board is impossible but not lost

- **WHEN** a state has no two orthogonally-adjacent same-colour tiles and is not
  empty
- **THEN** that state's `impossible` flag is set and `status()` returns
  `"ongoing"`

### Requirement: Same Game supports two-click selection, keyboard input, and a live score

`interpretMove` SHALL implement the two-click select-then-remove gesture using a
selection held in `SamegameUi` (not in the game state): clicking a removable tile
(part of a same-colour group of size ≥ 2) SHALL flood-select the connected region
and return a UI update; clicking again on that selection (left button or
`CURSOR_SELECT`) SHALL emit the `remove` move; right-clicking or `CURSOR_SELECT2`
on the selection SHALL clear it (UI update); clicking an empty or lone tile SHALL
select nothing. A keyboard cursor SHALL move with the cursor keys and act at the
cursor on select. `changedState` SHALL clear the selection on every real
transition. `statusbarText` SHALL show `"Score: N"`, extended to `"...  Selected:
K (P)"` while a region of `K` tiles worth `P = max(0, K − scoresub)²` points is
selected, `"COMPLETE! Score: N"` when complete, and `"Cannot move! Score: N"`
when impossible.

#### Scenario: First click selects, second click removes

- **WHEN** a removable tile is clicked
- **THEN** `interpretMove` returns a UI update, the connected same-colour region
  is selected in the Ui, and `statusbarText` reports the selected count and its
  potential points
- **WHEN** a selected tile is then clicked again
- **THEN** `interpretMove` returns a `remove` move carrying the selected indices

#### Scenario: A lone tile cannot be selected

- **WHEN** a tile with no same-colour orthogonal neighbour is clicked
- **THEN** no selection is made and no `remove` move is produced

#### Scenario: The selection clears across a move

- **WHEN** a `remove` move is applied
- **THEN** `changedState` leaves the Ui with no active selection
