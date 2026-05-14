# build-pipeline spec delta

## RENAMED Requirements

- FROM: `### Requirement: WASM and icon builds run on host-native tooling`
- TO: `### Requirement: WASM build runs on host-native tooling`

## MODIFIED Requirements

### Requirement: WASM build runs on host-native tooling

The wasm build pipeline SHALL execute on the developer's host machine
using brew-installed tooling (Emscripten, halibut, jq, cmake,
coreutils), with no dependency on a container runtime (Docker, Podman,
etc.) and no dependency on a GTK / ImageMagick / oxipng toolchain. A
`Brewfile` at the repository root SHALL enumerate every external
dependency needed to build the wasm deliverable from a clean checkout.

The pipeline SHALL preserve the env-var surface and consumer-visible
output location of the prior pipeline (`src/assets/puzzles/`) so that
downstream code (npm scripts, the in-tree characterization harnesses,
future seam-port changes) needs no adjustment beyond invoking the
host-native script.

Per-puzzle thumbnail icons under `src/assets/icons/` are NOT a
build-pipeline output; they are committed snapshots maintained per the
separate `puzzle-icons` capability. No build script writes to
`src/assets/icons/`.

Intermediate (cmake out-of-source) build directories SHALL live under a
single `/build/` parent at the repository root, partitioned by target:

- `/build/wasm/` — Emscripten / webapp cmake build (output of
  `scripts/build-emcc.sh`)
- `/build/native/` — characterization-harness binaries built from
  `puzzles/CMakeLists.txt` on the host (e.g. `random-trace`; future
  ported `auxiliary/*-test.c` programs). Owned by
  `scripts/build-native.sh`, accepting target name(s) as positional
  arguments (default `random-trace`).

No build directory SHALL live under `/puzzles/`. The `puzzles/` subtree
remains read-only-ish source code; `puzzles/build/` (used historically
for harness binaries) is gone.

#### Scenario: Clean-checkout wasm build succeeds with brew bundle only

- **WHEN** a contributor clones the repository on a machine with only
  brew installed
- **AND** runs `brew bundle install && npm install` followed by
  `npm run build:wasm`
- **THEN** `src/assets/puzzles/` is populated with the same set of
  artifacts the pipeline previously produced
- **AND** no `docker` / `podman` invocation appears anywhere in the
  build path
- **AND** no `gtk+3`, `pkgconf`, `imagemagick`, or `oxipng` brew package
  is required for the build to succeed

#### Scenario: USE_TS_RANDOM still toggles the TS random bridge

- **WHEN** the host-native `build:wasm` is invoked with
  `USE_TS_RANDOM=1`
- **THEN** the produced wasms import the seven `random_*` symbols from
  the JS-library bridge (matching the behaviour spec'd in the `random`
  capability)
- **AND** the same byte-fidelity Solo round-trip
  (`randomSeed=3x3#786954740169111` → `formatAsText` MD5
  `d704406cde2b755bf708f9dc543b1c96`) holds

#### Scenario: Docker artefacts are gone from the tree

- **WHEN** the change has landed
- **THEN** the repository contains no Dockerfiles, no `docker run` /
  `podman run` invocations in README or scripts, and no references to
  `/app/puzzles` or `/app/build` container paths in build tooling

#### Scenario: GTK icon-build artefacts are gone from the tree

- **WHEN** the change has landed
- **THEN** `git ls-files` shows no rows for `puzzles/gtk.c`,
  `puzzles/printing.c`, `puzzles/cmake/platforms/unix.cmake`, or
  `scripts/build-icons.sh`
- **AND** `puzzles/cmake/setup.cmake` includes `webapp.cmake`
  unconditionally (no `WEB_APP` option, no `unix.cmake` branch)
- **AND** `puzzles/cmake/platforms/` contains exactly one file:
  `webapp.cmake`

#### Scenario: Generated artefacts live under a single `/build/` root

- **WHEN** the build script runs
- **THEN** its cmake `-B` directory is `/build/wasm`
- **AND** no script writes or reads from `/puzzles/build` or
  `/build/icons`
- **AND** characterization harnesses (the `random-trace` pattern in
  `puzzles/auxiliary/`) are built by `scripts/build-native.sh`, which
  configures cmake with `-B /build/native`
- **AND** `.gitignore` matches the consolidated layout via the
  pre-existing `/build/` rule, with no `/puzzles/build/` rule needed

#### Scenario: `scripts/build-native.sh` produces a working harness

- **WHEN** a contributor runs `scripts/build-native.sh` from a clean
  state
- **THEN** the script exits 0
- **AND** an executable lands at `/build/native/auxiliary/random-trace`
- **AND** running that executable emits a JSON corpus semantically
  identical to `src/native/random/__fixtures__/corpus.json` (every
  recorded value matches; the committed file may differ only in
  whitespace from being run through `biome format`)
