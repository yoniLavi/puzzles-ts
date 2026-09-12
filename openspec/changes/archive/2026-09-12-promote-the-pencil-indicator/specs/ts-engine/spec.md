## ADDED Requirements

### Requirement: The engine owns the pencil-mode indicator, not only its glyph
The engine SHALL provide the whole pencil-mode indicator — the background box,
the glyph, and the invalidation of that box — so that a game supplies only what
is its own: where the indicator sits and which palette indices it uses. A game
SHALL NOT write the paint-and-invalidate sequence itself.

The engine SHALL also own the repaint decision, taking the game's own
first-frame flag as an input, so that the indicator's cache is written once
rather than once per game.

#### Scenario: a game places the indicator and says nothing else about it

- **GIVEN** a game that offers a pencil mode and has chosen a box for its
  indicator
- **WHEN** it renders a frame
- **THEN** it names the box, the mode and its own three palette indices, and the
  engine paints, skips or erases accordingly
- **AND** the box is invalidated whenever it is painted, without the game
  arranging that

#### Scenario: the mode changes on a draw state that has already painted

- **GIVEN** a draw state that has painted at least one frame with the mode off
- **WHEN** the player turns pencil mode on and the game redraws
- **THEN** the glyph appears
- **AND** turning it off again erases the glyph on the following frame

### Requirement: A repaint cue belongs in the tile cache before a sidecar
Where a cue can be expressed as a bit in a game's existing per-tile cache key,
the game SHOULD express it that way rather than adding a second cache keyed on
its own scalar. A second cache is a second key, and a key that stops naming one
of its inputs fails silently — the cue simply never repaints.

A game SHALL add a sidecar cache only where the cue has no tile to live in, and
SHALL then name every input the painter reads in that cache's key.

#### Scenario: a cue that has a tile available

- **GIVEN** a cue whose position coincides with a tile the game already caches
- **WHEN** the game renders it
- **THEN** it packs the cue into that tile's key rather than comparing a scalar
  on the draw state
