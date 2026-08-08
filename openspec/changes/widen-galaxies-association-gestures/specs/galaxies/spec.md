## MODIFIED Requirements

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
pointer-cancellation synthesises, and it must not toggle an edge on
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

Galaxies SHALL render the subcell grid, region fills coloured by the
completion check (a locally-valid region — symmetric about its single
dot — is filled in its dot's colour; associations do not colour
tiles), white and black dots, set edges, association arrows from each
associated tile to its dot, and the keyboard cursor through
`GameDrawing`. A dot move on the board SHALL animate the dot along
the same path the C build animates (the `movedot_cb` shortest-path).
Completion SHALL trigger a flash. The game SHALL provide a statusbar
string reporting move count, completion state, and current-puzzle
difficulty when known, and a plain-text format of the board. Colours
SHALL be derived from the supplied default background; the engine
SHALL emit no pixels of its own — the Galaxies `redraw` owns its
background fill in the `!ds.started` branch (per the
`fix-flip-canvas-reshape` doctrine).

An in-progress association drag SHALL preview **discretely**: the
pointer's snapped drop-target tile and its 180° partner about the
drag dot — exactly the pair a release would commit — each showing an
arrow toward the dot in a transient colour distinct from committed
arrows, with the drop target itself additionally outlined. A target
where a release would not commit SHALL show no preview. Every pixel
any transient overlay paints — the drag preview and the keyboard
cursor alike — SHALL be clipped to a tile and erased by that tile's
own repaint when it moves on: no paint outside the board, no stale
frames, and no full-board update per pointer move.

Both transient affordances SHALL use **authored** colours rather than
colours derived from the board, because a colour derived from the
board is by construction not prominent against it, in either scheme.

While a cell→dot drag is in progress, every dot the cell could
legally join SHALL be ringed and the picked one emphasised — subject
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
  colour, tiles the preview vacates repaint clean, and after the
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
