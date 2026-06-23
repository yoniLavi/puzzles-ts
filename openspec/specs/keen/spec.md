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

### Requirement: Keen provides an explained deduction hint

The game SHALL implement `hint(state, aux?, ui?)`, returning a plan of
`HintStep`s that teaches the player the next deduction in pencil-notes terms,
working in a sound candidate cube **seeded from the placed entries only — never
from the player's pencil notes** (a note can be wrong; that is what `findMistakes`
flags). The plan is built by walking a working copy of the board the way a person
solves it, preferring at each step:

1. a **naked single** — an empty cell whose live notes have collapsed to a single
   candidate (sound on a mistake-free board, since that candidate is then the
   solution) — placed via a `set` move; else
2. (after a lazy **populate** step that fills every empty cell's candidate notes
   via the existing fill-all `pencilAll` move, emitted only when some empty cell
   lacks notes) the **basic Latin** row/column eliminations a placed value implies,
   struck via `pencilStrike`; else
3. the next **cage elimination** — the per-cage arithmetic deduction (no layout of
   the cage's digits consistent with its clue leaves a candidate possible in a
   cage cell; or, at the harder level, a digit required in the cage along a
   row/column ruled out elsewhere in that line) — a single technique *firing*
   striking the candidate(s) it rules out, via one or more `pencilStrike` moves
   linked as one journey; else
4. a forced **placement** — either a **naked single** (the cell's own candidates
   have collapsed to one) or a **hidden single** (a digit that fits only one cell of
   a row or column, the cell itself still showing several candidates), narrated and
   highlighted by *which* it is (the recorded reason conflates them, so the *why* is
   re-derived from the working board): a naked single concludes "every other number
   has been ruled out in this cell", a hidden single names its line ("in this
   row/column, N can go in only this cell") and shades the whole line as evidence.

Each step SHALL carry a narration meeting the hint quality bar — leading with the
spotted indication (the cage, named by its arithmetic clue), then the reasoning,
then a necessity-voice conclusion ("must cross out the N" for an elimination, "can
only be N" for a placement). A single cage firing forcing several strikes SHALL be
one journey (continuation legs flagged `continuesPrevious`), and equivalent strikes
of one firing SHALL share the target hint colour.

The trivial row/column eliminations a placement implies SHALL be governed by the
auto-pencil preference (read from `ui`): with it on they are folded silently into
the placement; with it off they are taught as explicit `continuesPrevious` strike
continuations.

The hint SHALL refuse (`{ ok: false, error }`) when the board is solved or when
`findMistakes` is non-empty, and refusal SHALL light the mistake overlay through
the engine's refusal→`findMistakes` coupling. The deduction SHALL be capped below
recursion (a guess is not a teachable note strike).

Every step SHALL be monotone progress (a note added by populate, a note removed by
a strike, or a cell filled by a placement — never undone by the hint), so a
freshly-recomputed hint from any solvable, mistake-free mid-game position SHALL
make progress and lead to a solved board (the cross-game resume guarantee); on
recompute the plan SHALL skip any operation already reflected on the board.
`hintKeepTrack` SHALL advance the plan when the player's move matches the displayed
step's intent — a `pencilStrike` clearing a subset of the step's marks is
`onTrack` (the step shrinks in place) or `completed`; a placement of the hinted
value is `completed` — otherwise drop the plan (`off`). `refreshHintStep` SHALL
drop a stored step's dead marks (or resolve the step) before each (re-)display so a
kept plan never tells the player to remove a candidate already gone.

The solver's recording mode SHALL be gated so that with recording off the
generator/solve path is byte-for-byte unchanged (verified by the existing C
differential), and one recorded deduction *firing* (one cage's candidate pruning,
or one digit-out-of-one-line cross-cage elimination) SHALL map to exactly one
`group` so a hint step never mixes cages.

#### Scenario: A cage elimination is taught as a note strike

- **WHEN** the player asks for a hint on a fully-pencilled board where a cage's
  arithmetic clue rules a digit out of one of its cells
- **THEN** the hint returns a step whose `pencilStrike` move clears exactly those
  candidates
- **AND** the narration names the cage by its clue (its target value and
  operation) and concludes in the necessity voice
- **AND** the cage's cells are shaded and the struck candidates marked in the hint
  colour

#### Scenario: A hidden single is named by its line, not by the cell

- **WHEN** the hint forces a placement into a cell that still shows several
  candidates, because the placed digit fits nowhere else in its row (or column)
- **THEN** the narration names the line ("in this row, N can go in only this cell")
  rather than claiming every number is ruled out in the cell
- **AND** the whole row (or column) is shaded as evidence, with the cell marked as
  the placement target

#### Scenario: An empty board is populated before elimination

- **WHEN** the player asks for a hint on a board with no pencil notes
- **THEN** the first elimination is preceded by the fill-all populate step

#### Scenario: The hint resumes from a self-played mid-game position

- **WHEN** a hint is requested from a solvable, mistake-free board the player
  reached by their own notes and placements
- **THEN** the freshly-recomputed hint makes progress and, applied step by step
  with recompute, leads to a solved board

#### Scenario: The hint refuses on a board with mistakes

- **WHEN** a hint is requested while `findMistakes` is non-empty
- **THEN** the hint refuses and the engine lights the mistake overlay

