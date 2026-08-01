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

What remains under `puzzles/` after retirement SHALL be exactly: `LICENCE` (the
upstream MIT notice), the upstream-authored help sources the app serves
(`puzzles.but` and `puzzles/html/**`), and the unbuilt `unfinished/` sources kept
as reading references for the two scaffolded greenfield ports. Nothing under
`puzzles/` SHALL be compiled, and no build system SHALL remain there. Relocating
the help sources out of `puzzles/` is a separate change, not a condition of
retiring the engine.

#### Scenario: Nothing under `puzzles/` is compiled after retirement

- **WHEN** the repository is built from a clean checkout after retirement
- **THEN** no source under `puzzles/` is compiled and no build system remains
  there
- **AND** what remains is the licence, the served help sources, and unbuilt
  reading references

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
