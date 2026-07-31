# ts-engine Specification Delta — colour-tokens-per-scheme

## ADDED Requirements

### Requirement: A game contains no colour value

A game SHALL NOT contain a colour value. Every colour a game shows SHALL be a named
reference to a shared colour token, or the result of a shared function whose inputs are
such tokens.

The second form exists because some colours are genuinely *relative* to another colour —
a bevel highlight is a function of the surface it sits on, a pencil mark is a function
of the board it is written on, and an interpolated ramp is a function of its endpoints.
Requiring literal values for these would replace one correct line of arithmetic with
many authored values that must then be kept consistent by hand.

A game's palette SHALL depend on nothing but the frontend background: no game requires
a colour computed from its parameters or its state. A game MAY choose **which** token to
draw with based on its state; that is selection, not computation.

#### Scenario: A colour is referenced, never written

- **WHEN** a game builds its palette
- **THEN** each entry is a token reference or a call to a shared derivation
- **AND** the game source contains no colour value of its own

#### Scenario: A relative colour is derived from tokens

- **WHEN** a colour's meaning is defined relative to another colour, such as a bevel
  against its surface
- **THEN** it is produced by a shared function whose inputs are tokens
- **AND** it is not authored as an independent value per game

### Requirement: A colour token defines a value per colour scheme

A colour token SHALL define its value for **each colour scheme the app offers**, chosen
for what the token means to the player under that scheme rather than converted from
another scheme's value by a general formula.

A token MAY leave a scheme's value unstated, in which case it SHALL be adapted by
calculation, so that schemes can be authored incrementally. A token's name SHALL
describe its **meaning**, not its appearance, since its appearance differs between
schemes.

Changing a scheme's appearance SHALL be possible by editing the token table alone, and
adding a colour scheme SHALL require no change to any game.

#### Scenario: A scheme is restyled without touching a game

- **WHEN** a scheme's values are changed in the token table
- **THEN** every game that references those tokens shows the new colours
- **AND** no game source is modified

#### Scenario: A scheme is added

- **WHEN** a new colour scheme is introduced
- **THEN** it is defined by giving tokens their values for that scheme
- **AND** no game source is modified

#### Scenario: An unstated scheme value falls back

- **WHEN** a token does not state a value for the active scheme
- **THEN** its value is calculated from a scheme it does state
- **AND** the game renders correctly
