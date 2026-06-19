# singles Specification

## Purpose
TBD - created by archiving change add-singles-ts-port. Update Purpose after archive.
## Requirements
### Requirement: Singles game implements the Game interface

The engine SHALL provide a registered `singles` game implementing
`Game<SinglesParams, SinglesState, SinglesMove, SinglesUi, SinglesDrawState,
SinglesMistake>`: the Nikoli puzzle Hitori on a `w × h` grid of numbers, in
which the player blackens cells so that no number repeats among the remaining
(white) cells of any row or column, no two black cells are orthogonally
adjacent, and the white cells form one orthogonally-connected region. Params
SHALL be `w`, `h`, and `diff` (Easy or Tricky), encoded `{w}x{h}d{c}` when full
(`c` = `e`/`k`) and `{w}x{h}` otherwise, with presets at 5×5, 6×6, 8×8, 10×10,
and 12×12 in both Easy and Tricky. `validateParams` SHALL require `w ≥ 2`,
`h ≥ 2`, both `≤ 62`, and (when full) a known difficulty. The game SHALL report
`wantsStatusbar = false`, `isTimed = false`, `canSolve = true`, and
`canFormatAsText = true`.

#### Scenario: Params round-trip

- **WHEN** params `{ w: 8, h: 8, diff: "tricky" }` are encoded with `full = true`
- **THEN** the result is `8x8dk`
- **AND** decoding it round-trips the params
- **AND** encoding with `full = false` yields `8x8`

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is called with `w < 2` or `h < 2`
- **THEN** it returns a non-null error string

### Requirement: Singles descriptions are fixed-length number grids

The desc SHALL encode the board's numbers in scan order, one character per cell:
digits `0`–`9` for `0`–`9`, letters `a`–`z` for `10`–`35`, `A`–`Z` for `36`–`61`.
`validateDesc` SHALL require the desc length to equal `w·h` exactly and every
decoded number to lie in `1..max(w,h)`. `newState` SHALL decode the desc into an
immutable `nums` grid with all flags blank.

#### Scenario: Description decodes to the number grid

- **WHEN** a valid desc for a `w × h` board is decoded by `newState`
- **THEN** each cell holds its decoded number
- **AND** every cell starts neither black nor circled

#### Scenario: Wrong-length description is rejected

- **WHEN** `validateDesc` is given a desc whose length is not `w·h`
- **THEN** it returns a non-null error string

### Requirement: Singles toggle moves and cursor

`interpretMove` SHALL map a left-click / `CURSOR_SELECT` on a grid cell to a move
that toggles the cell black (clearing it to empty if it was already black or
circled), and a right-click / `CURSOR_SELECT2` to a move that toggles the cell
circled (clearing it to empty if already set). A click outside the grid SHALL
toggle the show-black-numbers preference (a `UI_UPDATE`). Keyboard cursor moves
SHALL move the cursor and SHALL return a `UI_UPDATE` (revealing the cursor on the
first arrow press) rather than a history move. `executeMove` SHALL clear both the
black and circle bits on each targeted cell before applying the new value, and
SHALL set the board completed when `checkComplete` reports no errors.

#### Scenario: Left-click cycles a cell through black and back to empty

- **WHEN** the player left-clicks an empty cell, then left-clicks it again
- **THEN** the first move marks it black
- **AND** the second move clears it to empty

#### Scenario: Completion is detected

- **WHEN** the player reaches a configuration with no repeated white numbers in
  any row or column, no adjacent blacks, and a single white region
- **THEN** `status` reports the game solved

### Requirement: Singles deductive solver

The game SHALL provide a deductive solver reproducing the upstream techniques:
the auto-cascade (a black forces its neighbours white; a circled cell forces
same-numbered cells in its row/column black), `singlesep`, `doubles`, `corners`,
`offsetpair` (Tricky and above), `allblackbutone`, and `removesplits` (Tricky
and above). It SHALL detect impossibility (e.g. a white cell with no white
escape, or a contradiction in the cascade). `solve` SHALL attempt to solve the
current state and then the initial state, returning the move that completes the
board or an error when neither can be solved, and SHALL mark the state as
solved-with-help.

#### Scenario: Solver completes a generated board

- **WHEN** a board generated at a given difficulty is solved by the solver from
  its initial numbers
- **THEN** the solver fully determines every cell (black or white) with no errors

#### Scenario: Solve reports failure on an unsolvable position

- **WHEN** `solve` is called on a board the solver cannot complete
- **THEN** it returns a non-null error and applies no move

### Requirement: Singles generator produces unique, difficulty-graded boards

`newDesc` SHALL generate a board by constructing a Latin rectangle, adding black
squares at random with solver assistance (forced whites laid between
placements), and assigning numbers under the black squares so the solution stays
unique. It SHALL accept the board only when it is solvable at the requested
difficulty and *not* solvable one difficulty level below (with the sneaky
generation-artefact deduction enabled), regenerating otherwise. Difficulty SHALL
downgrade to Easy when `min(w, h) < 4`. The generation SHALL be RNG-faithful to
upstream so that, over the bit-identical `random.ts`, the produced desc matches
the C reference byte-for-byte for the same seed.

