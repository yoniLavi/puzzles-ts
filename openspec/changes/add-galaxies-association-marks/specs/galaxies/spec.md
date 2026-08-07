## ADDED Requirements

### Requirement: Galaxies association pencil marks

Galaxies SHALL provide a pencil-grade **association mark**: a per-tile,
undoable assertion that the tile must belong to a named dot, distinct from a
committed association. Marks SHALL be ordinary moves (serialised through the
move log, restored by save replay, reversed by undo). At most one mark exists
per tile: marking the same tile–dot pair again removes it, marking a
different dot replaces it, committing a real association on the tile absorbs
its mark, and applying the solver clears all marks.

The mark SHALL be creatable by dragging between a tile and a dot in either
direction with the primary button (a plain primary click remains the edge
toggle), and SHALL be creatable, replaceable and removable by keyboard and by
touch as well (the input-parity bar). The mark SHALL render as a
pencil-grade ghost that cannot be mistaken for a committed association
arrow, and an in-progress drag preview SHALL be visually distinct from a
committed mark.

#### Scenario: Marking, replacing, and removing

- **WHEN** the player drags from an unmarked tile to a dot with the primary
  button and releases
- **THEN** the tile carries a pencil mark naming that dot, rendered as a
  ghost distinct from a committed arrow
- **AND** repeating the same drag removes the mark, and dragging to a
  different dot replaces it
- **AND** undo reverses each of these one step at a time

#### Scenario: A committed association absorbs the mark

- **WHEN** a marked tile is given a committed association (by drag or by the
  solver)
- **THEN** the pencil mark is cleared in the same move

#### Scenario: Marks survive save and load

- **WHEN** a game with marks is saved and loaded
- **THEN** every mark is restored exactly

#### Scenario: A plain click still toggles an edge

- **WHEN** the player presses and releases the primary button without
  crossing the drag threshold
- **THEN** the nearest edge toggles exactly as before this feature

## MODIFIED Requirements

### Requirement: Galaxies detects and highlights mistakes

Galaxies SHALL implement the engine's `findMistakes` hook. It SHALL
recover the puzzle's unique solution by solving a cleared copy of the
state (dots only) to its canonical tile→dot partition, then SHALL flag,
covering **all** the ways the game is played:

- every **tile** the player has associated (`F_TILE_ASSOC`) with a dot
  different from the solution's dot for that tile;
- every interior **wall** the player has set (`F_EDGE_SET`) whose two
  adjacent tiles the unique solution assigns to the **same** region (a
  boundary drawn inside a single galaxy); and
- every **association pencil mark** naming a dot different from the
  solution's dot for that tile (a wrong deduction recorded in pencil is a
  mistake exactly as a wrong placement is; a correct mark is ordinary
  mid-solve state and is not flagged).

Tiles the player has not yet associated or marked and walls the player has
not drawn SHALL NOT be flagged — they are incomplete, not mistaken. If the
cleared copy does not solve to a unique solution (only possible for a
hand-entered non-unique board), Galaxies SHALL flag nothing. The solution
SHALL be derived from the dots-only re-solve, never from the marks.

Galaxies SHALL render the flagged tiles, walls and marks with a distinct
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

#### Scenario: A wrong pencil mark is flagged and blocks Check & Save

- **WHEN** the player marks a tile as belonging to a dot other than the one
  the unique solution assigns it, and invokes mistake-checking
- **THEN** Galaxies flags that mark, the renderer highlights it, and
  Check & Save refuses to quick-save while it exists
- **AND** a mark matching the solution is not flagged

#### Scenario: A solved board is clean

- **WHEN** the player has completed the board correctly
- **THEN** mistake-checking reports zero (and the engine's lifecycle has
  already cleared any prior highlight on the solving move)
