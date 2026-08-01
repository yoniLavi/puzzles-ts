# ts-migration — delta

## ADDED Requirements

### Requirement: A shared declarative helper is adopted by every game it fits

Every game that an engine-provided declarative-table helper fits SHALL use it,
and a game that does not SHALL have its reason recorded. The helpers in question
emit tables a game would otherwise hand-write: `dimensionParamConfig()` for
width/height params, and the pencil-mark preference set for latin-family games.

A partially-adopted helper is worse than none. `dimensionParamConfig()` shipped
to make the Custom-params dialog consistent and was used by 33 games while 11
hand-wrote the identical table, which means a change to the dialog's width/height
handling silently reaches 33 games and not the other 11. The same shape appears in
the pencil-mark preferences, where the **wording a player reads** was duplicated
across four games.

A game SHALL NOT have its params fields renamed to fit a helper. Where a game
spells its dimensions differently, either the helper is widened to accept an
accessor or the game keeps its own table with the reason recorded — contorting
game-specific code to fit a shared contract is the failure this project's
refactoring guardrails exist to prevent.

Adopting such a helper SHALL be a no-op: these tables are consumed by the
Custom-params and preferences dialogs, never by a solver, generator or
description codec, so no differential or render snapshot may move.

#### Scenario: A new port declares its params config

- **WHEN** a newly ported game with width and height params declares
  `paramConfig`
- **THEN** it calls `dimensionParamConfig()` rather than writing the table
- **AND** its Custom-type dialog behaves identically to every other game's

#### Scenario: A helper does not fit a game

- **WHEN** a game's params spell their dimensions differently from the helper's
  constraint
- **THEN** either the helper gains an accessor parameter, or the game keeps its
  own table with the reason recorded
- **AND** the game's fields are not renamed to satisfy the helper

#### Scenario: A dialog-only change is verified where the suite cannot see it

- **WHEN** a change alters a `paramConfig` or preference declaration
- **THEN** the affected dialogs are opened and checked in a browser
- **BECAUSE** a regression here surfaces as an empty or mislabelled dialog, which
  no unit test observes — the failure that made `add-ts-custom-params-config`
  necessary in the first place
