## ADDED Requirements

### Requirement: The engine provides a shared raised-bevel drawing helper

The engine SHALL provide `drawRaisedBevel(dr, bounds, highlight, lowlight)` in
`src/engine/draw.ts`, where `bounds` is the tile body's pixel box
(`{ left, top, right, bottom }`, edges inclusive) and `highlight`/`lowlight` are
the two palette colors. It SHALL draw the raised block — a bottom-right lowlight
triangle and a top-left highlight triangle, lowlight first — in one canonical
winding. Games that draw a raised tile SHALL call this helper, each supplying
its own tile body, instead of re-deriving the triangles locally. The inner fill
that covers the triangles' middle SHALL remain at the call site, because its
color and inset are the game's own.

The engine SHALL also provide `raisedBevelWidth(tileSize)`, returning
`max(1, floor(tileSize / 16))`, and games drawing a raised tile SHALL size their
inner fill's inset from it rather than from a private divisor. The `max(1, …)`
floor is normative: without it the inset reaches zero at small tile sizes and
the inner fill covers both triangles, so the bevel disappears rather than
thinning.

#### Scenario: A raised-tile game draws its bevel through the helper

- **WHEN** a game with a raised tile (e.g. Fifteen, Sixteen, Mines, Inertia,
  Sokoban, Pegs) draws a tile
- **THEN** it calls `drawRaisedBevel` with that tile's own bounds and its
  highlight/lowlight colors
- **AND** it insets its own inner fill by `raisedBevelWidth(tileSize)`
- **AND** the two filled triangles cover the same pixels the game's prior
  private copy did (a filled triangle is winding-independent, so traversal order
  does not change the filled region)

#### Scenario: A game whose bevel is not two triangles keeps its own

- **WHEN** a game draws a beveled shape that is not the two-triangle block —
  Twiddle's four trapezoids meeting a center point, each taking its own
  cursor-highlight color and rotating during its animation
- **THEN** it SHALL NOT be expressed through this helper, and keeps its own
  drawing code

#### Scenario: No game re-derives the bevel

- **WHEN** the collection's game sources are scanned for an adjacent pair of
  `drawPolygon` calls filled with the bare `COL_LOWLIGHT` and `COL_HIGHLIGHT`
  constants
- **THEN** the set is empty
- **AND** the scan reports how many sources it read, so it cannot pass by
  matching nothing
