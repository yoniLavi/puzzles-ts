# unruly Specification

## Purpose
TBD - created by archiving change add-unruly-ts-port. Update Purpose after archive.
## Requirements
### Requirement: Unruly game implements the Game interface

The engine SHALL provide a registered `unruly` game implementing
`Game<UnrulyParams, UnrulyState, UnrulyMove, UnrulyUi, UnrulyDrawState>`: the
binary puzzle (Binairo / Tohu-wa-Vohu) on a `w2 × h2` grid in which every cell
is filled black (`one`) or white (`zero`) so that no row or column contains a
run of three equal cells and each row and column holds equally many of each
colour; an optional `unique` variant additionally forbids two identical rows or
two identical columns. Params SHALL be `w2`, `h2` (both even and at least 6),
`unique` (boolean), and `diff` (Trivial / Easy / Normal), encoded `{w2}x{h2}`
with an optional `u` for the unique variant and, when `full`, `d{c}` for the
difficulty char. The 7 upstream presets (8×8, 10×10, 14×14 across the offered
difficulties) SHALL be offered. `validateParams` SHALL reject an odd or
below-6 dimension, an unreasonably large `w2·h2`, a `unique`-mode grid too tall
or too long for any valid set of distinct rows (the A177790 bound), and an
unknown difficulty. The game SHALL report `wantsStatusbar = false`,
`isTimed = false`, `canSolve = true`, and `canFormatAsText = true`.

#### Scenario: Params round-trip

- **WHEN** params `{ w2: 10, h2: 10, unique: false, diff: Normal }` are encoded
  with `full`
- **THEN** the result encodes the dimensions and difficulty char
- **AND** decoding it round-trips the params
- **AND** decoding a bare `8x8` yields a square grid with `unique` false

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is called with an odd dimension, a dimension below
  6, or a `unique`-mode grid exceeding the distinct-rows bound
- **THEN** it returns a non-null error string

### Requirement: Unruly descriptions are run-length colour grids

The desc SHALL encode the immutable clue cells in scan order using upstream's
run-length alphabet: a lowercase letter advances past a run of empty cells and
places a `zero` clue, an uppercase letter does the same placing a `one` clue,
and `z`/`Z` advance 25 cells without placing a clue; the encoded positions SHALL
sum to exactly `w2·h2 + 1`. `validateDesc` SHALL reject any other character and
any desc whose decoded length differs from `w2·h2 + 1`. `newState` SHALL parse
the desc into the grid with clue cells holding their colour and marked
immutable, every other cell empty, `completed` and `cheated` both false.

#### Scenario: A description round-trips

- **WHEN** a generated desc is parsed by `newState` and the clue grid is
  re-encoded
- **THEN** the re-encoded desc equals the original

#### Scenario: A malformed description is rejected

- **WHEN** `validateDesc` is given a desc with an invalid character or a decoded
  length mismatching the params
- **THEN** it returns a non-null error string

### Requirement: Unruly generates uniquely solvable boards at the target difficulty

`newDesc` SHALL generate a board by repeatedly building a random valid full grid
(placing a random colour in each cell in shuffled order and running the solver
to a fixpoint after each placement, retrying until a counts-valid,
run-valid grid results), then winnowing clues — clearing cells in shuffled order
and keeping each clear iff the deductive solver at the target difficulty still
reaches a counts-valid solution. For any difficulty above Trivial it SHALL
reject a board the solver one level easier can already finish (the too-easy
gate), regenerating otherwise. Every generated board SHALL pass `validateDesc`
and be solvable by the deductive solver at its target difficulty.

#### Scenario: Generated boards are valid and solvable

- **WHEN** `newDesc` runs for a seeded RNG across the presets
- **THEN** every desc passes `validateDesc`
- **AND** the deductive solver at the board's difficulty solves it from its
  clues alone to a counts-valid, run-valid state

### Requirement: Unruly solves boards with deductive techniques gated by difficulty

The solver SHALL reach a solution by repeatedly applying, to a fixpoint and
gated by difficulty: at **Trivial**, (1) the two cells of an almost-three filled
the same colour force the third cell to the opposite colour, and (2) a row or
column with one empty cell left for a colour fills it; at **Easy**, additionally
(3) a row or column already holding its full count of one colour fills the rest
with the other, and (in `unique` mode) (4) a full row/column matched in all but
one place by a one-short row/column forces that place to differ; at **Normal**,
additionally (5) a near-complete row/column whose last cell of a colour, if
placed in certain cells, would create three-in-a-row, so the colour is forced
elsewhere. `solveGame` SHALL return the maximum difficulty whose technique fired
(or "already solved"). `solve` SHALL run the full solver and return the
completing grid as a move, or an error when the board has no solution or a
contradiction.

#### Scenario: The impending-three rule forces the third cell

