## ADDED Requirements

### Requirement: The engine supports an ephemeral Hint System

The engine SHALL support a UI-only, ephemeral Hint System. The `Game` interface SHALL define an optional `hint(state)` method returning a single move, a human-readable explanation, and optional visual highlights (`HintResult`). The `Midend` SHALL expose a `hint()` method and track an `activeHint`. The `activeHint` SHALL be stored only in the midend (not polluting the game state) and SHALL be cleared on any state-changing action (player moves, undo, redo, restart, new game). The `activeHint` SHALL be passed to the game's `redraw` method, and the midend SHALL automatically append the hint's explanation to the status bar text.

#### Scenario: Requesting a hint from the midend
- **WHEN** the user requests a hint via `midend.hint()` on a game that implements the `hint` method
- **THEN** the midend computes the hint, stores it in `activeHint`, appends the explanation to the status bar, and schedules a repaint

#### Scenario: Making a move clears the active hint
- **WHEN** the user makes a move (or triggers undo/redo/restart) while a hint is active
- **THEN** the midend clears `activeHint` and redraws the canvas without the hint highlights

### Requirement: The Sixteen port implements heuristic hints and rendering

The Sixteen TS port SHALL implement a heuristic hint generator that finds the lowest-numbered out-of-place tile, identifies a slide move that brings it closer to its target, and returns that move and an explanation showing the target coordinate. The Sixteen `redraw` method SHALL render the active hint by highlighting the source tile to move (using a filled overlay), the target position (using a border highlight), and the corresponding slide arrow (using `COL_HINT`).

#### Scenario: Sixteen generates a heuristic hint
- **WHEN** a user asks for a hint on an unsolved Sixteen board
- **THEN** the generator returns a valid slide move and highlights the tile, its target position, and the slide arrow in the hint color
