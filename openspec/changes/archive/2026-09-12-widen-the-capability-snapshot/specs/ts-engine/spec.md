## ADDED Requirements

### Requirement: The capability snapshot covers both halves of what a game remembers
The derived capability snapshot SHALL record the field names of a game's **draw
state** as well as of its `Ui`, so that a divergence in either is a reviewable
line in a text diff rather than something a reader must go looking for.

It SHALL record names only — not sizes, values or types — so that the snapshot
moves when a game's vocabulary moves and at no other time. A snapshot that moves
for unrelated reasons trains its readers to re-baseline without reading.

The snapshot SHALL continue to assert nothing about *which* names a game may
use. An approved vocabulary would be a manifest, which a game can be written
without and nothing would notice; the snapshot's whole job is to make a change
visible, not to permit or forbid one.

It SHALL read the draw state **as `newDrawState` returns it**, before any
`setTileSize`. `setTileSize` assigns into the draw state, so a sized reading
puts back every field it writes and a removed field reappears before its names
are taken — which makes the second scenario below silently false for the 55
games whose `setTileSize` writes a tile size. The hazard a sized reading would
have covered, a field assigned only once a tile size is known, SHALL instead be
**asserted against**: the two readings of every game's draw state are compared
and sizing must add no name. That keeps the hazard visible as a failing test
rather than as a snapshot that no longer notices anything.

#### Scenario: a shared mechanic is added to several games at once

- **GIVEN** a mechanic that several games remember in their draw state
- **WHEN** the snapshot is next taken
- **THEN** the field appears against each of those games in one place
- **AND** no assertion is made about what it should be called

#### Scenario: a game's draw state loses a field

- **GIVEN** a change that removes a field from one game's draw state
- **WHEN** the suite runs
- **THEN** the snapshot moves, and the loss is visible in the diff
- **AND** this holds even for a field the game's `setTileSize` assigns

#### Scenario: a game assigns a draw-state field only once its tile size is known

- **GIVEN** a game whose `setTileSize` adds a field `newDrawState` did not
- **WHEN** the suite runs
- **THEN** a test fails and names the game and the field
- **AND** the snapshot is not quietly widened to absorb it
