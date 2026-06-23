## ADDED Requirements

### Requirement: Unequal game implements the Game interface

The engine SHALL provide a registered `unequal` game implementing
`Game<UnequalParams, UnequalState, UnequalMove, UnequalUi, UnequalDrawState,
UnequalMistake>`: a Latin-square puzzle on an `order × order` grid in which the
player places a number `1..order` in every cell so each row and column contains
every number exactly once, subject to clues between orthogonally adjacent cells.
The game SHALL support two modes: **Unequal** (greater-than signs, `a > b`) and
**Adjacent** (a bar means the two numbers differ by exactly 1, and the absence of
a bar between two cells means they do not). Params SHALL be `order`, `mode`
(Unequal or Adjacent), and `diff` (Trivial, Easy, Tricky, Extreme, or
Recursive), encoded `{order}` with an `a` suffix for Adjacent mode and a
`d{c}` suffix for difficulty when full (`c` = `t`/`e`/`k`/`x`/`r`), with the
upstream preset list. `validateParams` SHALL require `3 ≤ order ≤ 32`, a known
difficulty, and `order ≥ 5` for Adjacent puzzles of Tricky difficulty or harder.
The game SHALL report `wantsStatusbar = false`, `isTimed = false`,
`canSolve = true`, `canFormatAsText = true`, and `canMarkAll = true`.

#### Scenario: Params round-trip

- **WHEN** params `{ order: 5, mode: "adjacent", diff: "tricky" }` are encoded
  with `full = true`
- **THEN** the result is `5adk`
- **AND** decoding it round-trips the params
- **AND** encoding with `full = false` yields `5a`

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is called with `order < 3`, an unknown difficulty, or
  an Adjacent puzzle below order 5 at Tricky or harder
- **THEN** it returns a non-null error string

### Requirement: Unequal descriptions encode per-cell numbers and adjacency flags

The desc SHALL encode the grid in scan order as comma-separated fields, each a
decimal number (`0` for a blank cell) followed by zero or more of the flag
letters `U`, `R`, `D`, `L` marking an adjacency clue toward the up, right, down,
or left neighbour. Runs of leading blank cells MAY be skipped with the letters
`a`–`z` (1–26 cells). `validateDesc` SHALL reject the wrong number of cells, a
number outside `0..order`, a flag pointing off the grid, and contradictory flags
(in Adjacent mode a clue toward a neighbour requires the reciprocal clue back; in
Unequal mode a `>` toward a neighbour forbids the reciprocal `>`). `newState`
SHALL decode the numbers into both an immutable givens array and the working
grid, and the flags into an immutable clue-flag array.

#### Scenario: Description round-trips through generate and decode

- **WHEN** a board is generated and its desc decoded by `newState`
- **THEN** every given number appears in both the immutable array and the grid
- **AND** every adjacency flag is placed at its decoded cell
- **AND** every non-given cell starts empty with no pencil marks

#### Scenario: Malformed description is rejected

- **WHEN** `validateDesc` receives a desc with the wrong number of cells or a
  flag that points off the grid
- **THEN** it returns a non-null error string

### Requirement: Unequal generates uniquely-solvable boards at the target difficulty

`newDesc` SHALL generate a full Latin square as the solution, then build a clue
set: in Unequal mode by greedily adding number and inequality clues until the
graded solver solves the board, then stripping redundant clues; in Adjacent mode
by seeding every adjacency flag implied by the solution and stripping redundant
numbers. It SHALL regenerate until the puzzle is solvable at the chosen
difficulty and not below it (falling back to an easier difficulty only after the
upstream retry cap). The result SHALL be uniquely solvable. `newDesc` SHALL also
return an `aux` solution string.

#### Scenario: Generated board is unique and correctly graded

- **WHEN** a board is generated at a difficulty `d` in either mode
- **THEN** the solver solves it at difficulty `d`
- **AND** the solved grid is a valid Latin square satisfying every clue

### Requirement: Unequal accepts digit, pencil, clue-spent, and solve moves

