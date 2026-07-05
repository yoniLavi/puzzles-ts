# tents Specification

## Purpose
TBD - created by archiving change add-tents-ts-port. Update Purpose after archive.
## Requirements
### Requirement: Tents game implements the Game interface

The engine SHALL provide a registered `tents` game implementing
`Game<TentsParams, TentsState, TentsMove, TentsUi, TentsDrawState, TentsMistake>`:
place tents on a `w × h` grid of fixed trees so that each tent is
orthogonally adjacent to a tree in a one-to-one tree↔tent matching, no two
tents are even diagonally adjacent, and each row/column contains exactly its
edge-clue number of tents. Params SHALL be `w`, `h` and `diff`
(Easy / Tricky), encoded `{w}x{h}d{e|t}` (short form `{w}x{h}`, square
shorthand `{n}`). All 6 upstream presets (8×8, 10×10, 15×15 × Easy/Tricky)
SHALL be offered. `validateParams` SHALL enforce minimum size 4×4. The game
SHALL report `canSolve = true`, `canFormatAsText = true`, and
`needsRightButton = true` (upstream `REQUIRE_RBUTTON`).

#### Scenario: Params round-trip

- **WHEN** params `{ w: 15, h: 15, diff: TRICKY }` are encoded in full
- **THEN** the result is `15x15dt` and decoding it round-trips the params

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is given a grid smaller than 4×4
- **THEN** it returns a non-null error string

### Requirement: Tents descriptions use the upstream run-length encoding

The desc SHALL encode the tree grid row-major (a run-length code where `_`
is a tree, `a`–`y` a run of 1–25 blanks then a tree, `z` a run of 25 blanks,
and the sequence terminates with a tree-past-the-end marker) followed by the
`w + h` edge numbers (columns then rows) each preceded by a comma.
`validateDesc` SHALL reject invalid characters, wrong grid area, and missing
or malformed numbers. `newState` SHALL parse the desc into a tree grid and an
edge-number array shared (frozen) across all states of the game, with all
non-tree squares initially blank.

#### Scenario: A description round-trips

- **WHEN** a generated desc is parsed by `newState` and re-encoded
- **THEN** the re-encoded desc equals the original

#### Scenario: A malformed description is rejected

- **WHEN** `validateDesc` is given a desc with a bad grid area or a missing
  number
- **THEN** it returns a non-null error string

### Requirement: Tents ports the graded solver faithfully

The port SHALL implement upstream `tents_solve` with its exact deductive
power at each difficulty, returning the impossible / unique / non-converged
(0 / 1 / 2) verdict identical to the C solver on every board. It SHALL
perform: tent↔tree link deduction (a tent with one unattached adjacent tree,
and a tree with one candidate square, are linked); non-tent marking (a blank
with no adjacent unmatched tree, or diagonally adjacent to any tent); the
Tricky tree diagonal-pair elimination; and the row/column
combination-enumeration pass that places a tent or non-tent in any square
given the same state by every valid placement of the row's remaining tents
(with the Tricky adjacent-row influence). The solver SHALL be reused by
`solve()`, the generator's difficulty gate, and `findMistakes`.

#### Scenario: Generated boards solve at exactly their difficulty

- **WHEN** a board generated at Tricky is solved
- **THEN** the Tricky solver reaches the unique solution
- **AND** the Easy solver fails to converge on it

#### Scenario: Solve recovers from a wrong mid-game state

- **WHEN** `solve()` runs against a state containing wrong tents
- **THEN** the returned move yields the unique solution

### Requirement: Tents generation is byte-identical to upstream

`newDesc` SHALL reproduce upstream `new_game_desc` byte-for-byte for the same
seed: place `w*h/5` tents at random mutually-non-adjacent squares (an order
permutation driven by `random_upto`), place trees via the bipartite
`matching` (RNG-faithful), reject any layout with an empty row or column,
derive the edge numbers, and accept only when the solver succeeds at the
target difficulty and fails one level below. A gated differential test SHALL
assert byte-equal descs against C-recorded fixtures for all 6 presets and a
non-preset size, and SHALL grade each C board with the TS solver at the
C-recorded difficulty.

#### Scenario: Differential fixtures match

- **WHEN** `newDesc` runs with a fixture's params and seed
- **THEN** the emitted desc equals the C-recorded desc byte-for-byte

