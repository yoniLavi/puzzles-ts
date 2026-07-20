# ts-engine Specification Delta — retire-c-engine

## MODIFIED Requirements

### Requirement: The worker exposes one shared puzzle-engine surface

The worker SHALL expose exactly one puzzle-engine implementation — the
TS-midend-backed puzzle — behind the `PuzzleEngineSurface` interface the app
drives over Comlink. With the C engine retired, the C/WASM-backed
implementation, the WASM-instantiation path, and the leaf-bridge coherence
check SHALL be removed, and the worker's dispatch SHALL always construct the TS
engine rather than choosing between two implementations.

`PuzzleEngineSurface` SHALL be retained (or inlined) so the app-facing remote
puzzle type keeps the same shape it had; removing the C implementation SHALL NOT
require changes to `src/screens/`, `src/dialogs/`, `src/puzzle/puzzle.ts`, the
drawing canvas, or `src/store/`.

#### Scenario: The worker constructs the TS engine unconditionally

- **WHEN** the worker opens any game
- **THEN** it constructs the TS-midend-backed puzzle
- **AND** there is no C/WASM implementation or WASM-coherence check to select
  between

#### Scenario: The app's remote type is unchanged by the removal

- **WHEN** the C implementation is removed
- **THEN** the app-side remote puzzle type keeps the same shape
- **AND** no `src/screens/`, `src/dialogs/`, `src/puzzle/puzzle.ts`,
  drawing-canvas, or `src/store/` code changes to consume it
