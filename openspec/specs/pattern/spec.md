# pattern Specification

## Purpose
TBD - created by archiving change add-pattern-ts-port. Update Purpose after archive.
## Requirements
### Requirement: Pattern game implements the Game interface

The engine SHALL provide a registered `pattern` game implementing
`Game<PatternParams, PatternState, PatternMove, PatternUi, PatternDrawState>`:
the nonogram (Pattern / Picross / Paint-by-numbers) on a `w × h` grid in which
each cell is `Full` (black) or `Empty` (background) so that each row and column
matches its sequence of run-length clues. Params SHALL be `w` and `h` (positive
integers), encoded `{w}x{h}` with a bare `{w}` decoding to a square `w × w`
grid. The upstream presets (10×10, 15×15, 20×20, 25×25, 30×30) SHALL be offered.
`validateParams` SHALL reject a non-positive dimension and an unreasonably large
`w·h`. The game SHALL report `canSolve = true` and `canFormatAsText = true`, and
SHALL drive a solve-completion flash.

#### Scenario: Params round-trip

- **WHEN** params `{ w: 20, h: 15 }` are encoded
- **THEN** the result is `20x15`
- **AND** decoding it round-trips the params
- **AND** decoding a bare `10` yields `{ w: 10, h: 10 }`

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is called with a non-positive dimension or a grossly
  oversized `w·h`
- **THEN** it returns a non-null error string

### Requirement: Pattern descriptions are slash-separated clue lists

The desc SHALL encode the `w` column clues followed by the `h` row clues as a
`/`-separated list, each line a `.`-separated list of positive run lengths (an
empty line being an empty section). An OPTIONAL trailing `,`-suffix MAY encode
pre-filled immutable clue squares using the run-length alphabet (`a`/`A` … with
`z` advancing 25 cells), as produced by upstream's picture generator; the
fork's generator emits none, but `validateDesc` and `newState` SHALL still parse
it so such descs round-trip. `validateDesc` SHALL reject a clue that is
non-positive or grossly excessive, a line whose clues cannot fit in its length,
too few or too many line specifications, and any unrecognised character in
either section. `newState` SHALL parse the desc into the immutable clue arrays
and an all-`Unknown` grid (with any immutable suffix applied), `completed` and
`cheated` both false.

#### Scenario: A description round-trips

- **WHEN** a generated desc is parsed by `newState` and its clues are re-encoded
- **THEN** the re-encoded desc equals the original

#### Scenario: A malformed description is rejected

- **WHEN** `validateDesc` is given a desc with an over-long line, a wrong number
  of line specifications, or an invalid character
- **THEN** it returns a non-null error string

### Requirement: Pattern ports the per-line solver and gates generation on it

The port SHALL implement the per-line nonogram solver (the row/column fixpoint
that narrows each line against its run-length clue until no further cell is
forced) and a `generate_soluble` generator that produces a random grid and
accepts it only when it is **uniquely line-solvable** from its derived clues.
The solver SHALL be reused by `solve()` and `findMistakes`. Because the published
clue set is decided by the solver's verdict, the TS solver SHALL reach the same
solved/stuck verdict as the C reference on each intermediate board.

#### Scenario: Generated boards are uniquely line-solvable

- **WHEN** `newDesc` produces a board and the solver is run from its clues on an
  all-unknown grid
- **THEN** the solver completes to a single fully-determined grid (no remaining
  unknown cells, no contradiction)

#### Scenario: Solve recovers the unique grid

- **WHEN** `solve()` is invoked on a generated game
- **THEN** it returns the fully-solved `Full`/`Empty` grid

### Requirement: Pattern generation byte-matches the C reference

The port SHALL reproduce the C reference desc **exactly** for the same seed
(`newDesc(params, seed).desc` byte-for-byte) — achievable because `random.ts` is
bit-identical to `random.c` and the generator is faithful. A committed gated
differential test SHALL assert this across the presets and several seeds against
a `__fixtures__` snapshot recorded from a `puzzles/auxiliary/pattern-trace.c`
harness (the harness and `pattern.c` are deleted together at port acceptance).

#### Scenario: Desc byte-match

- **WHEN** `newDesc` is run for a preset and seed recorded in the fixture
- **THEN** the produced desc equals the fixture desc byte-for-byte

