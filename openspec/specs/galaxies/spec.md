# galaxies Specification

## Purpose
Galaxies, the puzzle of dividing a grid along its edges into regions that each
have two-way rotational symmetry about the one dot they contain. This capability
specifies its port to the TS engine, with uniquely solvable boards at each
difficulty, a two-way drag that assigns squares to dots, mistake highlighting,
and a deduction hint narrated in terms of which dot a square belongs to.
## Requirements
### Requirement: Galaxies is served by the native TS engine

The `galaxies` puzzle SHALL be implemented as a native TS `Game`
registered in the engine registry, so the worker serves `galaxies`
via the TS midend and not via C/WASM. Its C source SHALL be deleted
from `puzzles/` (per the `ts-migration` per-game C-deletion rule).
Registration and C deletion SHALL be the last steps in the change,
gated on owner acceptance of full behavioral parity with the C
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

The association drag SHALL be reachable from **either** mouse button
and from the keyboard, and SHALL run in **either direction** — from a
dot out to a cell, or from a cell back to the dot that owns it.
Because the left button carries both meanings, a left press SHALL be
resolved by what follows it: a release close to the press toggles an
edge, and travel beyond a small slop starts an association drag from
the press point instead. A press that ends far from where it began
SHALL commit nothing at all — that is the shape the frontend's
pointer-cancellation synthesizes, and it must not toggle an edge on
the far side of the board.

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

#### Scenario: Drag-to-associate commits the previewed pair

- **WHEN** the player presses on or near a dot (or on a tile with an
  existing arrow), drags, and releases
- **THEN** the release commits the snapped target the preview showed —
  the target tile and its 180° partner associate to the dot as one
  move, and undo reverses it as one step
- **AND** a release where nothing can commit (the source, off the
  board, or an uncommittable tile) removes the dragged arrow if one
  existed and otherwise adds **no** history entry

#### Scenario: The left button distinguishes a click from a drag

- **WHEN** the player presses the left button and releases it without
  moving
- **THEN** the nearest legal edge toggles, exactly as a left click
  always has
- **AND WHEN** the player presses and then moves beyond the slop
- **THEN** an association drag begins from the press point and the
  release commits it, toggling no edge

#### Scenario: Only an association some galaxy could contain is offered

- **WHEN** the player aims a drag at a (cell, dot) pair
- **THEN** it is offered only if the cell is reachable from the dot by a
  connected, 180°-symmetric region that avoids every other dot's own
  tiles — the rules of a galaxy, applied to the offer
- **AND** the check SHALL depend on the dot layout alone, not on the
  player's own walls or arrows, so that it can never refuse an
  association the puzzle's solution contains and one mistake cannot
  silently veto a correct arrow elsewhere
- **AND** it SHALL go no further than those rules: running the deduction
  chain would narrow the offer towards the unique solution, which is not
  an aid but an answer

#### Scenario: A drag from a cell finds its dot

- **WHEN** the player drags from a tile that has no dot and no arrow
- **THEN** the tile stays put and the pointer picks the dot: it snaps
  to the nearest dot within reach that a release could legally
  associate this tile with, and none when there is no such dot in
  reach
- **AND** the release commits that tile and its 180° partner to the
  picked dot as one move, or nothing at all if no dot was picked
- **AND** a press on a tile that already carries an arrow keeps its
  existing meaning — the arrow is picked up and carried elsewhere

#### Scenario: A bare right click on an empty cell does nothing

- **WHEN** the player right-clicks an empty tile without dragging
- **THEN** nothing is committed — the cell→dot gesture is a drag, and
  a click must not silently associate a cell with whichever dot
  happens to be nearest

#### Scenario: The keyboard reaches both drag directions

- **WHEN** the player selects a plain tile with the cursor
- **THEN** a cell→dot drag begins, the cursor keys pick the dot by
  landing on it, and a second select commits the pair

### Requirement: Galaxies rendering, animation, and text format

Galaxies SHALL render the subcell grid, region fills colored by the
completion check (a locally-valid region — symmetric about its single
dot — is filled in its dot's color; associations do not color
tiles), white and black dots, set edges, association arrows from each
associated tile to its dot, and the keyboard cursor through
`GameDrawing`. A dot move on the board SHALL animate the dot along
the same path the C build animates (the `movedot_cb` shortest-path).
Completion SHALL trigger a flash. The game SHALL provide a statusbar
string reporting move count, completion state, and current-puzzle
difficulty when known, and a plain-text format of the board. Colors
SHALL be derived from the supplied default background; the engine
SHALL emit no pixels of its own — the Galaxies `redraw` owns its
background fill in the `!ds.started` branch (per the
`fix-flip-canvas-reshape` doctrine).

An in-progress association drag SHALL preview **discretely**: the
pointer's snapped drop-target tile and its 180° partner about the
drag dot — exactly the pair a release would commit — each showing an
arrow toward the dot in a transient color distinct from committed
arrows, with the drop target itself additionally outlined. A target
where a release would not commit SHALL show no preview. Every pixel
any transient overlay paints — the drag preview and the keyboard
cursor alike — SHALL be clipped to a tile and erased by that tile's
own repaint when it moves on: no paint outside the board, no stale
frames, and no full-board update per pointer move.

Both transient affordances SHALL use **authored** colors rather than
colors derived from the board, because a color derived from the
board is by construction not prominent against it, in either scheme.

While a cell→dot drag is in progress, every dot the cell could
legally join SHALL be ringed and the picked one emphasized — subject
to a preference, because it is a solving aid. The **gesture** SHALL
NOT be gated by that preference.

#### Scenario: Galaxies renders and animates through the engine

