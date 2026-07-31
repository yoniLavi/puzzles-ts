# ts-engine Specification Delta — hand-author-dark-palette

## ADDED Requirements

### Requirement: A colour role carries a value for each colour scheme

A shared colour role SHALL define its value for **each colour scheme the app offers**,
authored rather than derived. A scheme's value SHALL be chosen for what the role means
to the player against that scheme's background, not computed from the other scheme's
value by a general formula.

A colour that is **not** a shared role SHALL still be adapted by calculation. That
calculation SHALL preserve the colour's relationship to its own background across
schemes: a colour close to the background in one scheme SHALL be close to the
background in the other, and a colour far from it SHALL stay far from it. The failure
this forbids is a subtle tint of the board becoming a prominent area of colour purely
because the scheme changed.

The engine SHALL resolve a palette for a requested scheme before that palette leaves
the engine, because the association between a colour and its role cannot be assumed to
survive transfer to the frontend.

#### Scenario: A role's dark value is the authored one

- **WHEN** a game's palette is resolved for a scheme in which one of its colours comes
  from a shared role
- **THEN** that entry is the role's authored value for that scheme
- **AND** it is not the role's other-scheme value passed through a conversion

#### Scenario: A game-local colour keeps its relationship to the board

- **WHEN** a game-local colour that is close in lightness to the game's background is
  resolved for the opposite scheme
- **THEN** it remains close in lightness to that scheme's background

#### Scenario: A palette is resolved before it reaches the frontend

- **WHEN** the frontend requests a game's palette for a scheme
- **THEN** it receives resolved colour values
- **AND** it does not need to know which entries came from roles in order to display
  them correctly

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