`interpretMove` SHALL select a cell by mouse (left button = real-entry highlight,
right button = pencil-mark highlight) or keyboard cursor. With a cell
highlighted, a digit `1..order` (entered as a digit, or a letter for `11`+ at
large orders) SHALL place that number (or toggle the pencil mark in pencil mode),
and backspace/space/0 SHALL clear it; entering a value a cell already holds SHALL
be a no-op. A click on a greater-than sign or adjacency bar in the gap between two
cells, or a shift/ctrl-cursor toward a neighbouring clue, SHALL toggle that clue's
struck-through ("spent") state. Immutable (given) cells SHALL reject entry. The
`M`/`m` key SHALL fill every empty cell with all candidate pencil marks.
`executeMove` SHALL apply the move purely, returning a new state, and SHALL set
`completed` when the filled grid satisfies every row/column and clue constraint.

#### Scenario: Entering the last correct number completes the board

- **WHEN** the player enters the final number that completes a correct grid
- **THEN** `executeMove` returns a state with `completed = true`

#### Scenario: Entry into an immutable cell is rejected

- **WHEN** `interpretMove` would enter a digit into a given cell
- **THEN** it returns `null` (no move)

#### Scenario: Clicking a clue toggles its spent state

- **WHEN** the player clicks a greater-than sign or adjacency bar
- **THEN** `executeMove` toggles that clue's spent flag

### Requirement: Unequal renders greater-than signs or adjacency bars between cells

`redraw` SHALL render the `order × order` grid with a gap between cells, drawing —
in Unequal mode — a greater-than sign in the gap pointing from the larger toward
the smaller cell of each inequality clue, and — in Adjacent mode — a bar in the
gap of each adjacency clue. Each clue SHALL be coloured to distinguish a normal
clue, a currently-violated clue (red), and a struck-through ("spent") clue.
Filled cells SHALL show their number (coloured to distinguish given, user-entered,
and error cells); empty cells SHALL show their pencil marks in an auto-sized grid
layout. The renderer SHALL highlight the selected cell (full highlight for real
entry, a corner wedge for pencil mode), draw a pencil-mode indicator while pencil
mode is active, draw the keyboard cursor, and flash on completion. Cells SHALL be
diffed against a per-tile cache that also accounts for the gap clues and the
mistake overlay.

#### Scenario: Unequal mode draws greater-than signs

- **WHEN** the initial frame of a generated Unequal-mode board is rendered
- **THEN** a greater-than polygon is drawn in the gap of each inequality clue

#### Scenario: Adjacent mode draws adjacency bars

- **WHEN** the initial frame of a generated Adjacent-mode board is rendered
- **THEN** an adjacency bar is drawn in the gap of each adjacency clue

### Requirement: Unequal exposes pencil-mark preferences

The game SHALL expose, via the `prefs` hook, a "sticky pencil mode" boolean
(default on — right-click toggles a persistent pencil mode), an "auto-pencil"
boolean (default on — placing a number strikes it from the pencil marks of its
row and column), and a "keep mouse highlight after changing a pencil mark"
boolean (default off), each stored on the `Ui` and applied by
`interpretMove`/`executeMove`.

#### Scenario: Sticky pencil mode persists across left-clicks

- **WHEN** sticky pencil mode is on and the player right-clicks to enter pencil
  mode, then left-clicks another empty cell
- **THEN** the new cell is highlighted for pencil entry (the mode is not reset)

### Requirement: Unequal checks for mistakes against the unique solution

The game SHALL implement `findMistakes`: it re-solves the board from its
immutable givens and clues to the unique solution and returns every
player-entered grid cell whose number contradicts that solution, plus every empty
cell whose non-empty pencil notes have crossed out that cell's solution value (a
note mistake). The solution SHALL be derived from the placed givens only, never
from the player's notes. When the board is not uniquely solvable from the givens,
`findMistakes` SHALL return an empty result.

#### Scenario: A wrong number is flagged, ordinary notes are not

- **WHEN** the player enters a number that contradicts the unique solution
- **THEN** `findMistakes` includes that cell
- **AND** a cell carrying notes that still include its solution value is never
  included
