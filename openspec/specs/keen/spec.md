# keen Specification

## Purpose
TBD - created by archiving change add-keen-ts-port. Update Purpose after archive.
## Requirements
### Requirement: Keen game implements the Game interface

The engine SHALL provide a registered `keen` game implementing
`Game<KeenParams, KeenState, KeenMove, KeenUi, KeenDrawState, KeenMistake>`: a
Latin-square puzzle ("KenKen" / "Inshi No Heya") on a `w × w` grid in which the
player places a digit `1..w` in every cell so each row and column contains every
digit exactly once, subject to **arithmetic cage clues** — the grid is
partitioned into contiguous blocks, each labelled with a target value and an
operation (`+`, `−`, `×`, `÷`) that the block's digits must satisfy, where
subtraction and division cages always have area 2. Params SHALL be `w`, `diff`
(Easy, Normal, Hard, Extreme, or Unreasonable), and `multiplicationOnly`,
encoded `{w}` without `full` and `{w}d{c}{m?}` with `full` (`c` =
`e`/`n`/`h`/`x`/`u`; a trailing `m` for multiplication-only), with the upstream
preset list. `validateParams` SHALL require `3 ≤ w ≤ 9` and a known difficulty.
The game SHALL report `wantsStatusbar = false`, `isTimed = false`,
`canSolve = true`, `canFormatAsText = false`, and `canMarkAll = true`.

#### Scenario: Params round-trip

- **WHEN** params `{ w: 6, diff: "hard", multiplicationOnly: false }` are encoded
  with `full = true`
- **THEN** the result is `6dh`
- **AND** decoding it round-trips the params
- **AND** encoding with `full = false` yields `6`
- **AND** a multiplication-only puzzle's full encoding ends with `m`

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is called with `w < 3`, `w > 9`, or an unknown
  difficulty
- **THEN** it returns a non-null error string

### Requirement: Keen descriptions encode the block structure and cage clues

The desc SHALL consist of the **block structure** followed by a comma and the
**clue list**. The block structure SHALL encode the pattern of internal dividing
lines as run-lengths of non-edges over the `2·w·(w−1)` internal grid lines
(vertical lines in reading order, then horizontal lines in transposed order),
using `_` for a run of 0, `a`–`y` for 1–25, and `z` for "25 non-edges and no
following edge", with a compression pass that may replace a run of the same
letter with that letter plus a decimal repeat count. The clue list SHALL give,
for each cage in minimal-cell order, an operation tag (`a` add, `s` subtract, `m`
multiply, `d` divide) followed by the decimal target value. `validateDesc` SHALL
reject a malformed block structure, the wrong number of clues, an unrecognised
clue tag, and a subtraction or division clue on a cage whose area is not 2.
`newState` SHALL rebuild the cage partition (a disjoint-set structure) and the
per-cage clue, with every cell starting blank (Keen has no givens).

#### Scenario: Description round-trips through generate and decode

- **WHEN** a board is generated and its desc decoded by `newState`
- **THEN** the cage partition and per-cage clues match what was encoded
- **AND** every cell starts empty with no pencil marks

#### Scenario: Malformed description is rejected

- **WHEN** `validateDesc` receives a malformed block structure, too few or too
  many clues, or a subtraction/division clue on a non-domino cage
- **THEN** it returns a non-null error string

### Requirement: Keen generates uniquely-solvable boards at the requested difficulty

`newDesc` SHALL generate a full Latin square as the solution, partition it into
cages (random dominoes plus folded singletons, every cage of area `≤ 6`), assign
a balanced mix of cage operations and values avoiding low-quality clues, and
accept the board only when the graded solver solves it at **exactly** the
requested difficulty (solvable at `diff` but not at `diff − 1`), regenerating
otherwise; a 3×3 puzzle requested above Normal SHALL be dialled down to Normal.
Generation SHALL be RNG-faithful to upstream over the bit-identical `random.ts`,
so the emitted desc matches the C reference byte-for-byte for the same seed. The
generator SHALL carry a capped-iteration backstop that throws rather than
hanging.

#### Scenario: Generated board is uniquely solvable at its difficulty

- **WHEN** a board is generated for given params
- **THEN** the solver solves it uniquely at the requested difficulty
- **AND** the solver fails to solve it at one difficulty level lower (for
  difficulties above Easy)
- **AND** every cage has area between 1 and 6, and every subtraction/division
  cage has area 2

#### Scenario: Generated desc matches the C reference byte-for-byte

- **WHEN** a board is generated from a fixed seed and params matching a frozen C
  trace fixture
- **THEN** the emitted desc equals the recorded C desc exactly
- **AND** the TS solver grades the board at the C-recorded difficulty

### Requirement: Keen solves cages with the shared Latin-square framework

