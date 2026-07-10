# dominosa Specification

## ADDED Requirements

### Requirement: Dominosa game implements the Game interface

The engine SHALL provide a registered `dominosa` game implementing
`Game<DominosaParams, DominosaState, DominosaMove, DominosaUi, DominosaDrawState, DominosaMistake>`:
partition an `(n+2) × (n+1)` grid of numbers (each `0…n`) into 2×1 dominoes so
that the placed dominoes are exactly the `DCOUNT(n) = (n+1)(n+2)/2` distinct
number-pairs `0-0 … n-n`, one of each, with every domino's two numbers matching
the underlying clues. Params SHALL be `n` (maximum face number, default 6) and
`diff` (Trivial / Basic / Hard / Extreme / Ambiguous), encoded `"{n}"` with a
full-form `"d{t|b|h|e|a}"` difficulty suffix; a legacy bare `"a"` suffix SHALL
decode to Ambiguous. All 12 upstream presets SHALL be offered. `validateParams`
SHALL enforce `n ≥ 1`, a valid difficulty, and the upstream overflow bound. The
game SHALL report `canSolve = true`, `canFormatAsText = true` (for `n < 1000`),
and `needsRightButton = true` (upstream `REQUIRE_RBUTTON`).

#### Scenario: Params round-trip

- **WHEN** params `{ n: 6, diff: HARD }` are encoded in full
- **THEN** the result is `"6dh"` and decoding it round-trips the params

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is given `n = 0`
- **THEN** it returns a non-null error string

### Requirement: Dominosa descriptions carry the clue grid

The desc SHALL be a row-major string of the `w·h` clue numbers, each rendered as
a single digit or, for a number ≥ 10, as `[NN]` in decimal. `newState` SHALL
parse this into a frozen per-square `numbers` array shared across all states of
the game. `validateDesc` SHALL reject a desc that is too short or too long, a
number out of the range `0…n`, a missing `]`, and a clue grid in which any
number `0…n` does not occur exactly `n+2` times.

#### Scenario: A description round-trips

- **WHEN** a generated desc is parsed by `newState` and its numbers re-encoded
- **THEN** the re-encoded desc equals the original

#### Scenario: A malformed description is rejected

- **WHEN** `validateDesc` is given a desc whose number balance is wrong
- **THEN** it returns a non-null error string

### Requirement: Dominosa ports the graded solver faithfully

The port SHALL implement upstream `run_solver` with its exact deductive power at
each difficulty, returning the impossible / unique / ambiguous (0 / 1 / 2)
verdict identical to the C solver on every board. Trivial SHALL perform the
domino-single-placement and square-single-placement deductions. Basic SHALL
additionally perform square-single-domino, domino-must-overlap, the two
local-duplicate deductions, and the parity deduction (a domino whose placement
would split the unfilled area into two odd-sized regions is ruled out, detected
by bridge-finding over the placement graph). Hard SHALL additionally perform set
analysis without doubles; Extreme SHALL additionally perform set analysis with
doubles and the forcing-chain deduction (parity-linked chains of forced
placements, using a flip DSF). The solver SHALL track the maximum difficulty
level actually used.

#### Scenario: A generated board is uniquely solvable at its difficulty

- **WHEN** a board generated at difficulty `d` is solved from empty
- **THEN** the solver returns unique (1) and reports `max_diff_used == d`, and —
  for a board above Trivial — fails to reach a unique solution (returns 2) when
  capped at the difficulty one level below `d`

### Requirement: Dominosa input places dominoes and barrier edges

A left-click or `CURSOR_SELECT` between two adjacent clue numbers SHALL toggle a
domino covering them, erasing any dominoes or barrier edges that overlap the new
placement. A right-click or `CURSOR_SELECT2` between two adjacent *empty*
squares SHALL toggle a barrier edge (an annotation that never affects the win
condition and is forbidden next to any placed domino). A right-click on a clue
number, or a digit key, SHALL toggle that number in one of two value-highlight
slots (a UI-only solver aid). Cursor keys SHALL move a half-grid keyboard cursor
over the `(2w−1) × (2h−1)` lattice of squares, gaps and edges.

#### Scenario: Placing a domino erases an overlapping one

- **WHEN** a domino is placed on a square already covered by another domino
- **THEN** the previously overlapping domino is removed and the new one placed

#### Scenario: A barrier edge cannot be drawn next to a domino

- **WHEN** the player right-clicks an edge one of whose squares is part of a
  placed domino
- **THEN** no edge is toggled

### Requirement: Dominosa detects completion and flags mistakes

The game SHALL mark the board completed when the placed dominoes cover every
square as the full set of `DCOUNT(n)` distinct number-pairs with no repeated
value, and SHALL flash on the transition to completed (unless reached via
Solve). Because a generated Dominosa board is uniquely solvable, the game SHALL
implement `findMistakes`: re-solve to the unique solution and return both cells
of every player-placed domino the solution does not contain; a board that is not
uniquely solvable SHALL yield no mistakes, and blank squares and barrier edges
SHALL never be flagged. The renderer SHALL overlay flagged cells distinctly from
the always-on red **clash** highlight (a domino value placed more than once).

#### Scenario: A wrong placement is flagged

- **WHEN** the player places a domino that the unique solution does not contain
- **THEN** `findMistakes` includes both its cells and Check & Save refuses to
  save

#### Scenario: A mistake overlay repaints on a later frame

- **WHEN** a domino is drawn, then `findMistakes` flags it on a subsequent frame
  without the cell's own value changing
- **THEN** the mistake overlay is painted on that later frame

### Requirement: Dominosa renders to upstream parity under the web geometry

The renderer SHALL draw the rounded-corner domino ends (circles plus rectangles
per upstream `draw_tile`), the clue numbers, the barrier edge lines, the two
value-highlight colours, the red clash fill, the half-grid cursor corners, and
the completion flash, using the web build's `NARROW_BORDERS` geometry
(`BORDER = −DOMINO_GUTTER`). The palette SHALL mirror the upstream colour enum
index-for-index, with the fork mistake-overlay colour appended past it. Every
per-square overlay (domino type / clash / highlight / edge / cursor / flash /
mistake) SHALL be part of the render diff key so it repaints and clears
correctly.

#### Scenario: A clash renders red

- **WHEN** the same domino value is placed in two locations
- **THEN** both placements render with the clash colour rather than the normal
  domino colour
</content>
