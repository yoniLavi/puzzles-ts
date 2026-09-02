# ts-migration Specification Delta — adopt-american-spelling

## MODIFIED Requirements

### Requirement: The C engine is fully retired once every game is ported

The C/WASM engine SHALL be removed entirely once the last game has been ported
and registered at parity: no game is served by C at runtime, and the C sources,
the Embind adapter, the Emscripten build, the worker's WASM dispatch path, and
the leaf-bridge flag machinery SHALL all be deleted. This is the terminal state
the per-game hybrid was migrating toward; reaching it retires the hybrid rather
than contradicting it.

Removal SHALL preserve the artifacts the app still depends on that were
previously produced by the Emscripten build — the game catalog and the in-app
manual — by generating them without the C toolchain. The game catalog's metadata
SHALL move to a committed TypeScript source, since it existed only in the CMake
files being deleted.

`puzzles/` SHALL NOT survive the migration. Retirement leaves it holding only
the MIT `LICENCE` notices and the upstream-authored help sources the app serves;
each of those then goes where its role says it belongs, and the directory is
deleted. **No C source and no build system SHALL remain in the repository's
working tree** at any point after retirement.

- The served help sources — the halibut manual source and the per-puzzle
  overview fragments — SHALL live under `help/`, because a page the app serves
  is an input to this project's build rather than upstream reference material.
  Their relocation SHALL change no URL and no word of their content.
- The upstream MIT notices SHALL live in `licenses/`, byte-identical to what
  each upstream project ships. What they cover after the migration is the whole
  of `src/engine/` and `src/games/` and the served help sources, so they are not a subdirectory's
  concern. (Upstream names its file `LICENCE`; the directory and file names
  here are this project's, spelled its way, and the bytes inside are not.)

A C source kept as a **reading reference** for scaffolded future work SHALL live
with the change that reads it (`openspec/changes/<change>/reference/`), not in
`puzzles/`, and SHALL carry a README recording its provenance, its license, and
the fact that it cannot be compiled or run. Colocating it this way means the
reference is archived alongside the work that consumed it, and that a reference
nobody ends up needing is deleted with its change rather than accumulating in a
tree whose remaining purpose is unrelated.

#### Scenario: `puzzles/` does not survive the migration

- **WHEN** the repository is inspected after retirement and rehoming
- **THEN** `puzzles/` does not exist
- **AND** the served help sources are under `help/` and the MIT notices under
  `licenses/`
- **AND** no C source and no build system remain in the working tree

#### Scenario: A reading reference is kept with its change

- **WHEN** an upstream C source is retained as reading material for a scaffolded
  change
- **THEN** it lives under that change's `reference/` directory
- **AND** a README there states its provenance, its license, and that it does
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