The solver SHALL ride on the shared generic `latin_solver` framework, supplying
Keen's cage deductions as user-solvers and a validator. The cage deductions SHALL
enumerate, for each cage, the digit layouts consistent with the current candidate
cube and the cage's operation/value (subtraction and division cages by their two
ordered digit pairs; addition and multiplication cages by combination
enumeration), and prune the candidate cube accordingly — at Easy by amalgamating
all values, at Normal by per-square value bitmaps, and at Hard by the cross-cage
"a digit required in this row/column" intersection. The validator SHALL accept a
completed grid only when every cage's digits satisfy its clue. `solveKeen(w,
clues, soln, maxdiff)` SHALL map Easy→simple, Hard→set, Extreme→set+forcing, and
Unreasonable→recursion, and return the difficulty reached or an
impossible/ambiguous/unfinished sentinel.

#### Scenario: Solver grades a known board

- **WHEN** `solveKeen` is run on a generated board at its difficulty
- **THEN** it returns that difficulty and fills the grid with the unique solution

#### Scenario: Solver detects an inconsistent board

- **WHEN** `solveKeen` is run on a board with no solution
- **THEN** it returns the impossible sentinel

### Requirement: Keen interprets digit, pencil, and mark-all input

`interpretMove` SHALL support: a left-click / cursor-select that highlights a cell
for a real entry; a right-click / select2 that highlights an empty cell for a
pencil mark (and, in sticky pencil mode, toggles a persistent pencil mode); a
digit key `1..w` that enters that digit (or toggles that pencil mark) in the
highlighted cell; backspace / space that clears it; keyboard cursor movement;
and the `M`/`m` key that fills every empty cell with all candidate pencil marks.
Entering a digit that equals the cell's current contents (with no pencil marks)
SHALL be a no-op (hiding the mouse highlight). With auto-pencil enabled, a real
placement SHALL additionally strike that digit from the pencil marks of every
other cell in its row and column. `executeMove` SHALL return a new state and
never mutate its input; a placement that completes the grid with no errors SHALL
mark the state completed.

#### Scenario: Placing and pencilling digits

- **WHEN** a cell is highlighted and a digit key is pressed
- **THEN** `interpretMove` yields a `set` move that places (or, in pencil mode,
  toggles the pencil mark of) that digit
- **AND** `executeMove` applies it to a new state without mutating the old one

#### Scenario: Mark-all fills pencil candidates

- **WHEN** the `M` key is pressed
- **THEN** `interpretMove` yields a `pencilAll` move
- **AND** `executeMove` fills every empty cell with all candidate pencil marks

### Requirement: Keen renders cages, digits, pencil marks, and overlays

`redraw` SHALL draw the grid with thick cage boundaries (adjacent same-cage cells
visually merged), each cage's clue (target value plus operation symbol, the
symbol omitted for area-1 cages and for multiplication-only puzzles) at the
cage's minimal cell, the placed digit or an auto-sized grid of pencil marks per
cell, the cursor and pencil-mode highlights, live rule-violation errors (a cage
whose filled digits violate its clue, and duplicate digits in a row or column),
the Check & Save mistake overlay, and a completion flash. A CapsLock-style
pencil-mode indicator SHALL be shown while persistent pencil mode is on. The
palette SHALL be index-for-index with the upstream colour enum. Rendering SHALL
use a per-tile diff cache, with every overlay that is not part of the tile value
(the mistake overlay) included in the diff key so it repaints on an
already-drawn cell.

#### Scenario: Cage clue and digit are drawn

- **WHEN** a board is rendered to a recording drawing
- **THEN** the cage clue text appears at each cage's minimal cell
- **AND** a placed digit is drawn centred in its cell

#### Scenario: Mistake overlay repaints on an already-drawn cell

- **WHEN** a cell is drawn, then `findMistakes` flags it, then the board is
  redrawn against the same draw state
- **THEN** the mistake highlight is painted on the second redraw

### Requirement: Keen flags mistakes against its unique solution

The game SHALL implement `findMistakes`: re-solve from the cage clue structure to
the unique solution (deriving it from the clues only, never the player's notes)
and return every player cell that contradicts it — a filled cell whose digit is
wrong (`"cell"`), and an empty cell whose non-empty pencil notes have crossed out
its solution digit (`"note"`). When the board is not uniquely solvable from the
clues the result SHALL be empty. This drives the shell's Check & Save control,
which hard-blocks a quick-save while any mistake exists.

#### Scenario: A wrong digit and a wrong note are flagged

- **WHEN** the player fills a cell with a digit other than its solution value, or
  pencils out the solution digit in an empty cell
- **THEN** `findMistakes` includes that cell
- **AND** a cell whose notes merely carry extra (non-solution) candidates is not
  flagged

### Requirement: Keen exposes pencil-mark preferences

The game SHALL expose, via the `prefs` hook, a sticky-pencil-mode preference
(default on; right-click toggles a persistent pencil mode), an auto-pencil
preference (default on; placing a digit strikes it from the pencil marks of its
row and column), and a keep-mouse-highlight-after-pencil preference (default
off, matching upstream `PREF_PENCIL_KEEP_HIGHLIGHT`). Preference values SHALL
live on the `Ui` and be set as defaults by `newUi`.

#### Scenario: Sticky pencil mode is exposed and defaults on

- **WHEN** the game's preferences are read
- **THEN** they include a sticky-pencil-mode boolean defaulting to on
- **AND** an auto-pencil boolean defaulting to on
- **AND** a keep-highlight boolean defaulting to off

