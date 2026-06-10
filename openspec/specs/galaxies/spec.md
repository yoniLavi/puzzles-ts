# galaxies Specification

## Purpose
TBD - created by archiving change add-galaxies-ts-port. Update Purpose after archive.
## Requirements
### Requirement: Galaxies is served by the native TS engine

The `galaxies` puzzle SHALL be implemented as a native TS `Game`
registered in the engine registry, so the worker serves `galaxies`
via the TS midend and not via C/WASM. Its C source SHALL be deleted
from `puzzles/` (per the `ts-migration` per-game C-deletion rule).
Registration and C deletion SHALL be the last steps in the change,
gated on owner acceptance of full behavioural parity with the C
build per `ts-migration` "Per-game hybrid; C deleted per game". All
other catalog games SHALL continue to load via the existing C/WASM
path in the same session.

#### Scenario: Galaxies loads on the TS engine, others on C/WASM

- **WHEN** the app opens `galaxies`
- **THEN** it is constructed by the TS-midend-backed puzzle
- **AND** opening any non-ported game in the same session still uses
  its C/WASM implementation
- **AND** `puzzles/galaxies.c` no longer exists

### Requirement: Galaxies parameters and presets

Galaxies SHALL support a width, a height, and a difficulty of
`Normal` or `Unreasonable`. It SHALL offer the presets 7×7, 10×10,
15×15 in each of Normal and Unreasonable. Parameter decoding SHALL
accept the upstream lenient forms (`"7"` ⇒ 7×7, `"7x7"`, optional
trailing `dn`/`du` for difficulty); encoding SHALL round-trip a
decoded parameter set. Invalid parameters (width or height < 3, or
unreasonably large) SHALL be rejected with a human-readable reason.

#### Scenario: Preset and game-ID parameters select a board

- **WHEN** a Galaxies preset or a `params:desc` / `params#seed` game
  ID is chosen
- **THEN** the engine produces a Galaxies board of the requested
  size and difficulty
- **AND** `"7"`, `"7x7"`, `"7x7dn"`, and `"7x7du"` all decode to the
  expected parameters

### Requirement: Galaxies generates uniquely-solvable boards at the requested difficulty

For every preset, `newDesc` SHALL produce a board whose layout of
dots admits exactly one valid tile-to-dot association under
180°-rotational-symmetry-around-each-dot, and whose minimum solver
difficulty matches the requested `Normal` or `Unreasonable`. The
generator SHALL retry until the solver-verified difficulty matches;
boards that the solver diagnoses as `Ambiguous`, `Impossible`, or
at a different difficulty than requested SHALL NOT be returned.

#### Scenario: Generated boards are uniquely solvable at the right difficulty

- **WHEN** a Galaxies board is generated for any preset
- **THEN** the TS solver run at the requested difficulty completes
  the board
- **AND** the solver diagnosis is exactly the requested difficulty
  (neither lower, nor `Ambiguous`, nor `Impossible`)

### Requirement: Galaxies solver and play

The Galaxies solver SHALL implement the upstream difficulty-graded
deduction chain — `solver_obvious`, lines-opposite,
spaces-oneposs, expand-from-dot, extend-exclaves — and, for
`Unreasonable`, bounded recursion. It SHALL return one of
`Normal`, `Unreasonable`, `Ambiguous`, `Impossible`, or
`Unfinished`. `executeMove` SHALL be pure (return a new state) for
every move type: edge toggle (`E`), add-association during a drag
(`A`/`a`), remove-association with opposite (`U`), dot-hold toggle
(`M`), and solver application (`s`). Moving the keyboard cursor
SHALL redraw without adding a history entry. The game SHALL report
`solved` when every edge-bounded component matches its dot's
associations under the required symmetry; the status SHALL be
upgraded to `solved-with-help` if the solver was used to get there.

#### Scenario: Solving and completion

- **WHEN** the player completes the partition matching every dot's
  associated tiles
- **THEN** the game status becomes `solved`
- **AND** if the built-in solver was used to get there it is
  `solved-with-help`

#### Scenario: Unsolvable hand-entered position

- **WHEN** the solver runs on a position with no consistent
  association
- **THEN** it reports `Impossible` rather than returning a move

#### Scenario: Drag-to-associate emits a sequence of moves

- **WHEN** the player presses on or near a dot, drags through nearby
  tiles, and releases
- **THEN** each crossed tile produces an `assoc` move bound to that
  dot, and release toggles the dot-hold off
- **AND** undo reverses one association at a time

### Requirement: Galaxies rendering, animation, and text format