### Requirement: Pattern accepts drag-fill rectangle and cursor input

`interpretMove` SHALL reproduce upstream's input with one deliberate
divergence (drag-paint skips placed marks): a left/right/middle press begins a
drag setting the target state (`Full` / `Empty` / `Unknown`, with the
stylus-modifier cycling), a drag snaps to a single row or column (except a
middle-button `Unknown` drag, which fills a rectangle), and release emits a
`fill` move covering the dragged rectangle **only when at least one non-immutable
cell in it would change** (otherwise a UI update).

A **multi-cell paint drag** (the value is `Full` or `Empty` and the rectangle
covers more than one cell) SHALL fill only cells currently `Unknown`, leaving
already-marked cells untouched, so dragging across the board never rewrites a
mark the player already placed. A **single-cell** action SHALL overwrite the
cell (so a deliberate click can change a mark), and a **clear** drag (value
`Unknown`) SHALL still reset marked cells. This is carried by an `onlyBlank`
flag on the `fill` move, honoured by `executeMove` and previewed consistently by
`redraw`.

Keyboard cursor movement with the control/shift modifiers SHALL set cells to
`Empty` / `Full` / `Unknown` via the same rectangle move, and the cursor-select
keys SHALL cycle a cell's state. Immutable cells SHALL never be overwritten.

#### Scenario: A drag that changes cells emits a move

- **WHEN** the player left-drags across cells not all already `Full`
- **THEN** release emits a `fill` move setting the blank cells of that line to
  `Full`

#### Scenario: A multi-cell paint drag leaves placed marks

- **WHEN** the player drag-paints a line that crosses a cell they have already
  marked the opposite colour
- **THEN** that already-marked cell keeps its colour and only the blank cells of
  the line are painted

#### Scenario: A single click still overwrites a mark

- **WHEN** the player clicks a single already-marked cell with the other paint
  button
- **THEN** the cell takes the new colour

#### Scenario: A no-op drag produces no move

- **WHEN** the player drags over cells that already hold the target state (or are
  all immutable)
- **THEN** no history-affecting move is produced

### Requirement: Pattern renders clues, the error overlay, and mistakes

`redraw` SHALL draw the grid, the row/column clue numbers, the cursor, and the
drag-rectangle preview, and SHALL drive the solve-completion flash. When a line
is fully determined (no `Unknown` cells) but its runs contradict its clue, that
line's clue numbers SHALL be drawn in the error colour (upstream `check_errors`).
The game SHALL implement `findMistakes(state)`: every player-marked cell whose
`Full`/`Empty` value contradicts the unique solution is flagged (an `Unknown`
cell is never flagged), rendered with the `COL_MISTAKE` overlay. Every overlay
that is not part of the packed cell value (mistake highlight, per-line error
flag) SHALL be included in the render cache diff key so it repaints on the frame
it is computed.

#### Scenario: A contradicting completed line shows red clues

- **WHEN** a row is fully filled in but its black runs do not match its clue
- **THEN** that row's clue numbers are drawn in the error colour

#### Scenario: Check & Save flags a wrong cell

- **WHEN** `findMistakes` runs on a board with a cell marked `Full` where the
  unique solution is `Empty`
- **THEN** that cell is returned as a mistake and rendered with the mistake
  overlay on the next redraw

### Requirement: Pattern is parity-gated, then served from TS with its C deleted

The game SHALL first be registered (added to the TS-ported id list and imported
so `registerGame` runs) for owner smoke-testing while `puzzles/pattern.c` remains
the catalog/wasm source via the empty-registry fallback. Only on owner-accepted
full behavioural parity (rendering, animation, input) SHALL the game's
`puzzle()` gain `TS_PORTED` (keeping catalog/icon metadata, building no wasm) and
`puzzles/pattern.c` be deleted, in the same commit that archives this change.

#### Scenario: Registered game serves the TS implementation

- **WHEN** `pattern` is present in the runtime registry
- **THEN** the midend serves the TS `Game` implementation rather than the
  C/WASM path

#### Scenario: C deletion is gated on owner acceptance

- **WHEN** owner acceptance of full parity has not yet happened
- **THEN** `TS_PORTED` is not set and `puzzles/pattern.c` is not deleted

