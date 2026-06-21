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
immutable clues and givens to the unique solution — deriving that solution from
the placed givens/entries **only**, never from the player's pencil notes — and
returns every player marking that contradicts it, as two kinds:

- a **filled cell** (`kind: "cell"`) whose entered tower height differs from the
  solution height; and
- a **pencil-note cell** (`kind: "note"`) whose **non-empty** candidate set does
  **not** contain that cell's solution height — i.e. the player has crossed out
  the correct height.

A note set that merely contains extra, non-solution candidates SHALL NOT be
reported (that is ordinary mid-solve state); only a non-empty note set that
*excludes* the truth is a mistake. Both kinds SHALL render as the same red cell
overlay. When the board is not uniquely solvable from the givens, `findMistakes`
SHALL return an empty result.

Because Check-&-Save gates the quick-save on `findMistakes`, a board carrying an
invalid note (one that has eliminated the correct height) SHALL be refused a
quick-save with the offending cells highlighted and the prior checkpoint left
intact, exactly as a wrong filled cell is.

#### Scenario: A wrong tower is flagged

- **WHEN** the player enters a tower height that contradicts the unique solution
- **THEN** `findMistakes` includes that cell with `kind: "cell"`

#### Scenario: A note that excludes the correct height is flagged

- **WHEN** an empty cell carries pencil notes that do not include the cell's
  solution height
- **THEN** `findMistakes` includes that cell with `kind: "note"`

#### Scenario: A note with extra candidates is not a mistake

- **WHEN** an empty cell carries pencil notes that *do* include the solution
  height, alongside other (incorrect) candidates
- **THEN** `findMistakes` does not include that cell

#### Scenario: Check-&-Save refuses a board with an invalid note

- **WHEN** the player activates Check-&-Save on a board where a cell's notes have
  crossed out the correct height
- **THEN** the quick-save is refused, the offending cell is highlighted, the
  prior checkpoint remains intact, and the mistake count is reported

### Requirement: Towers offers a sticky pencil mode with an on-screen indicator

Towers SHALL support a sticky pencil-entry mode, exposed as a `Game.prefs`
boolean (`Ui.pencilSticky`) that defaults **on**. When sticky mode is on, a
right-click (`RIGHT_BUTTON`) SHALL toggle a persistent pencil mode and move the
highlight to the clicked cell, and a left-click (`LEFT_BUTTON`) SHALL only move
the highlight, preserving the current pencil/real mode. When sticky mode is off,
input SHALL behave exactly as upstream: a left-click reverts to real entry and a
right-click is a per-cell pencil select. The keyboard path is unaffected (it is
already mode-persistent).

While pencil mode is active, Towers SHALL draw an on-screen mode indicator (a
small pencil glyph) in a fixed board location that no tower overlaps, so the
player can always see which mode they are in. The indicator SHALL appear and
clear together with the pencil mode and SHALL NOT alter game state.

#### Scenario: Sticky mode keeps pencil entry across left-clicks

- **WHEN** sticky pencil mode is on and the player right-clicks a cell, then
  left-clicks a different cell
- **THEN** pencil mode stays on, the highlight moves to the second cell, and a
  digit there writes a pencil mark (not a real entry)
- **AND** the on-screen pencil-mode indicator is shown the whole time

#### Scenario: Right-click toggles the mode off

- **WHEN** sticky pencil mode is on and active, and the player right-clicks again
- **THEN** pencil mode turns off, real entry resumes, and the indicator clears

#### Scenario: Sticky mode disabled restores upstream behaviour

- **WHEN** the sticky pencil preference is off and the player right-clicks a cell
  to pencil it, then left-clicks another cell
- **THEN** the left-click reverts to real entry, exactly as upstream

### Requirement: Towers provides an explained, pencil-notes-based deduction hint

