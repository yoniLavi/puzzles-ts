# towers Specification

## Purpose
TBD - created by archiving change add-towers-ts-port. Update Purpose after archive.
## Requirements
### Requirement: Towers game implements the Game interface

The engine SHALL provide a registered `towers` game implementing
`Game<TowersParams, TowersState, TowersMove, TowersUi, TowersDrawState,
TowersMistake>`: the puzzle Skyscrapers on a `w × w` grid, in which the player
places a tower of height `1..w` in every cell so that each row and column
contains every height exactly once, and so that each outside clue equals the
number of towers visible from that edge (a taller tower hides every shorter one
behind it). Params SHALL be `w` and `diff` (Easy, Hard, Extreme, or
Unreasonable), encoded `{w}d{c}` when full (`c` = `e`/`h`/`x`/`u`) and `{w}`
otherwise, with presets at 4×4 Easy, 5×5 Easy/Hard, and 6×6
Easy/Hard/Extreme/Unreasonable. `validateParams` SHALL require `3 ≤ w ≤ 9` and
(when full) a known difficulty. The game SHALL report `wantsStatusbar = false`,
`isTimed = false`, `canSolve = true`, and `canFormatAsText = true`.

#### Scenario: Params round-trip

- **WHEN** params `{ w: 6, diff: "unreasonable" }` are encoded with `full = true`
- **THEN** the result is `6du`
- **AND** decoding it round-trips the params
- **AND** encoding with `full = false` yields `6`

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is called with `w < 3` or `w > 9`
- **THEN** it returns a non-null error string

### Requirement: Towers descriptions encode edge clues and grid givens

The desc SHALL encode the `4w` edge clues first — top row, then bottom row, then
left column, then right column — as `/`-separated fields, each either a decimal
clue (`1..w`) or empty for "no clue"; optionally followed by `,` and the grid
givens in scan order, run-length-encoded (a letter `a`–`z` for `1`–`26`
consecutive blanks, an optional `_` separator, a decimal digit for a given
tower). `validateDesc` SHALL reject the wrong number of clue fields, a clue out
of `1..w`, an out-of-range given, and a grid-data length other than `w²`.
`newState` SHALL decode the clues into an immutable `clues` array and the givens
into both the immutable `immutable` array and the working `grid`.

#### Scenario: Description round-trips through generate and decode

- **WHEN** a board is generated and its desc decoded by `newState`
- **THEN** every edge clue is placed at its decoded index
- **AND** every given tower appears in both `immutable` and `grid`
- **AND** every non-given cell starts empty with no pencil marks

#### Scenario: Malformed description is rejected

- **WHEN** `validateDesc` receives a desc with too few clue fields or a grid of
  the wrong length
- **THEN** it returns a non-null error string

### Requirement: Towers generates uniquely-solvable boards at the target difficulty

`newDesc` SHALL generate a full Latin square, derive all `4w` edge clues from
it, then remove grid givens and (above Easy) clues for as long as the puzzle
remains solvable by the graded solver at the chosen difficulty, regenerating
until the puzzle is solvable at *exactly* that difficulty and no lower. The
result SHALL be uniquely solvable. `newDesc` SHALL also return an `aux`
solution string.

#### Scenario: Generated board is unique and correctly graded

- **WHEN** a board is generated at a difficulty `d`
- **THEN** the solver solves it at difficulty `d`
- **AND** the solver does not solve it at any lower difficulty
- **AND** the solved grid is a valid Latin square satisfying every clue

### Requirement: Towers accepts digit, pencil, clue-strike, and solve moves

`interpretMove` SHALL select a cell by mouse (with 3D-aware hit-testing so a
click on a tower protruding from a neighbouring cell selects that neighbour) or
keyboard cursor, distinguishing a real-entry highlight (left button / select)
from a pencil-mark highlight (right button / select2). With a cell highlighted,
a digit `1..w` SHALL enter that tower (or toggle the pencil mark in pencil
mode), and backspace/space/0 SHALL clear it; entering a value a cell already
holds SHALL be a no-op. A click or shift/ctrl-cursor onto an outside clue SHALL
toggle that clue's struck-through ("done") state. Immutable (given) cells SHALL
reject entry. `executeMove` SHALL apply the move purely, returning a new state,
and SHALL set `completed` when the filled grid violates no clue or Latin
constraint.

#### Scenario: Entering the last correct tower completes the board

- **WHEN** the player enters the final tower that completes a correct grid
- **THEN** `executeMove` returns a state with `completed = true`

#### Scenario: Entry into an immutable cell is rejected

- **WHEN** `interpretMove` would enter a digit into a given cell
- **THEN** it returns `null` (no move)

#### Scenario: Clue strike toggles

- **WHEN** the player clicks an outside clue
- **THEN** `executeMove` toggles that clue's done flag

### Requirement: Towers renders in selectable 3D and 2D styles with pencil marks

`redraw` SHALL render the `w × w` play area surrounded by the outside clue cells,
with each filled cell drawn — under the default 3D appearance preference — as a
tower whose height scales the drawn solid, and under the 2D preference as a
plain centred digit. Empty cells SHALL show their pencil marks in an
auto-sized grid layout. The renderer SHALL colour given towers, user-entered
towers, struck-through ("done") clues, and error cells distinctly, highlight the
selected cell (full highlight for real entry, a corner wedge for pencil mode),
draw the keyboard cursor, and flash on completion. Cells SHALL be diffed against
a per-tile cache that accounts for a 3D tower's protrusion into its
up-left neighbours.

#### Scenario: Initial 3D frame draws clues and towers

- **WHEN** the initial frame of a generated board is rendered with the 3D
  preference
- **THEN** the outside clue digits are drawn
- **AND** each given tower is drawn as a tower solid

#### Scenario: 2D preference suppresses the tower solids

- **WHEN** the same board is rendered with the appearance preference set to 2D
- **THEN** given towers are drawn as centred digits with no tower polygons

### Requirement: Towers exposes appearance and pencil-highlight preferences

The game SHALL expose, via the `prefs` hook, an "appearance" choice (2D / 3D,
default 3D) and a "keep mouse highlight after changing a pencil mark" boolean
(default off), each stored on the `Ui` and applied by `interpretMove`/`redraw`.

#### Scenario: Appearance preference drives rendering style

- **WHEN** the appearance preference is changed between 3D and 2D
- **THEN** subsequent frames render in the selected style

### Requirement: Towers checks for mistakes against the unique solution

The game SHALL implement `findMistakes`: it re-solves the board from its
immutable clues and givens to the unique solution and returns every
player-entered grid cell whose tower height contradicts that solution. Pencil
marks SHALL never be reported as mistakes. When the board is not uniquely
solvable from the givens, `findMistakes` SHALL return an empty result.

#### Scenario: A wrong tower is flagged, pencil marks are not

- **WHEN** the player enters a tower height that contradicts the unique solution
- **THEN** `findMistakes` includes that cell
- **AND** a cell carrying only pencil marks is never included

