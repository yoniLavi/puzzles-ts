# range Specification

## Purpose
TBD - created by archiving change add-range-ts-port. Update Purpose after archive.
## Requirements
### Requirement: Range game implements the Game interface

The engine SHALL provide a registered `range` game implementing
`Game<RangeParams, RangeState, RangeMove, RangeUi, RangeDrawState>`: the
Nikoli puzzle Kurodoko / Kuromasu, in which the player paints some white
squares black so that no two black squares are orthogonally adjacent, all
white squares stay connected, and every numbered clue equals the number of
white squares visible from it in a straight line (itself counted once,
`h + v - 1`). Params SHALL be `w` and `h`, encoded `{w}x{h}`. The 4 upstream
presets — 9×6, 12×8, 13×9, 16×11 — SHALL be offered. `validateParams` SHALL
reject non-positive dimensions, a `w + h` that overflows the cell encoding,
and (when `full`) the degenerate 1×1, 1×2, 2×1, and 2×2 grids that admit no
good puzzle. The game SHALL report `wantsStatusbar = false`,
`isTimed = false`, `canSolve = true`, and `canFormatAsText = true`.

#### Scenario: Params round-trip

- **WHEN** params `{ w: 13, h: 9 }` are encoded
- **THEN** the result is `13x9`
- **AND** decoding `13x9` round-trips the params
- **AND** decoding the bare `12` yields `{ w: 12, h: 12 }`

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is called with full generation on a 2×2 grid, or
  with a non-positive dimension
- **THEN** it returns a non-null error string

### Requirement: Range descriptions are run-length clue grids

The desc SHALL encode the board in scan order: the decimal digits of each
clue, a letter `a`-`z` for each run of 1-26 blank (non-clue) cells, and `_`
as an explicit separator where two clues or a clue and a run would otherwise
merge, exactly as upstream. `validateDesc` SHALL reject any other character,
any clue outside `1 .. w + h - 1`, and any desc whose decoded cell count
differs from `w * h`. `newState` SHALL parse the desc into the grid with clue
cells holding their value and every other cell `EMPTY`, `hasCheated` and
`wasSolved` both false.

#### Scenario: A description round-trips

- **WHEN** a generated desc is parsed by `newState` and the clue grid is
  re-encoded
- **THEN** the re-encoded desc equals the original

#### Scenario: A malformed description is rejected

- **WHEN** `validateDesc` is given a desc with an invalid character, an
  out-of-range clue, or a decoded length mismatching the params
- **THEN** it returns a non-null error string

### Requirement: Range generates uniquely solvable symmetric boards

`newDesc` SHALL generate a board by painting up to `n / 3` randomly chosen
squares black (skipping any that would touch an existing black square or
disconnect the white region), computing every white square's clue from its
horizontal and vertical white runs, then removing clues — all clues
rotationally symmetric to a black square, then rotationally symmetric pairs
in random order — keeping only removals that leave the board solvable
**without** recursion, retrying the whole generation when the symmetric
removals cannot all be made. Every generated board SHALL be uniquely solvable
by the deductive solver without recursion, contain at least one black square,
and have two-way rotationally symmetric clues.

#### Scenario: Generated boards are valid and solvable

- **WHEN** `newDesc` runs for a seeded RNG across all four presets
- **THEN** every desc passes `validateDesc`
- **AND** the deductive solver (without recursion) solves every resulting
  board from its visible clues alone to a state with no errors

### Requirement: Range solves boards with four deductive rules plus recursion

The solver SHALL reach a unique solution by repeatedly applying, to a
fixpoint: (1) a cell adjacent to a black cell is white; (2) a clue whose
visible white run in three directions is fixed forces the remaining count
into the fourth direction, and a cell whose inclusion would exceed the clue
is black; (3) a square whose painting black would disconnect the white region
(a cut vertex of the white graph) is white; and only when those stall, (4)
recursion — try a cell both colours and force the surviving colour when one
leads to a contradiction. `solve` SHALL run the full solver (including
recursion) from the initial clues and return the completing sequence of
cell-sets, or an error when the board contains a contradiction.

