# ts-engine Specification Delta — adopt-american-spelling

## RENAMED Requirements

- FROM: `### Requirement: The engine provides a shared colour-mkhighlight helper`
- TO: `### Requirement: The engine provides a shared color-mkhighlight helper`

## MODIFIED Requirements

### Requirement: The engine provides a shared color-mkhighlight helper

The engine SHALL provide `mkhighlightBackground(bg: Color): Color` in `src/engine/color/color-mkhighlight.ts`, implementing the `misc.c` `game_mkhighlight_specific` background-adjustment logic with the near-white epsilon fix. Every white/black-tile game SHALL be able to import and use this instead of re-deriving it locally.

#### Scenario: A game imports the shared mkhighlightBackground

- **WHEN** a game's `colors()` method receives a default background that is near-white
- **THEN** `mkhighlightBackground` shifts the background away from pure white so that a pure-white tile color is visibly brighter
- **AND** the game does not contain a local copy of the highlight logic

### Requirement: The engine provides a full mkhighlight palette helper

The engine SHALL provide `mkhighlight(bg: Color): { background: Color; highlight: Color; lowlight: Color }` in `src/engine/color/color-mkhighlight.ts`, implementing the full `misc.c` `game_mkhighlight` derivation: the background is adjusted via `mkhighlightBackground`, then the highlight is shifted from the adjusted background toward white by K = sqrt(3)/6 and the lowlight toward black by K. Per upstream, when the background is within K of white the highlight SHALL saturate to pure white, and when within K of black the lowlight SHALL saturate to pure black. Games needing the standard bg/highlight/lowlight trio SHALL destructure this helper instead of re-deriving the colors locally.

#### Scenario: A game derives its palette from the shared helper

- **WHEN** a game's `colors()` method calls `mkhighlight(defaultBackground)`
- **THEN** it receives background, highlight, and lowlight colors matching upstream `game_mkhighlight`, with the highlight strictly brighter and the lowlight strictly darker than the background
- **AND** the game contains no local copy of the highlight/lowlight math

#### Scenario: Light host backgrounds get a pure-white highlight

- **WHEN** the host background is white or near-white
- **THEN** the highlight saturates to pure white instead of collapsing into the adjusted background (the defect the previous per-game inline copies had)

### Requirement: The engine owns its type vocabulary and depends on nothing above it

The engine's shared puzzle vocabulary SHALL live under `src/engine/` and SHALL be imported *from* there by the app; it SHALL NOT live in the app layer and be imported upward by the engine and the games.

The vocabulary is `Color`, `Point`, `Size`, `Rect`, `KeyLabel`,
`PresetMenuEntry`, `DrawTextOptions`, `ConfigDescription` and the change
notifications the engine emits.

These declarations are parts of contracts the engine states: `Color` is what a
game's `colors()` returns, and `Rect`/`Point`/`Size` are the drawing API's
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

- **WHEN** a game's `render.ts` needs the `Color` type for its `colors()`
- **THEN** it imports it from the engine
- **AND** no module under `src/engine/` or `src/games/` imports from
  `src/puzzle/`, `src/utils/`, `src/store/` or any other app directory

#### Scenario: The app consumes the engine's vocabulary

- **WHEN** a Lit component or the main-thread `Puzzle` needs `Rect` or
  `PresetMenuEntry`
- **THEN** it imports them from the engine, the dependency running app → engine
- **AND** the direction is checked automatically, not by convention
