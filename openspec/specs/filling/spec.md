# filling Specification

## Purpose
TBD - created by archiving change add-filling-ts-port. Update Purpose after archive.
## Requirements
### Requirement: Filling game implements the Game interface

The engine SHALL provide a registered `filling` game implementing
`Game<FillingParams, FillingState, FillingMove, FillingUi, FillingDrawState>`:
the Nikoli puzzle Fillomino on a `w × h` grid in which every cell is filled with
a number `n` such that each maximal orthogonally-connected region of equal
numbers contains exactly `n` cells. Params SHALL be `w` and `h`, encoded
`{w}x{h}`, with presets 9×7, 13×9 (default), and 17×13. `validateParams` SHALL
require `w ≥ 1`, `h ≥ 1`, and `w·h` not unreasonably large. The game SHALL
report `wantsStatusbar = false`, `isTimed = false`, `canSolve = true`, and
`canFormatAsText = true`.

#### Scenario: Params round-trip

- **WHEN** params `{ w: 13, h: 9 }` are encoded
- **THEN** the result is `13x9`
- **AND** decoding it round-trips the params
- **AND** decoding a bare `9` yields a 9×9 square grid

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is called with `w < 1` or `h < 1`
- **THEN** it returns a non-null error string

### Requirement: Filling descriptions are run-length number grids

The desc SHALL encode the immutable clue cells in scan order: a lowercase letter
`a`–`z` advances past a run of `1`–`26` empty (unclued) cells, and a digit
places a clue of that value. `validateDesc` SHALL reject any other character and
SHALL require the decoded area to equal `w·h` exactly. `newState` SHALL decode
the desc into an immutable `clues` grid and a mutable player `board` initialised
to a copy of the clues.

#### Scenario: Description decodes to the clued board

- **WHEN** a valid desc for a `w × h` board is decoded by `newState`
- **THEN** each clued position holds its number and is immutable
- **AND** every other cell is empty and player-editable

#### Scenario: Mismatched description length is rejected

- **WHEN** `validateDesc` is given a desc whose decoded area is less than or
  greater than `w·h`
- **THEN** it returns a non-null error string

### Requirement: Filling generates uniquely solvable boards

`newDesc` SHALL build a board by partitioning the grid into regions whose sizes
equal their cell values (capped at `min(max(max(w,h),3), 9)`), then reduce the
clue set — removing whole regions and then individual clues — keeping a removal
only while the solver still solves the board, so the published clues uniquely
determine the solution. Generation SHALL be byte-faithful to upstream over the
shared bit-identical RNG (same shuffle and `randomUpto` draw sequence).

#### Scenario: Every generated board is solvable

- **WHEN** a board is generated for any preset
- **THEN** the solver fills every cell
- **AND** each resulting region's size equals its number

### Requirement: Filling solver deduces the unique solution

The solver SHALL apply four sound, confluent deductive techniques to fixpoint —
forced single-direction region growth, capacity-forced expansion / isolated
`1`-drop, critical distant squares, and per-cell possible-number bitmap
elimination (including inference of unclued "ghost" regions) — and SHALL report
whether the board was fully solved. `solve` SHALL return the completed board as
a move.

#### Scenario: Solver completes a generated board

- **WHEN** the solver runs on a freshly generated puzzle's clues
- **THEN** it reports solved
- **AND** the produced board has every region sized to its number

### Requirement: Filling fill moves and selection

`interpretMove` SHALL support selecting cells (left-click / left-drag build a
selection, keyboard cursor with multi-select, CURSOR_SELECT2 toggle, Esc clear)
and filling them: a digit key `0`–`9` (backspace ≡ `0`) sets every selected
non-clue cell — or the cursor cell when nothing is selected — to that value,
emitting a single move that changes at least one cell, and is rejected when the
value exceeds `max(w,h)` (or `3` for a 2×2 board). `executeMove` SHALL write the
value into each listed cell and mark the state completed when every cell's value
equals its region size. The selection SHALL be cleared after every committed
move.

#### Scenario: Filling a selection sets every selected cell

- **WHEN** two non-clue cells are selected and the digit `3` is pressed
- **THEN** the emitted move sets both cells to `3`
- **AND** after executing it the selection is cleared

#### Scenario: A completed grid is detected

- **WHEN** a move fills the last cells so every region's size equals its number
- **THEN** the resulting state reports `solved`

### Requirement: Filling rendering shows regions, errors, and completion

`redraw` SHALL draw each cell's number (clue cells and player-filled cells in
distinct colours), bold borders between cells that differ where at least one is
filled or either region is complete/overfull, a selection highlight, a cursor
outline, a completed-region shade, and an error shade for a region whose size
exceeds its number or an incomplete region that is fully boxed in. On the
transition to solved (not via Solve) it SHALL flash. The renderer SHALL paint no
pixels the engine owns: the first-draw branch draws the grid frame and each cell
fills its own background.

#### Scenario: Overfull region is flagged

- **WHEN** the board contains a region whose connected size exceeds its number
- **THEN** that region's cells are drawn with the error shade

### Requirement: Filling reports mistakes for Check & Save

