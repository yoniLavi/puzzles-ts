# ts-engine Specification Delta — reduce-colour-role-variation

Three **ADDED** requirements: the rule every sweep in this change enforces (a
game that departs from a shared role for a meaning the role covers says so
where it departs), the solved-flash role, and the contrast a ruled-out edge
must keep. The per-item outcomes are recorded in this change's `tasks.md`.

## ADDED Requirements

### Requirement: A ruled-out edge is discernible in both schemes

The shared "ruled out" role (`lineNoColour`) SHALL resolve to a colour a clear
step off the board in both schemes — a mid grey — and SHALL remain visibly
distinct from the completed-region fill (`correctRegionColour`) it may be drawn
across, so that a player, and in particular a keyboard player whose cursor walks
the edges, can see where a ruled-out edge lies while still reading it as
disabled rather than drawn.

#### Scenario: A ruled-out edge stands off a dark board

- **WHEN** the role is resolved for the dark scheme against the collection's
  board
- **THEN** its lightness differs from the board's by more than the undecided
  edge's did before this change (the value the owner's playtest found nearly
  invisible)
- **AND** it remains darker than ink

#### Scenario: A ruled-out edge across a completed region still shows

- **WHEN** the role and `correctRegionColour` are resolved against the same
  board in either scheme
- **THEN** the two are visibly distinct

### Requirement: The solved flash is one role

A game whose completion flash is drawn as a fill or line colour SHALL take that
colour from the shared `FLASH` role, which is maximum contrast against the
surface and inverts with the scheme. A game whose flash is an animation rather
than a colour — a bevel wave, a state swap, a colour cycle, a wash under text —
keeps its own mechanism and is not covered by this requirement.

#### Scenario: Two white-flashing games flash the same colour

- **WHEN** two games that flash their board to white on completion are resolved
  in either scheme
- **THEN** both flash colours are equal
- **AND** neither is the board's own colour in that scheme

### Requirement: A departure from a shared role is stated at the assignment

Where the shared palette defines a role for a meaning a game's colour carries
(the keyboard cursor, a held or dragged item, a flagged mistake, a hint's action
or evidence, a black or white piece, a retired clue, a correctly completed
region), the game SHALL assign that role. A game that assigns a different colour
for that meaning SHALL state, on or immediately above the assignment, why its
board has spent the role's colour — so that the departure is a recorded decision
and not an unexamined inheritance.

A cross-game check SHALL find every such departure by the shape of the
assignment rather than by the slot's name, and SHALL fail on one that carries no
reason.

#### Scenario: A game whose board has spent the cursor's green says so

- **WHEN** a game assigns its keyboard-cursor slot a colour other than the shared
  cursor role
- **THEN** the assignment carries a one-line reason naming what the role's colour
  is already used for on that board

#### Scenario: An unexplained departure fails the check

- **WHEN** a game assigns a slot whose meaning a shared role covers to a colour
  other than that role, with no reason at the assignment
- **THEN** the cross-game check names the game and the slot

#### Scenario: The check counts what it looked at

- **WHEN** the cross-game check runs
- **THEN** it reports the number of games and slots it examined and fails if that
  number is not the collection's
