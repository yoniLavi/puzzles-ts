# magnets Specification

## Purpose
TBD - created by archiving change add-magnets-ts-port. Update Purpose after archive.
## Requirements
### Requirement: Magnets game implements the Game interface

The engine SHALL provide a registered `magnets` game implementing
`Game<MagnetsParams, MagnetsState, MagnetsMove, MagnetsUi, MagnetsDrawState, MagnetsMistake>`:
fill a `w × h` grid of pre-laid 2×1 dominoes so that each domino is either a
magnet (one `+` cell and one `−` cell) or neutral (both cells blank), no two
orthogonally-adjacent cells share a polarity, and each row and column contains
exactly its clue count of `+` and of `−` cells. Some dominoes MAY be fixed
singleton squares that are permanently neutral. Params SHALL be `w`, `h`,
`diff` (Easy / Tricky) and `stripclues` (boolean), encoded `{w}x{h}` with a
full-form `d{e|t}` difficulty suffix and an `S` strip-clues suffix (square
shorthand `{n}`). All 8 upstream presets SHALL be offered. `validateParams`
SHALL enforce `w ≥ 2`, `h ≥ 2`, a per-difficulty minimum size (Easy: `w ≥ 3`
or `h ≥ 3`; Tricky: `w ≥ 5` or `h ≥ 5`) and the area bound. The game SHALL
report `canSolve = true`, `canFormatAsText = true`, and
`needsRightButton = true` (upstream `REQUIRE_RBUTTON`).

#### Scenario: Params round-trip

- **WHEN** params `{ w: 10, h: 9, diff: TRICKY, stripclues: true }` are
  encoded in full
- **THEN** the result is `10x9dtS` and decoding it round-trips the params

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is given a 4×4 grid at Tricky difficulty
- **THEN** it returns a non-null error string (Tricky needs a side ≥ 5)

### Requirement: Magnets descriptions carry the clues and domino layout

The desc SHALL encode, comma-separated: the `w` column `+` counts, the `h` row
`+` counts, the `w` column `−` counts, the `h` row `−` counts (each a digit/
letter, or `.` for a stripped/absent clue), then a `w·h`-character row-major
string of domino orientations (`L`/`R`/`T`/`B` for the left/right/top/bottom
half of a domino, `*` for a singleton square). `newState` SHALL parse this into
a per-cell domino-partner map and the `[+, −, neutral]` row/column count
targets shared (frozen) across all states of the game, deriving each neutral
target as `size − (+) − (−)` and marking singletons permanently neutral.
`validateDesc` SHALL reject a short desc, characters out of range, inconsistent
domino descriptions (an end not pointing back at its partner), and counts that
exceed the row/column size.

#### Scenario: A description round-trips

- **WHEN** a generated desc is parsed by `newState` and re-encoded
- **THEN** the re-encoded desc equals the original

#### Scenario: A malformed description is rejected

- **WHEN** `validateDesc` is given a desc whose domino ends are inconsistent
- **THEN** it returns a non-null error string

### Requirement: Magnets ports the graded solver faithfully

The port SHALL implement upstream `solve_state` with its exact deductive power
at each difficulty, returning the impossible / ambiguous / solved
(−1 / 0 / 1) verdict identical to the C solver on every board. The Easy tier
SHALL perform: set-and-hold of initial givens, force-by-flags, the
neither-can-be-a-magnet neutral deduction, the row/column count-full pass
(colour complete ⇒ exclude the rest; remaining unset all needed ⇒ set them),
and the odd-length-section deduction. The Tricky tier SHALL additionally
perform: the advanced-full in-row domino-polarisation pass, the
single-neutral-left exclusion, and the two count-dominoes passes
(all-remaining-dominoes-magnet ⇒ no neutral; one placeable end ⇒ set it). The
solver SHALL propagate a deduction across a domino to its partner (an
excluded colour on one end excludes the opposite colour on the other).

#### Scenario: A generated board is uniquely solvable at its difficulty

- **WHEN** a board generated at difficulty `d` is solved from empty
- **THEN** the solver returns solved (1) at `d`, and — for a Tricky board —
  fails to fully solve (0) at Easy

### Requirement: Magnets input cycles domino contents and toggles clue aids

Left-click or `CURSOR_SELECT` on a domino cell SHALL cycle its content
empty → `+` → `−` → empty (setting the partner to the opposite polarity),
refusing to start from a placed neutral. Right-click or `CURSOR_SELECT2` SHALL
cycle empty → neutral → not-neutral(`?`) → empty over the whole domino,
refusing to start from a magnet. A left-click on a border clue number SHALL
toggle that clue's "done" grey highlight (a solver aid, tracked in state and
never affecting the win condition). Cursor keys SHALL move a keyboard cursor.
A click or cursor action on a singleton square SHALL do nothing.

#### Scenario: The magnet cycle sets both domino ends

- **WHEN** the player left-clicks the left cell of a horizontal domino twice
- **THEN** after the first click that cell is `+` and its partner `−`, and
  after the second the cell is `−` and its partner `+`

#### Scenario: Clue-done toggle does not affect completion

- **WHEN** the player clicks a border clue number
- **THEN** that clue renders greyed and the board's solved status is unchanged

### Requirement: Magnets flags mistakes against the unique solution

Because a generated Magnets board is uniquely solvable, the game SHALL
implement `findMistakes`: re-solve from the dominoes and row/column counts to
the unique solution and return every player-set cell whose content contradicts
it. Empty cells and not-neutral marks SHALL never be flagged; a board that is
not uniquely solvable SHALL yield no mistakes. The renderer SHALL overlay the
flagged cells distinctly from the always-on live error highlighting (two
touching identical terminals, and over/under-committed clue counts, shown in
red per upstream `check_completion`).

#### Scenario: A wrong placement is flagged

- **WHEN** the player sets a domino to a polarity the unique solution
  contradicts, without yet violating adjacency or a count
- **THEN** `findMistakes` includes that cell and Check & Save refuses to save

### Requirement: Magnets renders to upstream parity under the web geometry

The renderer SHALL draw the rounded-corner dominoes (per upstream
`draw_tile_col`), the `+`/`−` magnet symbols, the neutral cross, the blue
not-neutral `?`, singleton black squares, and the `+`/`−` clue counts on all
four borders (top = column `+`, bottom = column `−`, left = row `+`, right =
row `−`) with the corner `+`/`−` symbols, using the web build's
`NARROW_BORDERS` geometry (`BORDER = 0`, an `(w+2) × (h+2)`-tile canvas). The
palette SHALL mirror the upstream colour enum index-for-index, with the fork
mistake-overlay colour appended past it. Every per-cell and per-clue overlay
(set / error / cursor / not-neutral / flash / mistake / clue-done) SHALL be
part of the render diff key so it repaints and clears correctly.

#### Scenario: A mistake overlay repaints on a later frame

- **WHEN** a cell is drawn, then `findMistakes` flags it on a subsequent frame
  without the cell's own value changing
- **THEN** the mistake overlay is painted on that later frame

