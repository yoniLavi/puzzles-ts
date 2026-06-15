# palisade Specification

## Purpose
TBD - created by archiving change add-palisade-ts-port. Update Purpose after archive.
## Requirements
### Requirement: Palisade game implements the Game interface

The engine SHALL provide a registered `palisade` game implementing
`Game<PalisadeParams, PalisadeState, PalisadeMove, PalisadeUi, PalisadeDrawState, PalisadeMistake>`:
a region-division puzzle (Nikoli's "Five Cells") in which numeric clues count
the walls around each cell, and the player draws walls so the grid divides into
connected regions of exactly `k` cells with every clue equal to its cell's wall
count. Params SHALL be `w`, `h`, and `k` (region size), encoded `{w}x{h}n{k}`.
The 4 upstream presets — 5×5n5, 8×6n6, 10×8n8, 15×12n10 — SHALL be offered, and
the type summary SHALL render via the `width`/`height`/`region-size` config
keys. `validateParams` SHALL require `k ≥ 1`, `w ≥ 1`, `h ≥ 1`, `k` dividing
`w·h`, `k < w·h`, and (for full validation) reject `k = 2` unless `w` or `h` is
1. The game SHALL report `wantsStatusbar = true`, `isTimed = false`,
`canSolve = true`, and `canFormatAsText = true`.

#### Scenario: Params round-trip

- **WHEN** params `{ w: 8, h: 6, k: 6 }` are encoded
- **THEN** the result is `8x6n6`
- **AND** decoding `8x6n6` round-trips the params
- **AND** decoding a bare `5` yields `{ w: 5, h: 5, k: 5 }` (upstream lenience)

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is called with `k` not dividing `w·h`, or `k = w·h`,
  or `k = 2` on a board wider and taller than 1
- **THEN** it returns a non-null error string

### Requirement: Palisade descriptions are run-length clue grids

The desc SHALL encode the clue grid in scan order: a digit `0`–`4` for each
clue and a letter `a`–`z` for each run of 1–26 clueless cells, exactly as
upstream. `validateDesc` SHALL reject a digit above `4`, any non-clue
printable character, and a desc describing more than `w·h` squares. `newState`
SHALL parse the desc into a clue board shared (frozen, by reference) across all
states, with the grid-rim walls set and all interior edges unknown.

#### Scenario: A description round-trips

- **WHEN** a generated desc is parsed by `newState` and re-encoded from the
  resulting clue board
- **THEN** the re-encoded desc equals the original

#### Scenario: A malformed description is rejected

- **WHEN** `validateDesc` is given a desc containing a `5` or another invalid
  character, or describing more than `w·h` squares
- **THEN** it returns a non-null error string

### Requirement: Palisade generates uniquely solvable boards

`newDesc` SHALL divide the rectangle into random equal-size regions
(`divvyRectangle`), derive each cell's clue and the solution walls from that
division, regenerate until the deductive solver solves the full-clue board,
then strip clues in a shuffled order, keeping a clue removed only while the
solver still uniquely solves the board. The emitted desc SHALL be the
run-length clue grid; the aux SHALL be the solution border set.

#### Scenario: Generated boards are solvable

- **WHEN** `newDesc` produces a board for each of the 4 presets across several
  seeds
- **THEN** the deductive solver solves each board to a valid division (every
  region size `k`, every clue satisfied, no stray walls)

### Requirement: Palisade edges are three-valued and shared between cells

Each edge SHALL be wall, no-wall-mark, or unknown, stored as the upstream
`borderflag` byte per cell (low nibble walls U/R/D/L, high nibble no-wall
marks). A wall or mark SHALL be recorded on both cells sharing the edge.
`interpretMove` SHALL map a left-click to toggle the nearest edge between wall
and unknown, a right-click to toggle it between no-wall-mark and unknown, and
SHALL emit the two-sided edit; it SHALL support the half-grid keyboard cursor
(move + select toggling the cursor's edge). `executeMove` SHALL reject any
edit toggling a wall that points off the grid.

#### Scenario: A wall toggle records both sides

- **WHEN** the player toggles a wall on the right edge of an interior cell `i`
- **THEN** `executeMove` sets the right-wall bit of `i` and the left-wall bit
  of the cell to its right

#### Scenario: The grid rim cannot be toggled

- **WHEN** a move would toggle a wall pointing off the grid
- **THEN** `executeMove` throws (the move is rejected)

### Requirement: Palisade detects completion and the unique-division solve

`isSolved` SHALL report a state solved iff the walls divide the grid into
connected components every of size `k`, every clue equals its cell's wall
count, and no wall lies within a single component (no stray border).
`executeMove` SHALL set `completed` when a non-solve move reaches a solved
state. The `solve` command SHALL run the deductive solver from the bare rim
and, on success, emit the full solution border set as a `solve` move marking
the state completed and cheated.

#### Scenario: A correct division is complete

- **WHEN** the walls divide the grid into size-`k` regions matching all clues
  with no stray walls
- **THEN** `isSolved` returns true and `status` reports a win

#### Scenario: Solve fills a correct division

- **WHEN** the `solve` command runs on a solvable board
- **THEN** the resulting state is solved and marked cheated

### Requirement: Palisade renders walls, clues, live errors, and a solve flash

`redraw` SHALL draw the grid-corner dots and background once on first draw,
then per-tile (diffed against an `Int32Array` flag cache) draw the four border
edges coloured wall/no-wall/unknown, the clue text, and the half-grid cursor
box. It SHALL redden, from the current borders, any wall whose region is too
large or too small and any wall dangling within a single region, and redden a
clue whose wall count is already impossible. `flashLength` SHALL return a
0.7-second flash whenever a *player* move brings the board into a solved state
— including a genuine manual completion after a prior Solve — and SHALL NOT
flash on the Solve command itself (the move where `cheated` flips false→true).
To make re-completion a real transition, `executeMove` recomputes `completed`
every move (it is not sticky); `cheated` stays set as the permanent
"used Solve" record.

#### Scenario: An over-large region reddens its walls

- **WHEN** the player's walls enclose a region larger than `k`
- **THEN** `redraw` emits the boundary walls of that region in the error colour

#### Scenario: A player completion flashes; the Solve command does not

- **WHEN** a player move brings the board into a solved state — whether a first
  manual completion or a manual re-completion after a prior Solve
- **THEN** `flashLength` returns 0.7
- **AND** returns 0 on the Solve command itself, and 0 when a move breaks a
  previously-solved board

### Requirement: Palisade checks mistakes against the unique solution

The game SHALL implement `findMistakes(state)`: it re-solves the clue set from
the bare grid rim with the deductive solver and, on a unique solution, returns
a `PalisadeMistake { x, y, dir }` for every edge where the player has drawn a
wall the solution lacks or set a no-wall mark where the solution has a wall.
When the clue set is not uniquely solvable, it SHALL return an empty result
(never a false positive). The midend overlay SHALL pass these to `redraw`,
which reddens the flagged edges and clears them on the next transition,
enabling Check-&-Save to block on real mistakes.

#### Scenario: A wrong wall is flagged

- **WHEN** the player draws a wall that the unique solution does not contain
- **THEN** `findMistakes` includes that edge

#### Scenario: A correct partial board is clean

- **WHEN** every wall the player has drawn agrees with the unique solution
- **THEN** `findMistakes` returns an empty result

### Requirement: Palisade offers a deduction-based hint

The `palisade` game SHALL implement `Game.hint()` and `Game.hintKeepTrack()`,
surfacing its deductive solver as a narrated, highlighted hint plan.

`hint(state)` SHALL seed the solver from the player's current state — the
player's walls copied into the solver's borders, and every player no-wall mark
(`DISABLED` bit) pre-merged into the solver's DSF — then run the six deductions
to a fixpoint, recording in discovery order every edge the deductions force: a
**wall** for each newly-set `disconnect`, and a **no-wall** for each
individually-forced `connect` (a clue whose walls are all placed, two edges to
one region the clue cannot afford as walls, or an under-sized region whose
single growth target is reached by exactly one undecided edge). Each recorded
edge SHALL carry the **firing** (the single logical deduction) that produced it.

The plan SHALL be built so that **all edges forced by one firing form one
journey** (per the engine's hint-authoring convention): the `equivalentEdges`
pair, and each `numberExhausted` sweep that resolves several of a clue's sides,
become a contiguous run of `HintStep`s — the first leg unflagged with the full
explanation, the remaining legs flagged `continuesPrevious` with abbreviated
narration. Single-edge firings remain single steps. Distinct firings remain
separate hints. The full chain SHALL be returned as the plan, so a single
request shows the next deduction (all its legs) and auto-hint can play the whole
chain.

Each leg's move SHALL be the two-sided `edges` edit that sets its edge to the
forced state. Each leg's explanation SHALL name the rule that fired, phrased as
advice that has **not** yet been applied ("must be a wall" / "can't be a wall",
never "is a wall" / "has none"). For a multi-edge firing the first leg SHALL
state why the moves are forced *together* — for `equivalentEdges`, that the two
highlighted edges border the same region and therefore **share a fate** (both
walls or both open), which together with the clue's count forces the result;
for `numberExhausted`, that the clue's count leaves its remaining edges with a
single possible state — and SHALL phrase the conclusion across the set ("clear
this one, then the rest" / "both"). Each leg's highlights SHALL identify every
element it references: the action edge, the firing's other not-yet-acted edges
as sibling edges, and the referenced cells (a clue pair, the clue cell, or the
region the deduction reasons about).

`hint()` SHALL refuse — returning `{ ok: false }` with a readable reason —
when the board is already solved, or when `findMistakes(state)` reports any
mistake, so a hint is never derived from a wrong wall or mark. When the clue set
is not uniquely solvable (so no deduction is found) it SHALL likewise return an
error rather than a plan.

`hintKeepTrack(move, step, state)` SHALL return `"completed"` when the player's
`edges` move toggles the step's hinted edge into its forced state (side- and
button-checked: a wrong-button click on the same edge does not complete the
step), and `"off"` otherwise.

The renderer SHALL paint **every** edge the current step's firing forces — the
action edge and the firing's other forced edges alike — in `COL_HINT`: they
share a fate (all walls or all open), so they share a colour, signalling the
player to treat them as one set. It SHALL shade every referenced cell in a
`COL_HINT_CELL` background, folding the highlight into the per-tile cache so it
appears when shown and clears when the midend drops the plan. For the
`equivalentEdges` deduction the shaded cells SHALL be the region the edges
border, **not** the clue cell that decides the edges. Seeding the hint from the
player's state SHALL NOT mutate that state, and running the solver without a
recorder SHALL behave exactly as before (the `solve`, `findMistakes`, and
generator paths are unchanged).

#### Scenario: Next deduction is surfaced and solves the board

- **WHEN** `hint()` is called on a fresh, uniquely-solvable Palisade board
- **THEN** it returns a non-empty plan whose steps are forced edges in
  discovery order
- **AND** applying every step's move in order brings the board to a solved state

#### Scenario: A coupled deduction is one multi-leg journey

- **WHEN** the next deduction is an `equivalentEdges` firing (two edges of a
  clue that border the same region)
- **THEN** the plan contains both edges as a contiguous run: the first leg
  unflagged, the second leg flagged `continuesPrevious`
- **AND** the first leg's explanation states that the two edges share a fate
  (both walls or both open) and names the clue that decides them
- **AND** the first leg's highlights include the other edge as a sibling and the
  shared region as referenced cells

#### Scenario: A player no-wall mark is not re-hinted

- **WHEN** the player has marked an edge "no wall" that the solver would also
  deduce as no-wall
- **THEN** that edge does not appear as a step in the returned plan (its fact is
  already seeded into the solver's DSF)

#### Scenario: Hint refuses on a mistaken or solved board

- **WHEN** `hint()` is called on a board carrying a wall the unique solution
  lacks, or on an already-solved board
- **THEN** it returns `{ ok: false }` with a human-readable error and no plan

#### Scenario: Following the hinted edit advances the plan

- **WHEN** a hint step is displayed and the player makes the exact hinted edge
  edit
- **THEN** `hintKeepTrack` returns `"completed"`
- **AND** a wrong-button click on the same edge, or an edit on a different edge,
  returns `"off"`

#### Scenario: The hint highlights a firing's edges as one set

- **WHEN** `redraw` is given a displayed multi-edge firing step (an action edge,
  the firing's other forced edge, and referenced cells)
- **THEN** both forced edges are painted in `COL_HINT` (the same colour, since
  they share a fate)
- **AND** every referenced cell is shaded in `COL_HINT_CELL`
- **AND** with no hint step the tiles draw without any of those hint colours

