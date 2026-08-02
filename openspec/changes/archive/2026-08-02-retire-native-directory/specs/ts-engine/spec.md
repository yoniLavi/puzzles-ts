# ts-engine Specification Delta — retire-native-directory

## ADDED Requirements

### Requirement: The engine owns its type vocabulary and depends on nothing above it

The engine's shared puzzle vocabulary SHALL live under `src/engine/` and SHALL be imported *from* there by the app; it SHALL NOT live in the app layer and be imported upward by the engine and the games.

The vocabulary is `Colour`, `Point`, `Size`, `Rect`, `KeyLabel`,
`PresetMenuEntry`, `DrawTextOptions`, `ConfigDescription` and the change
notifications the engine emits.

These declarations are parts of contracts the engine states: `Colour` is what a
game's `colours()` returns, and `Rect`/`Point`/`Size` are the drawing API's
coordinate records. They sat in `src/puzzle/types.ts` for a historical reason —
they were re-exported from the Emscripten-generated `emcc-runtime.d.ts`, so the
root of the type graph was a generated file in a gitignored assets directory, and
`retire-c-engine` hand-authored them in place precisely so that none of the 201
importers had to change while it proved nothing else moved.

The consequence, measured on 2026-08-02: **182 files under the engine and the
games imported the app layer**, and the layering check could not see it, because
its rule named `screens/`, `dialogs/` and `components/` and the imports went
through `src/puzzle/`.

Correspondingly, the Comlink-facing adapter (`TsWorkerPuzzle`, implementing
`PuzzleEngineSurface`) SHALL live on the app side of the seam, in `src/puzzle/`,
not inside `src/engine/`. It exists to present the engine in the shape the app's
`Puzzle` expects; an adapter belongs with the thing being adapted *to*, and it
was the only production module under the engine importing upward.

Together these two placements make the invariant in the `repo-layout` layering
requirement — the engine and games import nothing under `src/` outside their own
two directories — hold with **no exceptions and no allowlist**, which is what
makes it enforceable rather than aspirational.

#### Scenario: A game imports the drawing vocabulary

- **WHEN** a game's `render.ts` needs the `Colour` type for its `colours()`
- **THEN** it imports it from the engine
- **AND** no module under `src/engine/` or `src/games/` imports from
  `src/puzzle/`, `src/utils/`, `src/store/` or any other app directory

#### Scenario: The app consumes the engine's vocabulary

- **WHEN** a Lit component or the main-thread `Puzzle` needs `Rect` or
  `PresetMenuEntry`
- **THEN** it imports them from the engine, the dependency running app → engine
- **AND** the direction is checked automatically, not by convention
