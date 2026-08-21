# ts-engine Specification Delta — reject-unrecognised-moves

## ADDED Requirements

### Requirement: A game rejects a move it cannot play, rather than guessing

`Game.executeMove` SHALL reject a move that its dispatch does not recognise, by
throwing an error naming the game and the move. It SHALL NOT return a state it
did not compute from that move, SHALL NOT return a non-state, and SHALL NOT
treat the move as a no-op.

The move reaching `executeMove` is not guaranteed to be a member of the game's
move union: `SaveEnvelope.moves` is `unknown[]` and is cast on replay, not
parsed, so a save written by another build supplies an off-union value that type
checking cannot exclude.

Where the game's move type is a discriminated union, the dispatch SHALL be
written so that an unhandled union member is a **compile-time** error — a
`switch` whose catch-all binds the move to `never` (`assertNever`). A bare
`default` that throws is insufficient, because its presence makes the function
total for the type checker and so surrenders the exhaustiveness guarantee it was
added to reinforce.

Where a game's move is not a union, it SHALL validate the fields its dispatch
depends on and throw in the same form.

#### Scenario: A move from another build is refused, not misread

- **WHEN** a saved game is replayed whose move log contains a move this build's
  dispatch does not recognise
- **THEN** `executeMove` throws an error naming the game, the midend refuses the
  save, and the board is left playable

#### Scenario: An unrecognised move is never silently ignored

- **WHEN** such a move is replayed in a game whose dispatch previously had a
  tolerant catch-all
- **THEN** the save is refused rather than loaded as a board differing from the
  one that was saved

#### Scenario: Adding a move type without handling it fails to compile

- **WHEN** a member is added to a game's move union and no dispatch arm handles it
- **THEN** the type checker reports the error at that game's `executeMove`
