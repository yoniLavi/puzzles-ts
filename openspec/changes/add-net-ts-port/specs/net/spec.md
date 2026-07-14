# net Specification

## ADDED Requirements

### Requirement: Net game implements the Game interface

The engine SHALL provide a registered `net` game implementing `Game<NetParams, NetState,
NetMove, NetUi, NetDrawState>`: a `w × h` grid of wire tiles (a 4-bit mask of connections
`R=1`, `U=2`, `L=4`, `D=8`) whose solved configuration is a spanning tree rooted at a source
square. The player SHALL rotate tiles until every tile is connected to the source and powered.

Params SHALL be `w`, `h`, `wrapping`, `barrierProbability` and `unique`, encoded
`{w}x{h}[w][b{prob}][a]` (`w` = wrapping, the `b` suffix only in the full encoding, `a` = not
unique). The upstream presets SHALL be offered (excluding the two `SMALL_SCREEN`-only 13×11
presets, which the web build does not define). `validateParams` SHALL reject a `unique`
`wrapping` board with a side of length 2.

The game SHALL report `canSolve = true`, `canFormatAsText = false` and `wantsStatusbar = true`.

#### Scenario: Params round-trip

- **WHEN** params `{ w: 5, h: 5, wrapping: true, barrierProbability: 0.25, unique: true }` are
  encoded in full
- **THEN** the result is `5x5wb0.25` and decoding it round-trips the params

### Requirement: Generated boards are uniquely solvable without guessing

When `unique` is set, the generator SHALL gate every board through its own solver, perturbing
the wiring until the board has exactly one solution reachable by pure deduction. A board that
requires guessing SHALL be reachable only by explicitly opting out of uniqueness.

#### Scenario: A generated board has one deducible solution

- **WHEN** a board is generated with `unique` set
- **THEN** the solver reports it uniquely solvable, and no guess is required to reach the
  solution

### Requirement: Tiles rotate and lock; no-op inputs are suppressed locally

Left-click SHALL rotate a tile anticlockwise, right-click clockwise, and `f` by 180°.
Middle-click (or `s`) SHALL toggle a tile's lock; a locked tile SHALL NOT rotate. Inputs that
change nothing — a click outside the grid, a click in the gutter between tiles, or a rotate on
a locked tile — SHALL be suppressed in `interpretMove` by returning no move, WITHOUT comparing
serialised game states.

#### Scenario: Rotating a locked tile does nothing

- **WHEN** the player left-clicks a tile that is locked
- **THEN** no move is produced and the board is unchanged

#### Scenario: A tile rotated full circle leaves ordinary undo history

- **WHEN** the player rotates a tile anticlockwise and then clockwise
- **THEN** the board is back to its original wiring and there are two ordinary undo entries —
  the engine performs no state-equality suppression

### Requirement: Jumble is deterministic on replay

The `j` jumble SHALL rotate every unlocked tile by a random amount drawn from an RNG carried on
the Ui, and SHALL record the result as an explicit per-tile rotation list so that replaying the
move log reproduces the same board without the RNG.

#### Scenario: A jumbled board restores exactly on load

- **WHEN** a game is jumbled, saved, and restored
- **THEN** the restored board matches the jumbled board tile-for-tile

### Requirement: The source and origin are movable Ui state

The powered source square SHALL be movable with Ctrl+arrow, and — on a wrapping grid — the
display origin SHALL be shiftable with Shift+arrow. Both SHALL be Ui state (not board state),
SHALL survive a save, and SHALL NOT be offered on a grid whose every border edge is walled
(such a grid is treated as non-wrapping).

#### Scenario: The source moves and re-powers the board

- **WHEN** the player moves the source square with Ctrl+arrow
- **THEN** the powered/active set is recomputed from the new source

### Requirement: Net does not offer mistake-checking

Net SHALL NOT implement `findMistakes`: every reachable configuration can still be rotated to
the solution, so there is no wrong-but-legal state to flag. The Check & Save control SHALL
degrade to a plain quick-save.

#### Scenario: Check & Save on Net

- **WHEN** the player invokes the save control while playing Net
- **THEN** the board is saved without being checked
