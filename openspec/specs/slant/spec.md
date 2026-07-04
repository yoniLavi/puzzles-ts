# slant Specification

## Purpose
TBD - created by archiving change add-slant-ts-port. Update Purpose after archive.
## Requirements
### Requirement: Slant game implements the Game interface

The engine SHALL provide a registered `slant` game implementing
`Game<SlantParams, SlantState, SlantMove, SlantUi, SlantDrawState>`: fill
every square of a `w × h` grid with a `/` or `\` diagonal so that every
numbered vertex clue (0–4, on the `(w+1) × (h+1)` point grid) is met by
exactly that many incident diagonals and the diagonals form no closed loop.
Params SHALL be `w`, `h` and `diff` (Easy / Hard), encoded `{w}x{h}d{e|h}`
(short form `{w}x{h}`, square shorthand `{n}`). All 6 upstream presets
(5×5, 8×8, 12×10 × Easy/Hard) SHALL be offered. `validateParams` SHALL
enforce minimum size 2×2. The game SHALL report `canSolve = true` and
`canFormatAsText = true` and SHALL drive a solve-completion flash suppressed
after Solve.

#### Scenario: Params round-trip

- **WHEN** params `{ w: 12, h: 10, diff: HARD }` are encoded in full
- **THEN** the result is `12x10dh` and decoding it round-trips the params

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is given a 1-wide or 1-high grid
- **THEN** it returns a non-null error string

### Requirement: Slant descriptions use the upstream run-length encoding

The desc SHALL encode the `(w+1) × (h+1)` vertex-clue grid row-major, one
digit `0`–`4` per clue, with maximal runs of clueless vertices compressed as
`a`–`z` (run of 1–26, longer runs emitting `z` chunks). `validateDesc` SHALL
reject unknown characters, short descs, and over-long descs. `newState`
SHALL parse the desc into a clue grid shared (frozen) across all states of
the game, with all squares initially blank.

#### Scenario: A description round-trips

- **WHEN** a generated desc is parsed by `newState` and re-encoded
- **THEN** the re-encoded desc equals the original

#### Scenario: A malformed description is rejected

- **WHEN** `validateDesc` is given a desc with an invalid character or a
  clue count not matching `(w+1) × (h+1)`
- **THEN** it returns a non-null error string

### Requirement: Slant ports the graded solver faithfully

The port SHALL implement the upstream solver with its exact deductive power
at each difficulty. At Easy: the clue-point counting deduction (a clue whose
remaining lines equal zero or its remaining undecided neighbours fills all
of them) and immediate loop avoidance (a square whose one orientation would
close a loop takes the other). At Hard, additionally: single-pair
equivalence tracking around clue points (two adjacent undecided
equivalent squares count jointly as one line; a 2-clue with two undecided
adjacent neighbours marks them equivalent), slash-value propagation through
equivalence classes, dead-end avoidance (never connect two non-border
vertex groups that each have at most one remaining exit), and the v-shape
bitmap deductions (placed slashes, 1-clues and 3-clues rule out v-shapes;
2-clues propagate ruled-out v-shapes to their far side; a square pair with
both v-shapes ruled out becomes equivalent). The solver SHALL return
impossible / unique / non-converged verdicts identical to the C solver on
every board, including release-build `fill_square` semantics (its
conflict and loop early-outs exist only under `SOLVER_DIAGNOSTICS` and are
NOT active). The solver SHALL be reused by `solve()` and `findMistakes`.

#### Scenario: Generated boards solve at exactly their difficulty

- **WHEN** a board generated at Hard is solved
- **THEN** the Hard solver reaches the unique solution
- **AND** the Easy solver fails to converge on it

#### Scenario: Solve recovers from a wrong mid-game state

- **WHEN** `solve()` runs against a state containing wrong diagonals
- **THEN** the returned move list yields the unique solution

### Requirement: Slant generation is byte-identical to upstream

`newDesc` SHALL reproduce upstream `new_game_desc` byte-for-byte for the
same seed: filled-grid growth over a shuffled square order (forced by the
vertex DSF where a loop would form, otherwise one `random_upto(rs, 2)`
draw), full clue derivation, a single clue-index shuffle, two-pass
solver-gated clue removal (pass 0 removes obvious starting points — 4s, 0s,
border 2s, corner 1s, or everything at Easy — pass 1 the rest), and
regeneration while the board is solvable one difficulty level down. A gated
differential test SHALL assert byte-equal descs against C-recorded fixtures
for all 6 presets and non-preset sizes.

#### Scenario: Differential fixtures match

- **WHEN** `newDesc` runs with a fixture's params and seed
- **THEN** the emitted desc equals the C-recorded desc byte-for-byte

### Requirement: Slant computes live errors and completion as upstream

`executeMove` SHALL recompute error state exactly as upstream
`check_completion`: every diagonal lying on a loop edge (per the shared
findloop helper over the vertex graph) is a loop error; every clue vertex
whose degree exceeds its clue or whose maximum achievable degree is below
its clue is a vertex error; every diagonal in the border-connected vertex
component is grounded. The board is complete when no errors exist and no
square is blank; the completed flag SHALL latch.

#### Scenario: A closed loop is flagged

- **WHEN** diagonals are placed forming a closed loop
- **THEN** each diagonal on the loop carries the loop-error flag

#### Scenario: An over-committed clue is flagged

- **WHEN** a vertex clue `1` has two incident diagonals
- **THEN** that vertex carries the vertex-error flag

#### Scenario: Completion latches

- **WHEN** the last blank square is filled consistently with all clues and
  no loop exists
- **THEN** the state reports completed

### Requirement: Slant input maps clicks, cursor and direct keys

`interpretMove` SHALL cycle a square blank→`\`→`/`→blank on left-click and
blank→`/`→`\`→blank on right-click, swapped when the `left-button`
preference selects `/`-first. Arrow keys SHALL move a cursor (revealing it
first), select/select2 SHALL cycle the cursor square in each direction, and
the literal keys `\`, `/` and backspace SHALL set/clear the cursor square
directly, returning no move when the square already holds that value.
Clicks outside the grid SHALL be ignored.

#### Scenario: Left-click cycles a square

- **WHEN** a blank square is left-clicked three times (default button
  order)
- **THEN** the square becomes `\`, then `/`, then blank

#### Scenario: Swapped button order

- **WHEN** the `left-button` preference is set to `/`-first and a blank
  square is left-clicked
- **THEN** the square becomes `/`

### Requirement: Slant ships findMistakes

`findMistakes(state)` SHALL re-solve the board's clues with the Hard solver
and, when a unique solution exists, return one mistake per square whose
placed diagonal differs from that solution (blank squares are never
mistakes), rendered with the existing red error styling; it SHALL return an
empty list when the board is not uniquely solvable.

#### Scenario: A wrong diagonal blocks Check & Save

- **WHEN** a square holds the diagonal opposite to the unique solution and
  `findMistakes` runs
- **THEN** exactly that square is reported and rendered red

#### Scenario: Blank squares are not mistakes

- **WHEN** the board is partially filled with only correct diagonals
- **THEN** `findMistakes` returns an empty list

### Requirement: Slant exposes its two upstream preferences

The game SHALL expose via the `Game.prefs` hook: `left-button` (choices —
"Left \, right /" default, "Left /, right \") mapping to the click-cycle
swap, and `fade-grounded` (boolean, default off) fading diagonals in the
border-connected component to a dimmed colour so unfixable loop candidates
stand out.

#### Scenario: Fade-grounded dims border-connected diagonals

- **WHEN** `fade-grounded` is enabled and a diagonal is connected to the
  border
- **THEN** it renders in the grounded colour instead of its slash colour

### Requirement: Slant renders to full parity with the C build

`redraw` SHALL render: chessboard-coloured thick diagonals (colour parity
`(x^y)&1`), grid lines, corner dots where neighbouring squares' diagonals
meet the tile, clue circles with parity-coloured rings and ink numbers,
red error colouring for loop-edge slashes (including their corner dots) and
unmet clue circles, a filled-square background tint, the cursor highlight,
the grounded fade (per pref), and the upstream 3-phase completion flash.
The drawstate SHALL diff a `(w+2) × (h+2)` packed `Int32Array` covering the
border ring, with the findMistakes overlay carried in the diff key (a
packed bit of the per-frame-rebuilt word). The palette SHALL be
index-for-index with the C colour enum.

#### Scenario: A mistake overlay repaints an unchanged tile

- **WHEN** a tile is painted, `findMistakes` flags it, and `redraw` runs
  again with no tile change
- **THEN** the second paint renders the red mistake styling

#### Scenario: Border clue circles draw

- **WHEN** a clue sits on the outer border of the point grid
- **THEN** the border-ring tile pass draws its circle and number

