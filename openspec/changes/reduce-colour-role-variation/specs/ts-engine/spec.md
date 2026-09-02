# ts-engine Specification Delta — reduce-colour-role-variation

One **ADDED** requirement, stating the rule every sweep in this change enforces
and the one decision that can be committed to before the per-item calls are
made: a game that departs from a shared role for a meaning the role covers says
so where it departs. The per-item outcomes (which cursor, which flash) are
recorded as they are decided, in this change's `tasks.md` and in further deltas.

## ADDED Requirements

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