The game SHALL implement `findMistakes(state)` by re-solving from the immutable
clues to the unique solution and returning every player-filled cell whose number
contradicts the solution, returning an empty result when the clues are not
uniquely solvable. This makes the shell's Check & Save control hard-block a save
on a wrong board.

#### Scenario: A wrong fill is flagged and clears

- **WHEN** a player fills a cell with a number that contradicts the unique
  solution and `findMistakes` is called
- **THEN** that cell is reported as a mistake
- **AND** when the cell is corrected the mistake is no longer reported

### Requirement: Filling provides an explained deduction hint

The `filling` game SHALL implement `hint(state)` returning a plan-carrying,
narrated hint that explains *why* each move is forced (the fork's hint quality
bar), and `hintKeepTrack` so the plan auto-advances as the player follows it.
The hint SHALL refuse (a `{ ok: false }` result) when the board is already
solved or when `findMistakes(state)` is non-empty, since a deduction seeded from
contradictory marks would mislead. Otherwise it SHALL deduce, from the player's
current board, an ordered sequence of forced steps that together solve the
board, returning one narrated `HintStep` per step.

A step MAY force **several squares at once** when a single deduction pins them
together (the "one firing = one journey" bar): the region-growth deduction —
the empty squares a region cannot reach its size without — SHALL be emitted as
**one step filling all of them**, narrated as either *fitting exactly* into
those squares (the group completes the region) or the region being unable to
*fully grow* without them (it still needs more). Cells no region-growth group
covers SHALL be forced individually by the remaining rules — a cell no
neighbouring region can grow into (a region of one — a 1), a cell where every
number but one is eliminated (the survivor), or a region's single
flood-reachable growth square. Each step's narration SHALL name the deduction
that forces it and SHALL avoid repeating the region's number. `hintKeepTrack`
SHALL report `"completed"` when the player's move fills all of the step's
squares with the hinted value, `"onTrack"` (shrinking the step to the
still-empty squares) when it fills only some of them, and `"off"` when it
touches any other cell or uses the wrong value.

`redraw` SHALL render the displayed step: the target square(s) given a **mild
"fill here" highlight with no digit drawn in them** (a call to action, not a
filled-in answer — the value is read from the narration), and the deduction's
**evidence shaded as an area** in a lighter hint colour — the region the
deduction reasons about, or the neighbouring cells that pin a lonely /
eliminated cell — so the shaded picture the narration names is visible. The
evidence cells' digits SHALL remain readable on the shaded fill, and the shaded
area SHALL never include a target square.

#### Scenario: Hint explains the next forced move and solves the board

- **WHEN** `hint` is called on an unsolved, mistake-free generated board
- **THEN** it returns `{ ok: true }` with a non-empty list of steps
- **AND** each step's move is a legal `executeMove` whose narration names the
  deduction (region growth / lonely cell / elimination) that forces its squares
- **AND** applying every step's move in order solves the board

#### Scenario: One firing forces several squares as a single step

- **WHEN** a region cannot reach its size without more than one empty square
- **THEN** `hint` emits a single step whose move fills all those squares
- **AND** its narration reads as the region fitting exactly into them, or being
  unable to fully grow without them

#### Scenario: Region-based steps show visible evidence

- **WHEN** `hint` returns a plan for a generated board
- **THEN** every region-growth step carries a non-empty shaded area, and no
  step shades one of its own target squares

#### Scenario: Hint refuses on a solved or mistaken board

- **WHEN** `hint` is called on a solved board, or on a board where the player
  has filled a cell contradicting the unique solution
- **THEN** it returns `{ ok: false }` with an explanatory error

#### Scenario: Following a multi-square hint advances or shrinks the plan

- **WHEN** the player fills all of the current step's squares with its value
- **THEN** `hintKeepTrack` returns `"completed"`
- **AND** filling only some of them returns `"onTrack"` with the step shrunk to
  the squares still to fill
- **AND** a move touching any other cell, or using a different value, returns
  `"off"`

### Requirement: Filling hint colour legend

When a Filling hint is displayed, `redraw` SHALL distinguish the element types
the deduction names using a stable colour legend, each colour paired with a
non-colour cue:

- The **target square(s)** (the move) SHALL be filled `COL_HINT` as a *mild*
  highlight with **no digit drawn**, so the cell reads as a call to action ("fill
  here"), not as a pre-printed answer.
- The cited **region** premise (the numbered cells a deduction grows or blocks,
  or the neighbours that rule out a value) SHALL be shaded `COL_HINT_CELL` with
  the cell's **digit drawn on top** — the digit is the non-colour cue and stays
  readable, which is why Filling shades premises rather than ringing them.

A firing that forces several target squares fills them all `COL_HINT`
(equivalent moves share one colour). The legend SHALL be consistent across the
deduction kinds (`growth` exact/partial, `blocked`, `lonely`, `bitmap`).

#### Scenario: The empty target reads distinct from the shaded premise

- **WHEN** a `growth` hint names a region of N and the empty squares it must grow
  into
- **THEN** the target squares fill `COL_HINT` with no digit, and the cited region
  shades `COL_HINT_CELL` with its digits drawn on top, in different colours

#### Scenario: Grouped target squares share one colour

- **WHEN** one deduction forces several empty squares at once
- **THEN** every forced square fills the same `COL_HINT`, not distinct colours

