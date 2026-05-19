## MODIFIED Requirements

### Requirement: Per-game hybrid; C deleted per game

The build SHALL support a per-game hybrid: each game is served either
by its C/WASM implementation or by its TS port, independently of
other games.

A game SHALL be registered as TS-served (and its `TS_PORTED` catalog
marker set) ONLY once its TS port has been verified at **full
behavioural parity** with the C build — including rendering,
animation, and input, not merely internal state transitions. Parity
verification SHALL include owner acceptance testing; a green automated
suite is necessary but NOT sufficient (a suite asserting only state
transitions can be fully green while the game does not render). Until a
game is verified at parity it SHALL remain unregistered and run on
C/WASM (the empty-registry path is the fallback mechanism — no new
switch is required).

A game's C source SHALL be deleted only AFTER it has been registered
under the parity rule above — C deletion is per game and follows
parity verification, NOT merely "the port compiles and tests pass".
The C/WASM path SHALL remain the runtime for every not-yet-parity
game until then. The collection is fully migrated when the last game
is ported; only then does `puzzles/` go away entirely.

A shortfall in a ported game's parity (rendering, animation, input,
or behaviour) SHALL NOT be characterised as "cosmetic", "out of
scope", or otherwise deferred without explicit owner approval; it is a
parity regression that blocks registration.

#### Scenario: Unported games keep working during the migration

- **WHEN** some games have TS ports and others do not
- **THEN** ported games run their TS implementation
- **AND** unported games run their C/WASM implementation
- **AND** the app presents both uniformly to the user

#### Scenario: A port that is not yet at parity stays on C

- **WHEN** a game's TS port passes the automated suite but has not
  been owner-verified at full behavioural parity (e.g. rendering or
  animation is incomplete)
- **THEN** it is NOT registered and NOT marked `TS_PORTED`
- **AND** the game continues to run on C/WASM
- **AND** its C source is NOT deleted

#### Scenario: C for a game is removed only after parity registration

- **WHEN** a game's TS port has been verified at parity and registered
- **THEN** that game's C source is deleted from `puzzles/`
- **AND** the deletion does not wait for other games to be ported