The game SHALL implement `hint(state, aux?)` and `hintKeepTrack(...)`, delivering
an explained hint that teaches Towers' candidate-elimination reasoning by setting
and striking pencil notes. The hint SHALL be the solver's own narrated deduction
script: `hint` runs the *recording* solver on a sound candidate cube **seeded
from the placed grid only** (never from the player's notes) and expresses the
resulting ordered operations against the player's live notes + grid as a sequence
of `HintStep`s of three kinds:

- a **populate** step (emitted only when some empty cell lacks notes) that fills
  every empty cell's candidate marks, via the existing fill-all (`pencilAll`)
  move;
- one or more **eliminate** steps, each a single technique *firing* that strikes
  the candidate(s) that firing rules out (a multi-cell firing is one step bearing
  a single `pencilStrike` move that clears those bits); and
- **place** steps that fill a cell whose sound candidates have collapsed to one.

The hint SHALL be expressed the way a person solves: at each step it SHALL prefer
a **naked single** — an empty cell whose live notes have collapsed to a single
candidate (sound on a mistake-free board, since that lone candidate is then the
solution) — ahead of any further elimination; otherwise the next clue elimination;
otherwise a forced placement. The trivial row/column ("this number already sits in
this line") eliminations a placement implies SHALL be governed by the auto-pencil
preference (below): with it on they are folded silently into the placement and not
emitted as steps; with it off they are taught as an explicit `continuesPrevious`
strike continuation. `hint` SHALL receive the game UI so it can read that
preference.

Each step SHALL carry a narration that meets the hint quality bar — leading with
the spotted indication (the clue/line pattern), then the reasoning, then a
necessity-voice conclusion — and a highlight that shades the **driving clue
cell(s)** and their line of sight (`COL_HINT_CELL`) so the player can see which
clue the hint is about, marks the target cell(s)/struck candidate(s)
(`COL_HINT`), with equivalent strikes of one firing sharing the target colour.
The hint SHALL refuse (`{ ok: false, error }`) when the board is solved or when
`findMistakes` is non-empty, and refusal SHALL light the mistake overlay through
the engine's existing refusal→`findMistakes` coupling.

Every step SHALL be monotone progress (a note added by populate, a note removed by
eliminate, or a cell filled by place — never undone by the hint), so a
freshly-recomputed hint from any solvable, mistake-free mid-game position SHALL
make progress and lead to a solved board (the cross-game resume guarantee). On
recompute the script SHALL skip any operation whose effect is already on the
board and resume at the first that is not. `hintKeepTrack` SHALL advance the plan
when the player's move matches the displayed step's intent — a `pencilStrike`
clearing a subset of the step's marks is `onTrack` (the step shrinks in place) or
`completed` (the last is struck); a placement of the hinted value is `completed`
— and otherwise drop the plan to recompute (`off`).

The solver's recording mode SHALL be gated so that with recording off the
generator's solve path is byte-for-byte unchanged (verified by the existing C
differential), and the hint fixpoint SHALL be guarded by a step budget.

#### Scenario: A clue elimination is taught as a note strike

- **WHEN** the player asks for a hint on a fully-pencilled board where a clue
  line-of-sight deduction rules a height out of one or more cells
- **THEN** the hint returns a step whose `pencilStrike` move clears exactly those
  candidates
- **AND** the narration names the clue pattern and states why those heights
  cannot sit there, concluding in the necessity voice
- **AND** the driving clue's line of sight is shaded and the struck candidates
  are marked in the hint colour

#### Scenario: An empty board is populated before elimination

- **WHEN** the player asks for a hint on a board with no pencil notes
- **THEN** the first step fills the empty cells' candidate notes (the fill-all
  move)
- **AND** subsequent steps strike candidates and place cells

#### Scenario: A collapsed cell is placed

- **WHEN** a cell's sound candidate set has collapsed to a single height
- **THEN** the hint returns a `set` step placing that height, narrating that every
  other height is ruled out there

#### Scenario: The hint resumes from a self-played mid-game position

- **WHEN** a hint is requested from a solvable, mistake-free board the player
  reached by their own notes and placements
- **THEN** the freshly-recomputed hint makes progress (a strike or a placement)
  and, applied step by step with recompute, leads to a solved board

#### Scenario: The hint refuses on a board with mistakes

- **WHEN** a hint is requested while `findMistakes` is non-empty (a wrong tower or
  a note that excludes the truth)
- **THEN** the hint refuses with an explanatory message and the mistaken cells are
  highlighted

#### Scenario: A naked single is offered ahead of further elimination

- **WHEN** a hint is requested on a mistake-free board where some empty cell's
  pencil notes have collapsed to a single candidate
- **THEN** the next step places that height in that cell

### Requirement: Towers auto-pencils row/column eliminations on placement

The game SHALL provide an **auto-pencil** preference, **on by default**: when the
player places a tower height, the game SHALL strike that height from the pencil
marks of every other cell in the same row and column. The decision SHALL be fixed
at move-creation time (recorded on the move) so that replaying a saved game is
deterministic regardless of the preference's later value. When the preference is
off, a placement SHALL leave other cells' pencil marks untouched (upstream
behaviour). The preference SHALL also govern the hint: with it on, the hint folds
the implied row/column eliminations into the placement; with it off, the hint
teaches them as explicit strikes.

#### Scenario: Placing a tower clears matching notes in its line

- **WHEN** auto-pencil is on and the player places height `n` in a cell
- **THEN** every other empty cell in that cell's row and column loses candidate `n`
  from its pencil marks
- **AND** cells sharing neither the row nor the column keep candidate `n`

#### Scenario: Auto-pencil off leaves notes untouched

- **WHEN** auto-pencil is off and the player places a height
- **THEN** no other cell's pencil marks change

