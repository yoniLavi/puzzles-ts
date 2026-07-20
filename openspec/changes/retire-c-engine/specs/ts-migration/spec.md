# ts-migration Specification Delta — retire-c-engine

## ADDED Requirements

### Requirement: The C engine is fully retired once every game is ported

The C/WASM engine SHALL be removed entirely once the last game has been ported
and registered at parity: no game is served by C at runtime, and the C sources,
the Embind adapter, the Emscripten build, the worker's WASM dispatch path, and
the leaf-bridge flag machinery SHALL all be deleted. This is the terminal state
the per-game hybrid was migrating toward; reaching it retires the hybrid rather
than contradicting it.

Removal SHALL preserve the artefacts the app still depends on that were
previously produced by the Emscripten build — the game catalog and the in-app
manual — by generating them without the C toolchain. Only `puzzles/LICENCE`
(the upstream MIT notice) and any source still consuming a genuinely-live
dependency SHALL remain under `puzzles/`.

#### Scenario: No game runs on C after retirement

- **WHEN** the app opens any game after the C engine is retired
- **THEN** the game is served by the TypeScript engine
- **AND** no wasm artifact is loaded and no C source is compiled

#### Scenario: The catalog and manual survive the toolchain removal

- **WHEN** the app is built from a clean checkout with no Emscripten toolchain
  present
- **THEN** the game catalog and the in-app manual are produced
- **AND** the app lists every game and serves its help pages