#### Scenario: The adjacency rule whitens a neighbour

- **WHEN** the solver runs on a grid with a black cell beside an empty cell
- **THEN** that empty cell is set white

#### Scenario: Solve completes a generated board

- **WHEN** the Solve command runs on a generated board
- **THEN** it returns a move whose cell-sets paint every undecided cell, after
  which `status` returns `"solved"` and `findErrors` reports no error

### Requirement: Range marks cells via three-state cycling moves

A `RangeMove` SHALL be a list of cell-sets (each painting a cell black, white,
or empty) plus an optional solve flag (upstream's `S`, marking the state
cheated and solved). `executeMove` SHALL be pure, throw on an out-of-bounds or
clue-cell target, and — unless the solve flag is set — recompute `wasSolved`
as the absence of errors after applying the sets. Left-button / select on a
non-clue cell SHALL cycle empty → black → white → empty; right-button /
select2 SHALL cycle empty → white → black → empty; a clue cell SHALL be
inert. A keyboard cursor SHALL move within the grid, and shift + a cursor
direction SHALL place a white dot on the vacated and/or entered empty cells.

#### Scenario: Left and right cycle in opposite directions

- **WHEN** an empty non-clue cell receives a left-button action, then another,
  then another
- **THEN** it passes black → white → empty
- **AND** the same cell under three right-button actions passes white → black
  → empty

#### Scenario: Clue cells reject marking

- **WHEN** a marking action targets a cell holding a clue
- **THEN** `interpretMove` returns `null` and the cell is unchanged

#### Scenario: Completing the board is detected

- **WHEN** a move paints the final black square of the unique solution
- **THEN** `findErrors` reports no error, `wasSolved` becomes true, `status`
  returns `"solved"`, and a flash plays

### Requirement: Range highlights errors live and checks mistakes against the solution

`redraw` SHALL highlight, in the error colour, every cell currently violating
a rule — a black cell orthogonally adjacent to another black cell, a clue
whose visible white run cannot equal its number, or a white cell cut off from
the main white component — recomputed each frame from `findErrors`, matching
upstream's live error display. Separately, `findMistakes` SHALL re-solve the
puzzle from its initial clues and return every player-marked non-clue cell
whose mark contradicts the unique solution (black where the solution is white,
or white-dotted where the solution is black), returning none when the marks
are consistent or undecided.

#### Scenario: A black-adjacency violation reddens live

- **WHEN** two orthogonally adjacent cells are both painted black
- **THEN** `redraw` draws both in the error colour without any explicit check
  action

#### Scenario: findMistakes flags a wrong black

- **WHEN** the player paints black a cell that is white in the unique solution
  and Check & Save runs
- **THEN** `findMistakes` returns that cell
- **AND** a board whose marks all agree with the solution returns no mistakes

### Requirement: Range provides an explained deduction hint

The `range` game SHALL implement `hint(state)` returning a plan-carrying,
narrated hint that explains *why* each move is forced (the fork's hint quality
bar), and `hintKeepTrack` so the plan auto-advances as the player follows it.
The hint SHALL refuse (a `{ ok: false }` result) when the board is already
solved or when `findMistakes(state)` is non-empty, since a deduction seeded
from contradictory marks would mislead. Otherwise it SHALL deduce, from the
player's current marks, the ordered sequence of forced cells (the remaining
no-recursion solution) and return one narrated `HintStep` per forced cell.
Each step's narration SHALL state the deduction that forces the cell — the
adjacent black square (a neighbour of a black must be white), a clue already
satisfied (its run must stop, so the next cell is black), a clue that would be
overrun (the cell must be black), a clue that can only reach its count one way
(the cell must be white), or a cut-vertex of the white region (it must be
white to keep the white cells connected). `hintKeepTrack` SHALL report
`"completed"` when the player's move sets the hinted cell to the hinted value
and `"off"` otherwise. `redraw` SHALL render the displayed step: the target
cell highlighted in the hint colour with a preview of the forced mark, and the
deduction's **evidence shaded as an area** in a lighter hint colour — the
clue's line of sight (satisfied/overrun), the run it must reach along (reach),
or the non-black cells a cut would isolate (connect) — so the shaded picture
the narration names is visible, not merely a single premise cell. A premise
that cannot take the area shade (an adjacent **black** square, which must stay
black) SHALL instead be **ringed** in the hint colour. The shaded area SHALL be
computed against the board state as each step's deduction fires (the prior
steps applied), so the run grows as the player follows the plan, and SHALL
never include the target cell itself.

