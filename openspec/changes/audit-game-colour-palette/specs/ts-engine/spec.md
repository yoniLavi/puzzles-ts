# ts-engine Specification Delta — audit-game-colour-palette

## ADDED Requirements

### Requirement: The engine provides a shared semantic colour palette

The engine SHALL provide a shared module of **semantic colour roles** — the colours
that mean something to the *player* — alongside the existing structural
`colour-mkhighlight` helpers. A role SHALL be defined in exactly one place, and every
game SHALL obtain its player-facing colours from there rather than writing an RGB
triple.

A role SHALL be declared in one of two forms, chosen by whether it must survive the
app's dark-mode adaptation:

- an **absolute** colour, for a role whose purpose is to be unmistakable regardless of
  the board (the error/mistake colour);
- a **function of the frontend background**, for any role that must stay legible
  *against the board*. This is required, not stylistic: the app passes a game **pure
  white** as its default background in dark mode, so a fixed pale colour that reads
  correctly in light mode can otherwise land on the background in dark mode.

A colour SHALL be a shared role only where **two or more games use it to mean the same
thing to the player**. A colour that belongs to one game's visual identity, or that is
a member of that game's own enumerated set whose job is to be distinguishable from the
set's other members (peg colours, region colours, tile colour sets, per-number digit
colours), SHALL remain game-local — but SHALL be **declared** as such rather than left
undeclared.

The engine SHALL NOT duplicate the structural background/highlight/lowlight
derivation, which the `mkhighlight` helpers continue to own.

#### Scenario: Two games needing the same cue get the same colour

- **WHEN** two games render the same player-facing cue (a hint, a flagged mistake, a
  keyboard cursor)
- **THEN** both obtain that colour from the same role
- **AND** neither contains a literal colour value for it

#### Scenario: A role that must stay legible is derived from the background

- **WHEN** a background-derived role is resolved against a light host background and
  against the pure white the app supplies in dark mode
- **THEN** the resulting colour is visibly distinct from that background in both cases

#### Scenario: A game-specific colour set stays game-specific

- **WHEN** a game's colours form its own enumerated set whose members must be
  distinguishable from each other rather than carrying a meaning that recurs elsewhere
- **THEN** those colours remain defined by that game
- **AND** they are declared as game-local, so the declaration is a recorded decision
  rather than an omission

### Requirement: A game's palette contains no undeclared colour

The suite SHALL fail when any registered game's palette contains a colour that is
neither traceable to a shared role or the `mkhighlight` trio, nor listed as a declared
game-local colour for that game.

The failure mode this guards is **silent divergence**: a hand-written colour is
invisible to a render snapshot (which records whatever the game emits) and to a
targeted op assertion (which names the game's own constant), so without this guard a
new colour, or a second spelling of an existing role, can enter the collection with
nothing objecting.

#### Scenario: An undeclared colour fails the suite

- **WHEN** a game's palette gains a colour that is neither a shared role nor declared
  game-local
- **THEN** the suite fails, naming the game and the colour
- **AND** it passes once the colour is either mapped to a role or declared game-local

### Requirement: A game's palette index order is stable

A game's palette SHALL keep its colour indices stable: the app's per-puzzle dark-mode
adjustments (`paletteOverrides` and `paletteSwaps`) are keyed by **colour index**, so
reordering a palette silently re-targets them — the game then renders correctly in one
colour scheme and incorrectly in the other, with nothing failing.

A game that needs an additional colour SHALL **append** it past the indices its
upstream colour enum defines, rather than inserting or reordering. Changing a colour's
*value* is permitted; changing its *position* is not.

#### Scenario: Adopting a shared role does not move a colour

- **WHEN** a game replaces a literal colour with a shared role
- **THEN** that colour keeps the palette index it had
- **AND** any per-puzzle dark-mode adjustment for that index continues to apply to the
  same colour

#### Scenario: A new colour is appended

- **WHEN** a game needs a colour its upstream enum does not define
- **THEN** it is appended past the upstream indices, leaving every existing index
  untouched
