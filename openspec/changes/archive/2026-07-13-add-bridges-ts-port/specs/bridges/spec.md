# bridges Specification

## ADDED Requirements

### Requirement: Bridges game implements the Game interface

The engine SHALL provide a registered `bridges` game implementing
`Game<BridgesParams, BridgesState, BridgesMove, BridgesUi, BridgesDrawState, BridgesMistake>`:
connect the numbered islands on a `w × h` grid with horizontal and vertical
bridges so that each island carries exactly its number of bridge-ends, at most
`maxb` bridges join any pair of islands, bridges run only between two islands
directly in line and never cross an island or another bridge, and all islands
form a single connected group. Params SHALL be `w`, `h`, `maxb`, `islands`
(percentage island density), `expansion` (percentage), `allowloops` (boolean)
and `difficulty` (Easy / Medium / Hard). All 9 upstream presets SHALL be offered
(7×7, 10×10, 15×15 × Easy/Medium/Hard, each `maxb = 2`, `islands = 30`,
`expansion = 10`, `allowloops = true`). The game SHALL report `canSolve = true`,
`canFormatAsText = true` and `needsRightButton = true` (upstream `REQUIRE_RBUTTON`).

#### Scenario: Params round-trip

- **WHEN** params `{ w: 15, h: 15, maxb: 2, islands: 30, expansion: 10, allowloops: true, difficulty: 2 }`
  are encoded in full and decoded
- **THEN** the decoded params equal the original

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is given a grid smaller than the minimum island count
  can occupy (e.g. `3×3` at the default density)
- **THEN** it returns a non-null error string

### Requirement: Bridges descriptions encode the island clue grid

The desc SHALL encode the island positions and their bridge-counts row-major:
a digit/letter gives an island with that count at the current cell, and a
run-length letter skips that many empty cells (upstream `new_game_desc`
encoding). `newState` SHALL parse the desc into the island list, the per-cell
`G_ISLAND` flags and the reverse `gridi` index, sharing the immutable clue data
across all states of a game. `validateDesc` SHALL reject a desc that overruns the
grid, contains an out-of-range character, or places an island count that no legal
bridge configuration could satisfy at the grid edge.

#### Scenario: A description round-trips

- **WHEN** a generated desc is parsed by `newState` and the islands re-encoded
- **THEN** the re-encoded desc equals the original

#### Scenario: A malformed description is rejected

- **WHEN** `validateDesc` is given a desc whose run-lengths overrun the grid
- **THEN** it returns a non-null error string

### Requirement: Bridges ports the graded multi-stage solver faithfully

