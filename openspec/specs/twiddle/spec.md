# twiddle Specification

## Purpose
TBD - created by archiving change add-twiddle-ts-port. Update Purpose after archive.
## Requirements
### Requirement: Twiddle game implements the Game interface

The engine SHALL provide a registered `twiddle` game implementing
`Game<TwiddleParams, TwiddleState, TwiddleMove, TwiddleUi, TwiddleDrawState>`:
a `w×h` grid of numbered tiles solved when the tile numbers read in
non-decreasing row-major order (and, when `orientable`, every tile is upright).
Params SHALL be `w`, `h`, `n` (rotating-block size), `rowsonly`, `orientable`,
and `movetarget`, encoded as `WxHnN` with trailing `r` (rowsonly) / `o`
(orientable) / `mK` (shuffle target) flags, with lenient decode (a bare `W`
yields a square `W×W` board, default `n = 2`). The eight upstream presets SHALL
be offered. `validateParams` SHALL reject `n < 2`, `w < n`, `h < n`, an
unreasonably large `w·h`, and a negative `movetarget`. The game SHALL report
`wantsStatusbar = true`, `isTimed = false`, `canSolve = true`, and
`canFormatAsText = true`. It SHALL NOT provide a `findMistakes` hook (every
reachable position is legal) and SHALL NOT provide a `hint` hook (no upstream
human solver exists for subsquare rotation).

#### Scenario: Params round-trip and lenient decode

- **WHEN** params `{ w: 4, h: 4, n: 3, rowsonly: false, orientable: false, movetarget: 0 }` are encoded
- **THEN** the result is `4x4n3`
- **AND** decoding `4x4n3`, `4n3` (square shorthand), and `4x4n3o` all round-trip
  to the corresponding params, with `o` setting `orientable`

#### Scenario: A generated board is scrambled and starts unsolved

- **WHEN** a new game is created from any valid params
- **THEN** the grid is a scramble of the solved arrangement that is not itself
  the solved arrangement, and reports a not-completed status
- **AND** generation terminates for every preset

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` receives `{ n: 1 }`, or `{ w: 2, n: 3 }`, or a
  negative `movetarget`
- **THEN** it returns a non-null human-readable reason

### Requirement: Twiddle rotation and solve moves transform state purely

A `TwiddleMove` SHALL be either a rotation carrying the top-left corner of the
`n×n` region and a direction (`{ type: "rotate", x, y, dir: 1 | -1 }`) or a
solve (`{ type: "solve" }`). `interpretMove` SHALL convert a left/right click to
a rotation by offsetting the click by `(n−1)/2` tiles so it selects the region
*centred* on the click, mapping to grid coordinates and rejecting clicks whose
region falls outside `0 ≤ x ≤ w−n`, `0 ≤ y ≤ h−n`; left-click rotates `dir +1`,
right-click `dir −1`. Cursor keys SHALL move a cursor over the
`(w−n+1)×(h−n+1)` rotation-origin space (clamped, no wrap) returning a UI update,
and `CURSOR_SELECT`/`CURSOR_SELECT2` SHALL rotate the cursor's block `dir +1`/`−1`
(a first select while the cursor is hidden only reveals it). Corner letters
`a`/`b`/`c`/`d` (and shifted `A`/`B`/`C`/`D` for the reverse direction) and the
parity-gated numpad rotations SHALL also produce rotations. `executeMove` SHALL
be pure (returning a new state): a rotation turns the `n×n` block 90° in `dir`
(advancing tile orientations when `orientable`), increments the move count, and
records completion when the solved arrangement is first reached; a solve SHALL
replace the grid with the solved arrangement, clear orientations, set
`usedSolve`, and suppress the completion flash.

#### Scenario: A rotation turns the block and is reversible

- **WHEN** a `dir +1` rotation executes on a block, then a `dir −1` rotation
  executes on the same block
- **THEN** the grid returns to its original arrangement, the source states are
  unmutated, and the move count increased by one per rotation

#### Scenario: Click geometry constrains legal rotations

- **WHEN** a click selects a region that would extend past the grid edge
  (its top-left corner outside `0 ≤ x ≤ w−n`, `0 ≤ y ≤ h−n`)
- **THEN** no move is produced

#### Scenario: Orientation matters in orientable mode

- **WHEN** the game is `orientable` and a rotation executes
- **THEN** each moved tile's orientation advances by the rotation direction
  (mod 4), and the board is reported complete only when the numbers are ordered
  **and** every tile is upright

#### Scenario: Solve snaps to the solved board

- **WHEN** the solve move executes
- **THEN** the new state is the solved arrangement with cleared orientations and
  `usedSolve` set, and the completion flash is suppressed on the following redraw

### Requirement: Twiddle renders tiles, cursor, rotation animation, and flash

The Twiddle `redraw` SHALL draw a one-time recessed bevelled border, then each
tile as a bevelled square with its centred number (and, when orientable, an
orientation triangle), maintaining a per-tile cache so a tile is repainted only
when its number/orientation changed, it lies within an animating block, the
cursor moved onto or off it, or the flash background changed. A rotation SHALL
animate the `n×n` block turning 90° about its centre over an animation duration
proportional to `sqrt(n−1)`, with the four bevel edges of each turning tile
recoloured through the rotation; tiles outside the block draw normally. A
genuine completion (not a solve) SHALL flash the background. When the cursor is
visible its `n×n` region SHALL be outlined with cursor-coloured bevel edges. The
status bar SHALL show the move count (with a `COMPLETED!` prefix when solved and
the `(target K)` suffix when a move target is set), or `Moves since auto-solve`
after a solve.

#### Scenario: First draw emits the border and numbered tiles

- **WHEN** `redraw` runs against a recording `GameDrawing` double for a fresh
  board
- **THEN** the recorded operations include the recessed border and one bevelled
  tile with its number for each cell

#### Scenario: A rotation animates the block

- **WHEN** a rotation move has just executed and `redraw` runs mid-animation
- **THEN** the tiles inside the rotated block are drawn at coordinates rotated
  about the block centre (and settle on their final cells at animation end),
  while tiles outside the block are drawn unrotated

#### Scenario: Completion flashes only on a genuine win

- **WHEN** the board reaches the solved arrangement by a player rotation
- **THEN** the redraw flashes the background for the flash duration
- **AND** when the board is solved via the solve move, no flash occurs