#### Scenario: Generated boards are uniquely solvable at their difficulty

- **WHEN** a board is generated at difficulty D
- **THEN** the solver solves it at D
- **AND** (for Tricky) the solver fails to solve it at the level below D even
  with the sneaky deduction

#### Scenario: Desc matches the C reference byte-for-byte

- **WHEN** `newDesc` runs for a seed and params recorded from the C build
- **THEN** the produced desc equals the recorded C desc exactly

### Requirement: Singles rendering

`redraw` SHALL draw a grid-outlined tile per cell: black (or red on error) fill
for a blackened cell, otherwise the background (or lowlight during the
completion flash); a circle ring for a circled (white-marked) cell; the cell's
number always for a white cell and, when the show-black-numbers preference is
on, also for a black cell; cursor corners on the cursor cell; and a red grid
outline when the board is in an impossible state. The palette SHALL be ordered
index-for-index with the upstream colour enum. A genuine completion (not a
solved-with-help) SHALL trigger the completion flash.

#### Scenario: A blackened cell renders black with no number by default

- **WHEN** a cell is blackened and the show-black-numbers preference is off
- **THEN** the tile is filled with the black colour and no number is drawn

#### Scenario: An erroneous cell renders in the error colour

- **WHEN** `checkComplete` flags a cell as an error
- **THEN** that cell is drawn in the error colour

### Requirement: Singles show-black-numbers preference

The game SHALL expose a single boolean preference, "Show numbers on black
squares" (keyword `show-black-nums`), via the engine `prefs` hook, stored on the
`Ui` and read by `redraw`. It SHALL default to off.

#### Scenario: Preference toggles numbers on black squares

- **WHEN** the show-black-numbers preference is turned on
- **THEN** subsequent redraws draw each black cell's number

### Requirement: Singles mistake-checking

The game SHALL implement `findMistakes(state)`: re-solve the board from its
immutable numbers to the unique solution and return every player cell whose
black/white choice contradicts that solution (a cell marked black where the
solution is white, or circled where the solution is black). Undecided cells SHALL
never be reported. It SHALL return an empty result when the board is consistent
with the unique solution, so the shell's Check & Save control hard-blocks a save
only on a genuine mistake.

#### Scenario: A wrong black is flagged

- **WHEN** the player blackens a cell that the unique solution leaves white
- **THEN** `findMistakes` includes that cell

#### Scenario: A correct partial board reports no mistakes

- **WHEN** every black/circle the player has placed agrees with the unique
  solution
- **THEN** `findMistakes` returns an empty result

### Requirement: Singles provides an explained deduction hint

The `singles` game SHALL implement `hint(state)` returning a plan-carrying,
narrated hint that explains *why* each move is forced (the fork's hint quality
bar), and `hintKeepTrack` so the plan auto-advances as the player follows it.
The hint SHALL refuse (a `{ ok: false }` result) when the board is already
solved or when `findMistakes(state)` is non-empty, since a deduction seeded from
contradictory marks would mislead. Otherwise it SHALL run the deductive solver
from the player's current marks, recording each forced cell in deduction order
with the deduction that forces it, and return the ordered sequence of narrated
`HintStep`s (the remaining solution).