- **WHEN** the solver runs on a row with two adjacent same-colour cells and an
  adjacent empty cell that would complete a forbidden run
- **THEN** that empty cell is set to the opposite colour

#### Scenario: Solve completes a generated board

- **WHEN** the Solve command runs on a generated board
- **THEN** it returns a move whose grid fills every cell, after which `status`
  returns `"solved"`

### Requirement: Unruly marks cells via three-state cycling moves

An `UnrulyMove` SHALL place a colour or empty at a cell (upstream's `P{c},{x},{y}`)
or apply a full solution grid (upstream's `S`). `executeMove` SHALL be pure,
reject an out-of-bounds or immutable-cell target, and recompute `completed` as
counts-valid plus run-valid after the placement (a solve move marks the state
cheated and completed). Left-button / select on a non-immutable cell SHALL cycle
empty → one → zero → empty; right-button / select2 SHALL cycle
empty → zero → one → empty; the `1` key SHALL place one, `0`/`2` zero, and
backspace / middle-button clear; an immutable cell SHALL be inert. A keyboard
cursor SHALL move within the grid. A click or key that would not change the
target cell SHALL produce no history move.

#### Scenario: Left and right cycle in opposite directions

- **WHEN** an empty non-immutable cell receives a left-button action, then
  another, then another
- **THEN** it passes one → zero → empty
- **AND** the same cell under three right-button actions passes zero → one →
  empty

#### Scenario: Immutable cells reject marking

- **WHEN** a marking action targets an immutable clue cell
- **THEN** `interpretMove` produces no move and the cell is unchanged

#### Scenario: Completing the board is detected

- **WHEN** a move fills the final cell of a valid solution
- **THEN** `completed` becomes true, `status` returns `"solved"`, and a flash
  plays

### Requirement: Unruly renders the grid with live error highlighting and a completion flash

`redraw` SHALL draw each cell in its colour fill (white for zero, black for one,
neutral for empty), an inset bevel on immutable clue cells, and — recomputed
each frame — error overlays: a red bar spanning any three-in-a-row run, a `!`
marker on cells of a row or column whose colour count is exceeded, and (in
`unique` mode) a red bar across any pair of identical full rows or columns. A
keyboard cursor SHALL be drawn as an outline on the focused cell. On completion
a flash SHALL play, inverting filled tiles toward their highlight/lowlight in
alternating frames. The palette SHALL use the upstream colour-enum index layout
so the app's dark-mode palette overrides apply unchanged, deriving the
black/white highlight and lowlight from the shared `mkhighlightSpecific` helper.

#### Scenario: A three-in-a-row reddens live

- **WHEN** three consecutive same-colour cells exist in a row or column
- **THEN** `redraw` draws an error-coloured bar across them without any explicit
  check action

#### Scenario: The completion flash plays once

- **WHEN** a move transitions the board from unsolved to solved without cheating
- **THEN** `flashLength` returns a positive duration and `redraw` inverts the
  filled tiles during the flash

### Requirement: Unruly checks player marks against the unique solution

The `unruly` game SHALL implement `findMistakes(state)` (the mistake-checking
divergence Check & Save hard-blocks on): re-solve the board from its **immutable
clues alone** with the full deductive solver and return every player-placed
(non-immutable) cell whose colour contradicts that unique solution; return none
when the clues do not deduce a complete solution (a foreign or non-unique board)
or when the player's marks are all consistent. `findMistakes` SHALL be pure.
`redraw` SHALL render each flagged cell with a distinct inset error-coloured
outline, separate from the live three-in-a-row / count error overlays.

#### Scenario: A wrong mark is flagged and a correct one is not

- **WHEN** the player places, on a non-clue cell, the opposite colour to the
  cell's value in the unique solution, and Check & Save runs
- **THEN** `findMistakes` returns that cell
- **AND** placing instead the solution's colour there leaves `findMistakes`
  returning no mistakes

#### Scenario: Check & Save refuses a mistaken board

- **WHEN** the board carries at least one contradicting mark
- **THEN** the engine reports `canFindMistakes` true, `findMistakes` returns a
  non-empty list, and the displayed mistake overlay renders the flagged cells in
  the error colour

### Requirement: Unruly provides an explained deduction hint and a placement animation

The `unruly` game SHALL implement `hint(state)` returning a plan-carrying,
narrated hint that explains *why* each move is forced (the fork's hint quality
bar), and `hintKeepTrack` so the plan auto-advances as the player follows it.
The hint SHALL refuse (a `{ ok: false }` result) when the board is already
solved or when `findMistakes(state)` is non-empty, since a deduction seeded from
contradictory marks would mislead. Otherwise it SHALL deduce, from the player's
current marks, the ordered sequence of forced cells (run to fixpoint at the
solver's full strength) and return one narrated `HintStep` per forced cell. Each
step's narration SHALL state the deduction technique that forces the cell — two
of three consecutive cells already equal (a third would be three in a row), a
row or column whose count of one colour is already complete (so the rest are the
other colour), a unique-rows conflict (a cell that would duplicate a full
row/column), or a near-complete row whose single remaining odd-colour cell is
pinned to one window (so every other empty cell is forced). Moves that a single
firing forces (a whole line completing to one colour, a near-complete row's
forced remainder) SHALL be emitted as one journey via `continuesPrevious`, so
they read and auto-play as a single coherent hint. `hintKeepTrack` SHALL report
`"completed"` when the player's move sets the hinted cell to the hinted value and
`"off"` otherwise.

`redraw` SHALL render the displayed step: the target cell in the hint colour with
a preview of the forced colour, and the deduction's **evidence made visible** —
the sibling cells the same journey forces light-shaded in a lighter hint colour
(applied only to still-empty cells, so the shade tracks the live board as legs
apply), and filled premise cells (the same-colour pair, the near-complete
reserved window) **ringed** in the hint colour rather than shaded, since a light
shade over a filled tile would hide the colour that is the evidence. Every step
SHALL carry visible evidence — a non-empty shaded area or a ring — never a bare
conclusion.

Independently of hints, the game SHALL implement `animLength` so that a `place`
move which changes a cell animates: `redraw` SHALL grow the new colour from the
cell centre to full over the animation, drawing the previous colour beneath. The
animation SHALL be geometric (palette-index based, no colour tween), settle to
the plain new colour, and coexist with the completion flash. Because the base
animation length is non-zero, a hint-executed move SHALL play stretched to the
uniform hint-step duration, so auto-hint reads as continuous fills.

#### Scenario: Hint explains the next forced move

- **WHEN** `hint` is called on an unsolved, mistake-free generated board
- **THEN** it returns `{ ok: true }` with a non-empty list of steps
- **AND** the first step's move is a legal `executeMove` whose narration names the
  technique (three-in-a-row / completed count / unique rows / near-complete) that
  forces its cell
- **AND** applying every step's move in order solves the board

#### Scenario: One firing reads as one journey

- **WHEN** a single completed-count or near-complete firing forces several cells
- **THEN** those cells are emitted as consecutive steps, the first beginning a
  journey and the rest flagged `continuesPrevious`
- **AND** the per-cell techniques (three-in-a-row, unique rows) emit independent
  steps

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
- **THEN** `hintKeepTrack` returns `"completed"`
- **AND** a move that sets a different cell, or the hinted cell to a different
  value, returns `"off"`

#### Scenario: A placement animates as a growing fill

- **WHEN** a `place` move changes a cell and `redraw` runs mid-animation
- **THEN** the cell draws its previous colour beneath the new colour growing from
  the centre
- **AND** at rest the cell shows the plain new colour

### Requirement: Unruly hint colour legend

When an Unruly hint is displayed, `redraw` SHALL distinguish the element types
the deduction names using a stable colour legend, each colour paired with a
non-colour cue:

- The **forced cell** (the move) SHALL be filled `COL_HINT`, with the forced
  colour previewed as an inset square (and a grow animation while it is placed).
- The deduction's other **forced empty cells** in the same journey SHALL be
  shaded `COL_HINT_CELL` (applied only to still-empty cells).
- The **cited premise / pivotal cells** the deduction reasons over (the
  same-colour pair in `threes`, the completed quota in `complete`, the full
  reference line in `unique`, the reserved window in `nearcomplete`) SHALL be
  ringed `COL_HINT_REF`, not `COL_HINT` — so the cited premise is not drawn in
  the same colour as the forced move. The cell keeps its own appearance (a
  filled black/white cell stays visible; an empty reserved-window cell stays
  empty) underneath the ring.

Unruly uses a **single** premise ring colour (not a per-colour black/white
split): its ringed cells are not uniformly one decided colour — `unique` rings a
balanced line holding both colours and `nearcomplete` rings empty cells — so a
state-derived ring colour is ill-defined. The legend SHALL be consistent across
the four techniques. The `UnrulyHint` payload (`target`/`area`/`ring`) is
unchanged; the legend is a render concern.

#### Scenario: A cited premise rings distinct from the forced cell

- **WHEN** a `threes`, `complete`, or `unique` hint is displayed (filled premise
  cells force a move)
- **THEN** the cited premise cells are ringed `COL_HINT_REF` and the forced cell
  is filled `COL_HINT`, in different colours

#### Scenario: Forced journey cells stay shaded

- **WHEN** a hint forces several empty cells in one line (a `fillRow` journey)
- **THEN** the still-empty forced cells are shaded `COL_HINT_CELL`, distinct from
  both the `COL_HINT` target and the `COL_HINT_REF` premise ring

