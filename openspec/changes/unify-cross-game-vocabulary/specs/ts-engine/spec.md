# ts-engine Specification Delta — unify-cross-game-vocabulary

## ADDED Requirements

### Requirement: One keyboard-cursor vocabulary across games

A game with a keyboard cursor on a bounded grid SHALL hold it in the engine's
shared cursor shape — a position and a visibility flag — under one canonical
`Ui` field, rather than naming either itself.

The cursor SHALL be revealed **and** moved by the same press, so a keyboard
player never spends a keypress on the reveal. A pointer press SHALL hide it.

What a game does *while* the cursor moves SHALL remain entirely its own: a game
may paint, fill a line, or refuse a step, and the shared shape SHALL NOT grow to
cover any of it. A genuinely different **traversal** — a half-grid cursor,
corner-skipping, a lock mode — likewise stays per-game. The shared part is the
noun; the verb is the game's.

The engine SHALL fail the build for a game that declares its own
cursor-visibility field, and the check SHALL derive the vocabulary from the
engine's own exports rather than from a hand-written list, so it covers a
helper added later without anybody remembering to extend it.

#### Scenario: One arrow press both reveals and moves

- **WHEN** a player presses an arrow key on a board whose cursor is hidden
- **THEN** the cursor becomes visible **and** has moved one cell

#### Scenario: A game keeps what it does while moving

- **WHEN** a game paints or fills as its cursor traverses
- **THEN** that behaviour is unchanged by the shared cursor shape, which reports
  only where the cursor is and whether it is visible

#### Scenario: A private cursor field fails the build

- **WHEN** a game declares its own cursor-visibility field instead of using the
  shared shape
- **THEN** the guard fails, naming the file and line

### Requirement: One completion vocabulary across games

Every game's state SHALL express "the player has solved this" and "a solver was
used" under the same two names, so that the engine can derive from them rather
than sniffing each game's spelling.

Any game whose win celebration is the collection's convention — flash once, on a
fresh un-cheated unsolved→solved transition — SHALL use the shared helper rather
than restating the condition. A game MAY keep its own celebration hook, but only
for a genuine difference: more than one flashing outcome, a duration that is not
the shared one, or a condition that is not "became solved". **A differently
spelled flag SHALL NOT be a reason to keep one**, because it is not a difference
a player can see.

#### Scenario: The convention is not restated

- **WHEN** a game's win flash is the collection's convention
- **THEN** it calls the shared helper, and contains no hand-written copy of the
  transition condition

#### Scenario: A genuine celebration keeps its own hook

- **WHEN** a game flashes on more than one outcome, or for a different duration
- **THEN** it keeps its own hook, and records which of those reasons applies