### Requirement: Tents computes live errors and completion as upstream

`redraw` SHALL compute live error highlighting exactly as upstream
`find_errors`: diagonally- or orthogonally-adjacent tent pairs mark the
shared corner(s) with an error diamond; a row/column whose tent count exceeds
its clue or whose tents-plus-blanks fall below its clue marks that edge
number red; and, via two connected-component passes over the bipartite
tent/tree adjacency (a `dsf`), a tent in a component with fewer trees than
tents, or a tree in a component with more trees than tents-or-blanks, is
highlighted red. `executeMove` SHALL mark the board complete exactly as
upstream `execute_move`: the tent count equals the tree count, every edge
number is met, no two tents are adjacent, and the trees and tents admit a
perfect adjacency matching (bipartite `matching`). The completed flag SHALL
latch and SHALL suppress the win flash after Solve.

#### Scenario: Adjacent tents are flagged

- **WHEN** two tents are placed diagonally adjacent
- **THEN** the shared corner shows an error diamond

#### Scenario: An unmet clue is flagged

- **WHEN** a column already holds more tents than its edge number
- **THEN** that edge number renders red

#### Scenario: Completion requires a valid matching

- **WHEN** the tents match all edge numbers and are non-adjacent but no
  perfect tree↔tent matching exists
- **THEN** the state does not report completed

### Requirement: Tents input maps drag gestures, cursor and direct keys

`interpretMove` SHALL implement the upstream drag model: pressing the left or
right button starts a one-cell drag; dragging extends it along the single
nearer row or column; releasing enacts it. A left click sets a blank square
to a tent or clears a non-blank square; a right click sets a blank to a
non-tent or clears a non-blank; a right-drag sets every blank square it
covers to a non-tent. Trees are never modified. Arrow keys SHALL move a
cursor (revealing it first), select/select2 SHALL set the cursor square to a
tent/non-tent (or clear it), and the literal keys `T`/`N`/`B` SHALL set it
directly. A gesture producing no change SHALL return no move.

#### Scenario: A left click toggles a tent

- **WHEN** a blank square is left-clicked, then left-clicked again
- **THEN** the square becomes a tent, then blank

#### Scenario: A right-drag paints non-tents

- **WHEN** the right button is dragged across a row of blank squares
- **THEN** every covered blank square becomes a non-tent

### Requirement: Tents ships findMistakes

`findMistakes(state)` SHALL re-solve the board's trees and edge numbers with
the top-difficulty solver and, when a unique solution exists, return one
mistake per placed square that contradicts it — a tent where the solution has
none, or a non-tent where the solution has a tent (blank squares are never
mistakes) — rendered with a distinct inset red overlay; it SHALL return an
empty list when the board is not uniquely solvable.

#### Scenario: A wrong tent blocks Check & Save

- **WHEN** a tent is placed where the unique solution has none and
  `findMistakes` runs
- **THEN** exactly that square is reported and rendered with the mistake
  overlay

#### Scenario: Blank squares are not mistakes

- **WHEN** the board holds only correct tents and non-tents plus blanks
- **THEN** `findMistakes` returns an empty list

### Requirement: Tents renders to full parity with the C build

`redraw` SHALL render: grass-filled non-blank tiles, trees (trunk rectangle
plus leaf circles), tents (triangle), grid lines, the edge numbers on the
bottom (columns) and right (rows) borders, red error colouring (error trunk,
error leaf/tent, adjacency diamonds with exclamation marks, red numbers), the
keyboard cursor outline, and the upstream 3-phase completion flash (trees and
tents blanked on the flashed thirds). The web build's `NARROW_BORDERS`
geometry SHALL be used (thin top-left border, number room on the
bottom/right). The drawstate SHALL diff a packed `Int32Array` per tile
(square value plus every error, cursor, flash, and mistake overlay bit) and a
separate per-number diff array, so every overlay is in the diff key. The
palette SHALL be index-for-index with the C colour enum, the fork mistake
colour appended past it.

#### Scenario: A mistake overlay repaints an unchanged tile

- **WHEN** a tile is painted, `findMistakes` flags it, and `redraw` runs
  again with no square-value change
- **THEN** the second paint renders the mistake overlay

#### Scenario: Edge numbers render red on error

- **WHEN** a row's tent count exceeds its edge clue
- **THEN** that row's number is drawn in the error colour