Galaxies SHALL render the subcell grid, tile fills coloured by
association, white and black dots, set edges, association arrows
from each associated tile to its dot, and the keyboard cursor
through `GameDrawing`. A dot move on the board SHALL animate the
dot along the same path the C build animates (the `movedot_cb`
shortest-path). Completion SHALL trigger a flash. The game SHALL
provide a statusbar string reporting move count, completion state,
and current-puzzle difficulty when known, and a plain-text format
of the board. Colours SHALL be derived from the supplied default
background; the engine SHALL emit no pixels of its own — the
Galaxies `redraw` owns its background fill in the `!ds.started`
branch (per the `fix-flip-canvas-reshape` doctrine).

#### Scenario: Galaxies renders and animates through the engine

- **WHEN** Galaxies is played through the app
- **THEN** moves render correctly, dot moves animate along their
  path, completion flashes, the statusbar shows move count /
  completion / difficulty wording, and the palette is derived from
  the host background
- **AND** the board has a correct plain-text representation
- **AND** no pixel is painted outside what Galaxies' `redraw`
  declares

### Requirement: Galaxies has a dev-time differential spot-check

An advisory, non-gating differential check SHALL be available that
generates Galaxies boards from the C build and the TS port for the
same seed and parameters and surfaces differences for human review.
A frozen-snapshot, C-free, **gated** form SHALL also exist: a
committed snapshot of N C-built reference boards under
`__fixtures__/galaxies-c-reference.json`, against which the gated
test asserts that the TS port decodes the board and that its solver
finds **exactly one** solution at the C-recorded target difficulty
(no `Ambiguous`, no diagnosis at a different level). Boards produced
by the TS *generator* MAY differ from C byte-for-byte (the idiomatic
generator is allowed to diverge); such a difference SHALL be
reported as review signal, not a failure. The live (C-running)
advisory check SHALL NOT be part of the commit/CI gate.

#### Scenario: Differential check is advisory; gated check verifies uniqueness

- **WHEN** the live Galaxies differential check runs
- **THEN** divergent C-vs-TS boards are reported for human review,
  and every sampled TS-generated board is uniquely solvable at the
  requested difficulty
- **AND** the result does not gate the build or commit

- **WHEN** the gated `galaxies-differential.test.ts` runs against
  the frozen C-reference snapshot
- **THEN** every reference board is decoded by the TS port and the
  TS solver reports a unique solution at exactly the snapshot's
  recorded difficulty

### Requirement: Galaxies detects and highlights mistakes

Galaxies SHALL implement the engine's `findMistakes` hook. It SHALL
recover the puzzle's unique solution by solving a cleared copy of the
state (dots only) to its canonical tile→dot partition, then SHALL flag,
covering **both** ways the game is played:

- every **tile** the player has associated (`F_TILE_ASSOC`) with a dot
  different from the solution's dot for that tile; and
- every interior **wall** the player has set (`F_EDGE_SET`) whose two
  adjacent tiles the unique solution assigns to the **same** region (a
  boundary drawn inside a single galaxy).

Tiles the player has not yet associated and walls the player has not
drawn SHALL NOT be flagged — they are incomplete, not mistaken. If the
cleared copy does not solve to a unique solution (only possible for a
hand-entered non-unique board), Galaxies SHALL flag nothing.

Galaxies SHALL render the flagged tiles and walls with a distinct
mistake highlight, drawn while the engine supplies the mistake list and
cleared on the next transition by the engine's mistake lifecycle.

> Wall detection is essential, not optional: Galaxies is commonly played
> by drawing region boundaries with no association arrows at all, and a
> mistake-check blind to walls would let a wrong wall-only board pass as
> clean.

#### Scenario: A wrong association is flagged

- **WHEN** the player associates a tile with a dot other than the one the
  unique solution assigns it, and invokes mistake-checking
- **THEN** Galaxies flags exactly that tile (and its 180° partner if the
  player likewise mis-associated it) and the renderer highlights it

#### Scenario: A correct partial board is clean

- **WHEN** every association the player has made matches the solution,
  though the board is not yet complete
- **THEN** Galaxies flags no cells and mistake-checking reports zero

#### Scenario: A wall inside a single region is flagged

- **WHEN** the player draws an interior wall between two tiles that the
  unique solution places in the same region, and invokes mistake-checking
- **THEN** Galaxies flags that wall and the renderer highlights it in the
  mistake colour — even when the board has no association arrows at all

#### Scenario: A wall on a true region boundary is clean

- **WHEN** the player draws an interior wall that the unique solution
  also has (a real boundary between two different regions)
- **THEN** Galaxies does not flag it

#### Scenario: A solved board is clean

- **WHEN** the player has completed the board correctly
- **THEN** mistake-checking reports zero (and the engine's lifecycle has
  already cleared any prior highlight on the solving move)