Each step's narration SHALL state the deduction that forces the cell: two equal
numbers one cell apart forcing the middle white; an adjacent equal pair
blackening the other copies in its line; a 2×2 board-corner argument
(four/three/two matching numbers); an offset-pair pattern; a white cell with a
single non-black neighbour forcing that neighbour white; a square whose
shading would split the white region forcing it white; a cell adjacent to a
shaded square forcing it white; or a number sharing a line with a circled white
forcing it shaded. A single deduction that forces **two cells at once** (the
four-in-a-corner pair, an offset-pair's two whites) SHALL be emitted as **one**
multi-cell `HintStep`, not two.

`redraw` SHALL render the displayed step: the target cell(s) highlighted in the
hint colour with a preview of the forced mark (a shaded inset to blacken, a ring
to keep white), and the deduction's **evidence** rendered so the narration's
premise is visible — **shaded** in a lighter hint colour where the evidence is
an undecided number cell (its digit drawing on top), and **ringed** in the hint
colour where the evidence is an already-decided cell whose black or circled
state is itself the reason (an adjacent shaded square; a circled white using up
a number). Every step SHALL carry visible evidence — a non-empty shaded area or
a ringed premise — never a bare conclusion.

Where a single deduction has premise cells in **distinct roles**, those roles
SHALL be rendered in distinct colours, so the highlight does not imply cells
share a role they do not. Specifically, a 2×2-corner deduction SHALL distinguish
the **matching pair** (the cells that share a number, shaded as evidence) from
the **protected corner** (the cell that would be sealed off, drawn in its own
distinct colour). The three roles (target, evidence, protected corner) SHALL be
mutually disjoint — no cell carries two roles. The corner deduction's narration
SHALL name the **actual numbers** involved (not generic "this square / its other
neighbour") and follow the proof-by-contradiction order it embodies — the
signal (the touching matching pair), the move being ruled out (shading the
target), its consequence (the corner's other neighbour forced shaded, the corner
boxed in), and the deduction (the target stays white) — e.g. "One of the two
touching 3s must be shaded. Shading this 5 would force the 3 beside the corner 4
shaded as well, leaving the corner boxed in on both sides — so the 5 stays
white."

`hintKeepTrack` SHALL report `"completed"` when the player's move sets exactly
the hinted cell(s) to the hinted value, `"onTrack"` (shrinking a multi-cell step
in place to the cells still outstanding) when the move fills a strict subset of a
multi-cell step's cells with the hinted value and nothing else, and `"off"`
otherwise.

#### Scenario: Hint explains the next forced move

- **WHEN** `hint` is called on an unsolved, mistake-free generated board
- **THEN** it returns `{ ok: true }` with a non-empty list of steps
- **AND** the first step's move is a legal `executeMove` whose narration names
  the deduction (sandwich / pair / corner / offset / connectivity / cascade)
  that forces its cell
- **AND** applying every step's move in order solves the board

#### Scenario: A two-cell firing is one step

- **WHEN** the deduction that fires forces two cells simultaneously (a 2×2
  corner with four matching numbers, or an offset-pair pattern)
- **THEN** the hint emits a single `HintStep` whose move sets both cells

#### Scenario: A corner deduction separates the corner from the matching pair

- **WHEN** a 2×2-corner deduction fires (e.g. a top-left 2×2 of `[[4,3],[5,3]]`,
  where the two 3s match and the 4 corner would be sealed off)
- **THEN** the matching pair is the shaded evidence, the corner is the distinct
  "protected corner" role in its own colour, and the forced cell is the target —
  the three roles disjoint
- **AND** the narration names the actual numbers and follows the contradiction
  arc (e.g. "One of the two touching 3s must be shaded. Shading this 5 … leaving
  the corner boxed in … — so the 5 stays white"), not the old "two corner squares"

#### Scenario: Every hint step shows visible evidence

- **WHEN** `hint` returns a plan for a generated board
- **THEN** every step carries either a non-empty shaded area or a ringed premise
  cell — never a bare conclusion

#### Scenario: Hint refuses on a solved or mistaken board

- **WHEN** `hint` is called on a solved board, or on a board where the player has
  marked a cell contradicting the unique solution
- **THEN** it returns `{ ok: false }` with an explanatory error

#### Scenario: Following the hint advances the plan

- **WHEN** the player makes the move the current hint step describes
- **THEN** `hintKeepTrack` returns `"completed"` (or `"onTrack"` when a
  multi-cell step is filled one cell at a time)
- **AND** a move that sets a different cell, or the hinted cell to a different
  value, returns `"off"`

### Requirement: Singles hint colour legend

When a Singles hint is displayed, `redraw` SHALL distinguish the element types
the deduction names using a stable colour legend, each colour paired with a
non-colour cue:

- The **forced cell(s)** (the move) SHALL be filled `COL_HINT` with no
  number/mark preview drawn.
- An **undecided number premise** (the matching numbers a deduction reasons
  over) SHALL be shaded `COL_HINT_CELL`, the cell's digit drawn on top.
- A cited **decided black ("shaded square") premise** SHALL be ringed
  `COL_HINT_BLACKREF`; a cited **decided white/circle ("ringed white square")
  premise** SHALL be ringed `COL_HINT_WHITEREF` — so a deduction that names both
  a shaded/marked premise and the forced cell does not draw them in the same
  colour. The ring colour SHALL be chosen from the cell's own decided state.
- The **protected corner** of a corner deduction SHALL remain `COL_HINT_STRAND`.

The legend SHALL be consistent across deductions (a shaded-square premise is the
same colour in every hint that cites one). The `SinglesHint` payload
(`targets`/`evidence`/`strand`) is unchanged; the legend is a render concern,
and the three highlight roles remain disjoint.

#### Scenario: A cited shaded square rings distinct from the forced cell

- **WHEN** an `adjBlack` hint is displayed (a shaded square forces an adjacent
  cell white)
- **THEN** the cited black premise is ringed `COL_HINT_BLACKREF` and the forced
  cell is filled `COL_HINT`, in different colours

#### Scenario: A cited ringed white square uses the white-reference colour

- **WHEN** a `sameLine` or `boxedIn` hint is displayed (a ringed white square is
  the reason)
- **THEN** the cited white/circle premise is ringed `COL_HINT_WHITEREF`

#### Scenario: Number premises and corners are unchanged

- **WHEN** a hint cites undecided matching numbers, or a corner deduction
  protects a corner
- **THEN** the numbers shade `COL_HINT_CELL` (digits on top) and the protected
  corner stays `COL_HINT_STRAND`, as before

