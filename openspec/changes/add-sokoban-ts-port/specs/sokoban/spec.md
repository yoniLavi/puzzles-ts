# sokoban Specification Delta — add-sokoban-ts-port

## ADDED Requirements

### Requirement: Sokoban game implements the Game interface

The engine SHALL provide `src/native/games/sokoban/` implementing the `Game`
interface for Sokoban, registered so the puzzle is served by the TypeScript engine.

Sokoban SHALL support rectangular boards parameterised by width and height (both at
least 4), with the upstream presets 12×10, 16×12 and 20×16. Because Sokoban is a
non-deductive movement puzzle with no solver and no wrong-but-legal cell state, it
SHALL NOT implement `solve`, `hint` or `findMistakes`; Check & Save SHALL therefore
degrade to a plain quick-save, which is correct for a non-uniquely-solvable game.

#### Scenario: A new game produces a solvable board

- **WHEN** a new game is generated at a legal size
- **THEN** a board is produced with exactly one player and at least one barrel and
  target, and the board is solvable (it is constructed by reversing a solution)

#### Scenario: Parameters round-trip

- **WHEN** a parameter string naming a width and height is encoded and decoded
- **THEN** the same width and height are recovered, and a bare single number is read
  as a square board

### Requirement: Sokoban descriptions use the upstream run-length encoding

A Sokoban description SHALL encode the grid in row-major order as a run-length
sequence: a cell character optionally followed by a decimal repeat count. The
character alphabet SHALL cover space, wall, target, barrel, barrel-on-target, pit,
deep pit, player and player-on-target, and additionally labelled capital-letter
barrels and their on-target forms, so that hand-authored level descriptions are
fully supported even though the random generator emits only a subset.

Validation SHALL reject a description whose decoded cell count does not equal the
board area, distinguishing "too much data" from "too little", SHALL reject a
description with no player or with more than one player, and SHALL reject unknown
characters.

#### Scenario: A generated description round-trips

- **WHEN** a description is generated and then decoded into a state and re-encoded
- **THEN** the resulting description is identical

#### Scenario: A description of the wrong length is rejected

- **WHEN** a description whose decoded area differs from the board area is validated
- **THEN** it is rejected with a message distinguishing too much from too little data

#### Scenario: A description with no player is rejected

- **WHEN** a description containing no player cell is validated
- **THEN** it is rejected

### Requirement: Sokoban movement, pushing and completion

Sokoban SHALL be played by moving the player one cell at a time via the cursor keys,
the bare number keys for the eight directions, or a click whose direction is taken
relative to the player's cell. Orthogonal moves into a barrel SHALL push it when the
square beyond can accept a barrel; diagonal input SHALL move the player only, never
push, and only when one of the two cells shared between source and destination is
free (the NetHack rule). An illegal move SHALL produce no state change and no
history entry.

Pushing a barrel onto a target SHALL mark it filled; pushing a barrel into a pit
SHALL consume the barrel and fill the pit to a space; pushing a barrel into a deep
pit SHALL consume the barrel while the deep pit remains. Undo and redo SHALL be
provided by the engine with no game-specific state.

Completion SHALL be reached when the board cannot become any more complete — either
no barrel remains off a target, or no free target remains (no pit, no deep pit and
no empty target square) — so that levels with spare barrels or pits still complete.

#### Scenario: Pushing a barrel onto its target

- **WHEN** the player moves orthogonally into a barrel whose far side is a target
- **THEN** the barrel moves onto the target and is shown as filled, and the player
  advances into the vacated square

#### Scenario: A push blocked by a wall is rejected

- **WHEN** the player moves orthogonally into a barrel whose far side is a wall or
  another barrel
- **THEN** no move is made

#### Scenario: The last barrel onto a target completes the level

- **WHEN** a move places the final off-target barrel onto a target so no free target
  and no free barrel remain
- **THEN** the game is reported solved and flashes

### Requirement: Sokoban generation is deterministic and faithful

Sokoban generation SHALL port the upstream reverse-move generator faithfully over
the shared bit-identical RNG, so that a given seed always produces the same board
and shared game IDs remain reproducible. Generation SHALL NOT be gated by a solver,
because the level is solvable by construction.

#### Scenario: The same seed reproduces the same board

- **WHEN** the same size and seed are used twice to generate a game
- **THEN** both runs produce the identical description

### Requirement: Sokoban rendering

Sokoban SHALL render each cell as its content — walls with a bevelled face, targets,
pits, deep pits, the player and barrels as discs, and labelled barrels with their
letter — over grid lines drawn once, filling its own background. Moves SHALL be
applied instantly (there is no walk or push animation), and the board SHALL flash on
completion.

#### Scenario: A completed board flashes

- **WHEN** a move transitions the board from not-completed to completed
- **THEN** the board flashes for the completion flash duration and then settles

#### Scenario: A labelled barrel shows its letter

- **WHEN** the board contains a capital-letter barrel
- **THEN** that barrel is drawn with its letter label
