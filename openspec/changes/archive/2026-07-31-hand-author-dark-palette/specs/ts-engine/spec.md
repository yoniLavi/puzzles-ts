# ts-engine Specification Delta — hand-author-dark-palette

## ADDED Requirements

### Requirement: Adapting a colour to another scheme preserves its relation to the board

A calculated per-scheme value SHALL preserve the colour's relationship to its own
background: a colour close in lightness to the background in one scheme SHALL be close
to the background in the other, and a colour far from it SHALL stay far from it. The
failure this forbids is a subtle tint of the board becoming a prominent area of colour
purely because the scheme changed.

This SHALL hold regardless of how colourful the colour is. A rule that treats greys and
chromatic colours by different principles will make a game's near-background tints
behave unlike its near-background greys, which is that failure.

#### Scenario: A near-background tint stays near the background

- **WHEN** a colour close in lightness to the game's background is adapted to the
  opposite scheme
- **THEN** it remains close in lightness to that scheme's background

#### Scenario: Text and fills keep their order

- **WHEN** a colour drawn as text or a thin line, and a colour drawn as a large fill,
  are both adapted to a dark scheme
- **THEN** the text colour is lighter than the fill colour it may be drawn over

### Requirement: A palette may carry its own per-scheme decisions

The engine SHALL report to the frontend, **per palette index**, any decision a palette
entry makes about its own behaviour when the colour scheme changes — a decision an
entry may carry where that behaviour is a property of the colour's meaning rather than
of the game showing it. Reporting per index is required because the association between
a colour and its meaning cannot be assumed to survive transfer to the frontend.

A per-puzzle adjustment SHALL take precedence over a decision carried by the palette,
so that a game whose board needs different treatment can still state it.

#### Scenario: A colour's own decision is applied

- **WHEN** a palette entry states that it must not be adapted, and the puzzle declares
  no adjustment for that index
- **THEN** the frontend leaves that colour unchanged

#### Scenario: A per-puzzle adjustment wins

- **WHEN** a palette entry states that it must not be adapted, and the puzzle also
  declares an adjustment for that index
- **THEN** the puzzle's adjustment is applied instead

### Requirement: A colour that means "this piece is black or white" is distinct from ink and paper

The engine SHALL distinguish a colour used as **maximum-contrast foreground or surface**
(grid lines, glyphs, text, a white cell background) from a colour used to say **a game
object is black or white** (a black peg, a black mine, the filled squares of a
two-colour game).

The two SHALL NOT share a role, because they require opposite treatment when the scheme
changes: foreground and surface colours invert, so that text stays readable against the
surface it is drawn on, while a piece's black or white is the game's own meaning and
SHALL be preserved — inverting it would tell the player the piece is the other colour.

#### Scenario: Ink inverts so text stays readable

- **WHEN** a colour used for grid lines, glyphs or text is resolved for a dark scheme
- **THEN** it is light enough to read against that scheme's surface

#### Scenario: A black piece stays black

- **WHEN** a colour whose meaning is that a game object is black is resolved for a dark
  scheme
- **THEN** it remains black
- **AND** the game requires no per-puzzle adjustment to keep it black
