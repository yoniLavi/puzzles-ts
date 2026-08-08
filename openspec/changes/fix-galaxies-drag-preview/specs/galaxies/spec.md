## MODIFIED Requirements

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
**any** transient overlay paints — the drag preview and the keyboard
cursor alike — SHALL be clipped to a tile and erased by that tile's own
repaint when it moves on: no paint outside the board, no stale frames,
and no full-board update per pointer move.

Both transient affordances SHALL use **authored** colours rather than
colours derived from the board, and SHALL differ from each other: a
colour derived from the board is by construction not prominent against
it, in either scheme, and the two say different things.

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

#### Scenario: Drag-to-associate commits the previewed pair

- **WHEN** the player presses on or near a dot (or on a tile with an
  existing arrow), drags, and releases
- **THEN** the release commits the snapped target the preview showed —
  the target tile and its 180° partner associate to the dot as one
  move, and undo reverses it as one step
- **AND** a release where nothing can commit (the source, off the
  board, or an uncommittable tile) removes the dragged arrow if one
  existed and otherwise adds **no** history entry
