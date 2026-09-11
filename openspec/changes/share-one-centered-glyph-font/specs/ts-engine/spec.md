## ADDED Requirements

### Requirement: The engine provides a shared centered-glyph text-options helper
The engine SHALL provide one helper returning the text options a game uses to
draw a glyph centered in a tile, and games SHALL call it rather than writing the
option object themselves.

Centering a digit in a tile is not a decision a game makes. Measured 2026-09-12,
60 copies of the same four-field object stood in 43 game files, and one game had
already pulled it into a local helper. A game that genuinely needs different text
options writes them, as games drawing fixed-width or left-aligned text already
do; the helper covers the one shape they all share.

#### Scenario: a game draws a digit in a tile

- **WHEN** a game's renderer draws a glyph centered in a tile
- **THEN** it takes its text options from the engine helper, passing only the size
- **AND** the drawn output is identical to the literal it replaced, which the
  game's render snapshots assert

#### Scenario: a game needs different text options

- **WHEN** a game draws fixed-width or non-centered text
- **THEN** it writes the options it needs, and the helper does not grow a
  parameter to cover the case
