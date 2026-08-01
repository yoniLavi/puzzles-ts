# ts-engine Specification Delta — fix-ci-after-c-retirement

## MODIFIED Requirements

### Requirement: The TS midend orchestrates a game behind the existing Comlink surface

The engine SHALL provide a midend that owns, per live game: the
selected `Game`, its parameters, the move/undo/redo history, the UI
and draw state, the engine random source (the retained bit-identical
`random.ts`), timer bookkeeping, and preset/configuration handling.

The midend SHALL provide the app-facing Comlink surface (new game, new game from
ID, restart, process key/mouse, undo, redo, solve, redraw, presets, status,
serialise/deserialise, timer) and SHALL emit the change-notification shapes the
app consumes. The app shell, screen, dialog, drawing-canvas, and store code SHALL
NOT require changes to drive a game.

This requirement previously read "SHALL reproduce the existing Comlink
`WorkerPuzzle` API surface" — that class was the C/WASM implementation, and it
was deleted by `retire-c-engine`. The obligation is unchanged in substance; it is
simply no longer defined by reference to a second implementation, because there
is only one. `PuzzleEngineSurface` is where the shape is stated.

#### Scenario: A game is driven through the unchanged app surface

- **WHEN** the app opens a game
- **THEN** it drives it through the same Comlink surface and change
  notifications it used before the C engine was retired
- **AND** no app-shell, screen, dialog, drawing-canvas or store code changed to
  make that so

### Requirement: Per-game engine selection is a runtime registry, not a build flag

The engine SHALL resolve a game's implementation at runtime through a registry
keyed by `puzzleId`, populated by `registerGame(...)` side effects — never
through a build flag, and never per-game at build time.

The registry began as a *selection* mechanism: present meant "served by the TS
midend", absent meant "fall back to C/WASM", and it shipped empty so production
was unchanged until the first port registered itself. `retire-c-engine` removed
the alternative, so there is nothing left to select between: a `puzzleId` absent
from the registry is **unplayable**, not delegated. The worker SHALL fail
explicitly for an unregistered id rather than falling through.

Because the registry is now the *only* answer to "which games exist", it SHALL
agree with the catalog exactly, in both directions — every catalogued game is
registered, and every registered game is catalogued — and that SHALL be asserted
by a test rather than left to discipline.

#### Scenario: An unregistered puzzle id fails explicitly

- **WHEN** the worker is asked for a `puzzleId` with no registered `Game`
- **THEN** it raises an error naming the id
- **AND** no fallback implementation is attempted

#### Scenario: Catalog and registry cannot drift

- **WHEN** a game is added to the catalog but not registered, or registered but
  not catalogued
- **THEN** the gate fails