- **WHEN** Galaxies is played through the app
- **THEN** moves render correctly, dot moves animate along their
  path, completion flashes, the statusbar shows move count /
  completion / difficulty wording, and the palette is derived from
  the host background
- **AND** the board has a correct plain-text representation
- **AND** no pixel is painted outside what Galaxies' `redraw`
  declares

#### Scenario: The drag preview tracks discretely and cleans up after itself

- **WHEN** the player drags from a dot across several tiles and
  releases
- **THEN** at each snapped target the preview shows the target's
  arrow (outlined tile) and its 180° partner's arrow in the transient
  color, tiles the preview vacates repaint clean, and after the
  release no preview paint remains anywhere — including outside the
  board, where nothing repaints

#### Scenario: The keyboard cursor cleans up after itself too

- **WHEN** the player walks the cursor across vertices and edges
- **THEN** each cell it leaves repaints clean, and hiding the cursor
  leaves no mark anywhere on the board

#### Scenario: An uncommittable target previews nothing

- **WHEN** the drag's snapped target is a tile where a release would
  not commit (a dot tile, a tile whose 180° partner is off the board,
  or a tile inside a locally-valid region)
- **THEN** no preview is drawn — the absence is the feedback

#### Scenario: Candidate dots are ringed, and can be switched off

- **WHEN** a cell→dot drag is in progress
- **THEN** exactly the dots a release could legally commit to are
  ringed, the picked one more heavily, and the rings are erased when
  the drag ends
- **AND WHEN** the candidate preference is off
- **THEN** no rings are drawn, and the drag and its commit preview
  are unaffected

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
  mistake color — even when the board has no association arrows at all

#### Scenario: A wall on a true region boundary is clean

- **WHEN** the player draws an interior wall that the unique solution
  also has (a real boundary between two different regions)
- **THEN** Galaxies does not flag it

#### Scenario: A solved board is clean

- **WHEN** the player has completed the board correctly
- **THEN** mistake-checking reports zero (and the engine's lifecycle has
  already cleared any prior highlight on the solving move)

### Requirement: Galaxies offers a deduction-based hint in association vocabulary

Galaxies SHALL implement the engine's `hint()` hook as a recorded
projection of its own solver: the same difficulty-graded deduction chain
that generates and solves boards runs with a recorder, and each recorded
firing becomes one narrated hint journey meeting the collection's hint
quality bar (explain *why* the association is forced — the blocked
symmetric partner, the only dot whose symmetry can reach the tile —
never merely *what* to do).

A step's action SHALL be a move the game already has: the committed
association, or the wall that a settled pair of neighbors forces. A
firing that claims a cell SHALL claim its 180° partner in the **same
step** — the game commits the pair atomically, so a separate leg for the
partner would be a move that changes nothing — and the narration SHALL
state the symmetry as the reason they travel together. Because
associations alone never complete a board (only walls do), the plan
SHALL carry the deduction through to the walls it justifies, and SHALL
reach a solved board from any position it is asked from.

Evidence SHALL be highlighted as an area in the hint color legend, dots
SHALL be named by properties the player can see, rule-outs SHALL be
shown as evidence highlights rather than demanded of the player, and
equivalent moves SHALL share a color. The hint's action color SHALL be
distinct from the association drag's, which marks the same objects — a
dot and a cell — while the player follows a hint.

The hint SHALL couple to mistake checking: a request on a board with any
flagged mistake (tile or wall) refuses with the banner and lights the
mistakes instead. A stored plan SHALL survive the player working ahead:
a step whose tile the player has meanwhile associated is refreshed away
and the plan advances. Every step the hint offers SHALL be a deduction the player could make
from the board in front of them. It SHALL NOT guess: where the remaining
progress can only be found by hypothesizing a cell's dot and propagating
until something breaks, the hint SHALL refuse, and the refusal SHALL say
that deduction has run out and what the player can do instead. A Normal
board SHALL be carried all the way to solved by deduction alone; only an
Unreasonable board may reach that refusal, which is what the tier means.
Galaxies SHALL be enrolled in the cross-game hint guards
(`testing/hint-games.ts`).

#### Scenario: A forced association is taught as one step

- **WHEN** the player requests a hint on a board where a deduction forces
  a tile's dot
- **THEN** one step is shown whose narration states the forcing reason
  and whose single move associates both the tile and its 180° partner
- **AND** the evidence area and the action are drawn in the hint legend's
  two colors, neither of them the drag preview's

#### Scenario: The plan finishes the board, not just the notation

- **WHEN** hints are followed one at a time from a fresh board
- **THEN** the plan draws the walls its associations justify and reaches a
  solved board

#### Scenario: Refusal on a mistaken board

- **WHEN** a hint is requested while any tile or wall contradicts the
  unique solution
- **THEN** the hint refuses with the banner and the mistake overlay
  lights the offenders

#### Scenario: The plan survives the player committing ahead

- **WHEN** a hint journey is displayed and the player directly commits
  the association it was leading to
- **THEN** the resolved step is dropped without being shown as stale and
  the plan advances (recomputing only if it drains)

#### Scenario: Deduction running out is said plainly, not guessed past

- **WHEN** the remaining progress can only be found by trying a cell's dot
  and following it until something breaks
- **THEN** the hint refuses, saying that nothing further follows by
  deduction and that the position can be tried from a saved checkpoint —
  it does not report the survivor of a search as though it were a
  technique

#### Scenario: A Normal board is always finished by deduction

- **WHEN** hints are followed from a fresh board at the Normal tier
- **THEN** every step is a deduction whose premise is visible on the board
  as it stands, and the board reaches solved

