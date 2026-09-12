## ADDED Requirements

### Requirement: A pointer drag over a grid has one name across the collection
A game whose `Ui` remembers **where a pointer drag started and where it is now**,
as a pair of integer coordinates, SHALL hold that in the engine's `GridDrag`
rather than in fields of its own naming — the same convention `GridCursor`
already carries for the keyboard cursor.

The engine SHALL own the anchor, the current position, whether a drag is running,
and the helpers that start, move and end one. A game SHALL keep its own
coordinate space, since a game may legitimately work in cells, half-cells or any
other unit, and SHALL keep everything its drag *means* — what the press picked,
what the release commits, and its own `Move` type.

#### Scenario: a game asks whether a drag is running

- **GIVEN** a game that carries a `GridDrag`
- **WHEN** it needs to know whether a drag is in progress
- **THEN** it reads one field whose meaning is the same in every game
- **AND** it does not test a coordinate against a sentinel value of its own
  choosing

#### Scenario: two games with different coordinate spaces

- **GIVEN** one game whose drag is in grid cells and another whose drag is in
  half-grid coordinates
- **WHEN** both carry a `GridDrag`
- **THEN** neither is asked to change the space it works in

### Requirement: The engine cancels a drag the board changed under
The midend SHALL end every `GridDrag` on a game's `Ui` when it replaces the game
state, so that a drag cannot act on a board that no longer holds what the drag
was aimed at.

Membership SHALL be **derived** — the midend finds a drag by what the `Ui`
carries, never by a declaration a game makes about itself — so that a game
acquires the protection by having a drag and a new game cannot forget to ask
for it.

A game that genuinely needs a drag to survive a state change SHALL say so in its
own `changedState`, with its reason recorded.

#### Scenario: an undo lands while a drag is live

- **GIVEN** a live drag on a game that declares no `changedState`
- **WHEN** the player undoes a move
- **THEN** the drag is no longer running
- **AND** the game needed to declare nothing to get that