The port SHALL implement upstream `solve_sub` and its stages with the exact
deductive power of each difficulty, returning the impossible / ambiguous /
solved verdict identical to the C solver on every board. Easy SHALL run stage 1
(force bridges an island must place because its remaining count equals its
available adjacent space, and forbid bridges into a satisfied island). Medium
SHALL additionally run stage 2 (per-direction minimum/maximum reasoning using
each neighbour's own remaining capacity). Hard SHALL additionally run stage 3
(the dsf connected-subgroup deductions — forbid a bridge that would seal off a
subgroup that cannot then be satisfied, and, when `allowloops` is false, forbid a
bridge that would complete a premature loop). The solver is purely deductive
(no guess-and-verify recursion — upstream `solve_sub`'s `depth` is unused). The
solver SHALL maintain the per-cell possible/maximum-bridge counts
(`map_update_possibles`) as deductions are applied.

#### Scenario: A generated board is uniquely solvable at its difficulty

- **WHEN** a board generated at difficulty `d` is solved from the clue-only state
- **THEN** the solver returns solved at `d`, and a Medium/Hard board is not fully
  solved at the tier below it

### Requirement: Bridges generates byte-identical descriptions to the C build

The port SHALL reproduce the C description byte-for-byte for the same parameters
and seed (feasible because `random.ts` is bit-identical to `random.c` and the
Bridges generator draws only `random_upto` — no `qsort`, no `shuffle`). The
generator SHALL place a random initial island, grow the map by repeatedly
selecting an island and
direction and joining or expanding to a new island (with the exact draw order:
initial `x` then `y`; per grow step the island index, the direction index, the
expansion rolls against `expansion%`, the new-island offset, and the join count),
until the island-density target is met, then derive the clue counts and reject
boards not soluble at exactly the target difficulty, retrying until one is found.

#### Scenario: Byte-match against recorded C descriptions

- **WHEN** `newDesc` is run for each recorded preset/seed fixture
- **THEN** the produced desc equals the C-recorded desc exactly, and the TS
  solver grades each recorded board at its recorded difficulty

### Requirement: Bridges input drags bridges between islands

Left-drag from an island along its row or column to the next in-line island SHALL
add or increment a bridge between them, wrapping back to zero once `maxb` is
exceeded; the in-progress drag destination SHALL be tracked (`update_drag_dst`)
and committed on release (`finish_drag`). Right-drag along a clear span between
two islands SHALL toggle a no-line/mark on that span. Cursor keys SHALL move a
keyboard cursor, and `CURSOR_SELECT` SHALL grab and drop a keyboard drag. A drag
that does not run cleanly between two in-line islands SHALL be cancelled with no
change. No editor-only move letters are mapped.

#### Scenario: Dragging cycles the bridge count

- **WHEN** the player left-drags from an island to an in-line neighbour three
  times on a `maxb = 2` board
- **THEN** the bridge count between them goes 1, then 2, then 0

#### Scenario: An off-line drag is cancelled

- **WHEN** the player starts a drag on an island and releases where no in-line
  island lies
- **THEN** the board is unchanged

### Requirement: Bridges flags mistakes and live errors

The game SHALL draw provably-wrong state red as upstream does (an island that can
no longer reach its count via `island_impossible`, and — when `allowloops` is
false — bridges completing a forbidden loop via `map_hasloops`/`findloop`).
Because a generated board is uniquely solvable, the game SHALL additionally
implement `findMistakes`: re-solve from the island clues to the unique solution
and return every player-placed bridge the unique solution contradicts (a bridge
where the solution has none, or a count exceeding the solution's). A board that
is not uniquely solvable SHALL yield no mistakes. The live-error and
`findMistakes` overlays SHALL be distinct and both SHALL be part of the render
diff key so they repaint and clear on a later frame.

#### Scenario: A wrong bridge is flagged

- **WHEN** the player places a bridge the unique solution does not contain,
  without yet over-committing an island
- **THEN** `findMistakes` includes that bridge and Check & Save refuses to save

#### Scenario: A mistake overlay repaints on a later frame

- **WHEN** a bridge is drawn, then `findMistakes` flags it on a subsequent frame
  without that bridge's own value changing
- **THEN** the mistake overlay is painted on that later frame

### Requirement: Bridges renders to upstream parity with a show-hints preference

The renderer SHALL draw islands as circles bearing their count, single and double
bridges (horizontal and vertical), the in-progress drag preview line,
no-line/mark indicators, the keyboard cursor ring, and the win flash, using the
upstream tile geometry. The palette SHALL mirror the upstream colour enum
index-for-index (`BACKGROUND, FOREGROUND, HIGHLIGHT, LOWLIGHT, SELECTED, MARK,
HINT, GRID, WARNING, CURSOR`); the `findMistakes` overlay SHALL reuse the red
`COL_WARNING` channel (no extra palette entry), so it lives in the render diff
key and repaints clean when cleared. The game SHALL expose a `show-hints` boolean
preference (upstream `PREF_SHOW_HINTS`) through the `Game.prefs` hook; when on,
faint `COL_HINT` lines SHALL indicate forced or forbidden bridges.

#### Scenario: The show-hints preference toggles the hint overlay

- **WHEN** the `show-hints` preference is turned on
- **THEN** the renderer emits `COL_HINT` hint lines that are absent when it is off

### Requirement: Bridges auto-marks satisfied islands (fork aid)

The game SHALL offer an `auto-mark-complete` boolean preference, default on,
exposed through `Game.prefs` — a deliberate divergence from upstream, which
requires a manual click to mark an island done. When on, the renderer SHALL draw an
island whose current bridge-count equals its clue with the "done" mark background
(`DI_BG_MARK`), automatically and without any player action. This aid SHALL be
**purely visual**: it SHALL NOT set `G_MARK` or lock the island's bridges, so the
player can still edit them freely (the manual click-to-mark-and-lock behaviour is
retained and unchanged). Because a satisfied island is never `island_impossible`,
the auto-mark background SHALL never fight the red live-error foreground. The
background is part of the render diff key, so an island greys as soon as its count
is met and reverts when a bridge is removed.

#### Scenario: A satisfied island greys only when the preference is on

- **WHEN** the player brings an island's bridge-count up to its clue with
  `auto-mark-complete` on
- **THEN** that island is drawn with the done-mark background, while the same
  state drawn with the preference off shows no done-mark background, and in
  neither case is the island's `G_MARK` flag set (its bridges stay editable)