Independently of hints, `redraw` SHALL render a **known-white cell — a clue or
a player white mark — with a distinct white fill** (clues are implicitly
white), leaving only undecided cells the neutral background, so a beginner
reads determined state at a glance. The white is derived from the
background-shifting palette helper so it stays distinguishable from the
background.

#### Scenario: Hint explains the next forced move

- **WHEN** `hint` is called on an unsolved, mistake-free generated board
- **THEN** it returns `{ ok: true }` with a non-empty list of steps
- **AND** the first step's move is a legal `executeMove` whose narration names
  the deduction (adjacency / clue / connectedness) that forces its cell
- **AND** applying every step's move in order solves the board

#### Scenario: Every hint step shows visible evidence

- **WHEN** `hint` returns a plan for a generated board
- **THEN** every step carries either a non-empty shaded area or a ringed black
  premise cell — never a bare conclusion — and no step's area contains its own
  target cell

#### Scenario: Hint refuses on a solved or mistaken board

- **WHEN** `hint` is called on a solved board, or on a board where the player
  has marked a cell contradicting the unique solution
- **THEN** it returns `{ ok: false }` with an explanatory error

#### Scenario: Following the hint advances the plan

- **WHEN** the player makes the move the current hint step describes
- **THEN** `hintKeepTrack` returns `"completed"`
- **AND** a move that sets a different cell, or the hinted cell to a different
  value, returns `"off"`

### Requirement: Range hint colour legend

When a Range hint is displayed, `redraw` SHALL distinguish the element types the
deduction names using a stable colour legend, each colour paired with a
non-colour cue:

- The **forced cell** (the move) SHALL be filled `COL_HINT`, with the forced mark
  previewed as a shape — an inset black square for a forced black, a dot for a
  forced white.
- **Undecided premise cells** the deduction reasons over (a clue's line of sight,
  a reach run, the cells a cut would disconnect) SHALL be shaded `COL_HINT_CELL`.
- A cited **decided black square** premise (the adjacent black in an `adjacency`
  deduction) SHALL be ringed `COL_HINT_BLACKREF`, not `COL_HINT` — so a deduction
  that names both a shaded black premise and the forced cell does not draw them
  in the same colour. The cell stays black underneath; the teal ring is
  reinforcement.

The legend SHALL be consistent across deductions. The `RangeHint` payload
(`target`/`area`/`blackRefs`) and the narration text are unchanged; the legend is
a render concern.

#### Scenario: A cited black square rings distinct from the forced cell

- **WHEN** an `adjacency` hint is displayed (a black square forces an adjacent
  cell white)
- **THEN** the cited black premise is ringed `COL_HINT_BLACKREF` and the forced
  cell is filled `COL_HINT`, in different colours

#### Scenario: Undecided premises stay shaded

- **WHEN** a `satisfied`, `overrun`, `reach`, or `connect` hint cites a clue's
  visible white cells or the cells a cut would disconnect
- **THEN** those undecided premise cells are shaded `COL_HINT_CELL`, distinct
  from both the target and any cited black square

