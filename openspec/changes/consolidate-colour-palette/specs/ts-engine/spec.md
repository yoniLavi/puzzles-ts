# ts-engine Specification Delta — consolidate-colour-palette

## ADDED Requirements

### Requirement: The collection's colours are a small named set

The colours the collection uses SHALL be a **small named set**, sized by what the
games demonstrably need to distinguish rather than by how many colours happen to
have been written. A colour SHALL NOT be added to it because one game wants a
shade; a game that needs a colour the set does not have SHALL record what it means
to the player and why no existing colour serves.

Every colour a game shows SHALL be a reference to a **meaning** — an error, a
hint, a completed clue — except where the colour itself is the meaning: a member
of a set whose job is to be told apart from the other members, or a colour the
game names to the player.

A meaning SHALL be defined in terms of a colour from the set rather than holding a
value of its own, so that changing a colour changes every meaning built on it.

#### Scenario: A game asks for a meaning

- **WHEN** a game needs the colour for something being wrong, or for the move a
  hint is proposing
- **THEN** it references that meaning
- **AND** the meaning resolves to a colour from the named set

#### Scenario: A colour the set does not have

- **WHEN** a game needs a colour no existing meaning or named colour provides
- **THEN** the reason is recorded with the colour: what it means to the player, and
  why nothing in the set serves

### Requirement: A named colour's name is true

Where a colour is referenced **by name** rather than by meaning, the name SHALL
describe the colour as a player would, under **every** colour scheme. A scheme MAY
change such a colour's shade; it SHALL NOT change it into a colour a player would
give another name.

This exists because a name reaches the player. A hint that says "fill with yellow"
is making a claim about the board, and a scheme that renders that colour as
something else makes the game lie to the player.

#### Scenario: A hint names a colour

- **WHEN** a hint's explanation refers to a colour by name
- **THEN** the colour that name resolves to is recognisably that colour in the
  active scheme

#### Scenario: A scheme restyles a named colour

- **WHEN** a scheme gives a named colour a different value
- **THEN** the value is a different shade of the same colour
- **AND** every explanation that names it is still true

### Requirement: A set of colours meant to be told apart is designed as a set

Colours a game relies on to distinguish items SHALL be mutually distinguishable in
every scheme, and that SHALL be a property of the named set rather than of any one
game that draws from it.

Mutual distinguishability cannot be established one colour at a time: it is a
relation between members, so no rule applied to a single colour — including
adapting it to a scheme — can establish or preserve it.

#### Scenario: A scheme is added or changed

- **WHEN** a colour scheme is introduced or restyled
- **THEN** the members of the named set remain distinguishable from one another
- **AND** this is verified by measurement rather than by inspection
