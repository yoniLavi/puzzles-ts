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
manual — by generating them without the C toolchain. The game catalog's metadata
SHALL move to a committed TypeScript source, since it existed only in the CMake
files being deleted.

What remains under `puzzles/` after retirement SHALL be exactly: the MIT
`LICENCE` notices, and the upstream-authored help sources the app serves
(`puzzles.but` and `puzzles/html/**`). **No C source SHALL remain there**, and no
build system SHALL remain there. Relocating the help sources out of `puzzles/` is
a separate change, not a condition of retiring the engine.

A C source kept as a **reading reference** for scaffolded future work SHALL live
with the change that reads it (`openspec/changes/<change>/reference/`), not in
`puzzles/`, and SHALL carry a README recording its provenance, its licence, and
the fact that it cannot be compiled or run. Colocating it this way means the
reference is archived alongside the work that consumed it, and that a reference
nobody ends up needing is deleted with its change rather than accumulating in a
tree whose remaining purpose is unrelated.

#### Scenario: No C remains under `puzzles/` after retirement

- **WHEN** the repository is inspected after retirement
- **THEN** `puzzles/` contains no C source and no build system
- **AND** what remains is the licences and the served help sources

#### Scenario: A reading reference is kept with its change

- **WHEN** an upstream C source is retained as reading material for a scaffolded
  change
- **THEN** it lives under that change's `reference/` directory
- **AND** a README there states its provenance, its licence, and that it does
  not compile

#### Scenario: No game runs on C after retirement

- **WHEN** the app opens any game after the C engine is retired
- **THEN** the game is served by the TypeScript engine
- **AND** no wasm artifact is loaded and no C source is compiled

#### Scenario: The catalog and manual survive the toolchain removal

- **WHEN** the app is built from a clean checkout with no Emscripten toolchain
  present
- **THEN** the game catalog and the in-app manual are produced
- **AND** the app lists every game and serves its help pages

## REMOVED Requirements

### Requirement: Author-stated known issues are reconciled before the C is retired

**Reason**: This was a gate on *this* change, and it has been met —
`audit-author-known-issues` swept ~30 author-stated points across all three
sources and gave each a verdict. Its trigger can never fire again: the `##
Status` sections are gone from the help pages, the C `TODO`/`FIXME` blocks go
with the sources deleted here, and `puzzles/unreleased/docs/` no longer exists.
A requirement whose subject matter has been deleted cannot be tested, and
leaving it in the spec would assert an ongoing obligation against files that are
not there.

**Migration**: The reconciliation itself is preserved in that change's archived
`audit.md`, and every verdict that was a behavioural divergence from the
author's intent is already recorded in the relevant game's capability spec —
which is where it was required to land precisely so it would survive this
deletion.
