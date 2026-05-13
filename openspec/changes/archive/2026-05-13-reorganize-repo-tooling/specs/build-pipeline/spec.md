# build-pipeline spec delta

## MODIFIED Requirements

### Requirement: WASM and icon builds run on host-native tooling

The wasm and icon build pipelines SHALL execute on the developer's host
machine using brew-installed tooling (Emscripten, GTK+3, ImageMagick,
halibut, jq, oxipng, coreutils), with no dependency on a container
runtime (Docker, Podman, etc.). A `Brewfile` at the repository root
SHALL enumerate every external dependency needed to build the
deliverables from a clean checkout.

The pipeline SHALL preserve the env-var surface and consumer-visible
output locations of the prior Docker-based scripts so that downstream
code (npm scripts, the in-tree characterization harnesses, future
seam-port changes) needs no adjustment beyond invoking the host-native
scripts. Consumer-visible outputs are the `src/assets/puzzles/` and
`src/assets/icons/` directories.

Intermediate (cmake out-of-source) build directories SHALL live under a
single `/build/` parent at the repository root, partitioned by target:

- `/build/wasm/` — Emscripten / webapp cmake build (output of
  `scripts/build-emcc.sh`)
- `/build/icons/` — unix/GTK cmake build for icon screenshots (output
  of `scripts/build-icons.sh`)
- `/build/native/` — characterization-harness binaries built from
  `puzzles/CMakeLists.txt` on the host (e.g. `random-trace`; future
  ported `auxiliary/*-test.c` programs)

No build directory SHALL live under `/puzzles/`. The `puzzles/` subtree
remains read-only-ish source code; `puzzles/build/` (used historically
for harness binaries) is gone.

#### Scenario: Clean-checkout build succeeds with brew bundle only

- **WHEN** a contributor clones the repository on a machine with only
  brew installed
- **AND** runs `brew bundle install && npm install` followed by the
  documented `build:wasm` and `build:icons` commands
- **THEN** `src/assets/puzzles/` and `src/assets/icons/` are populated
  with the same set of artifacts the Docker pipeline previously produced
- **AND** no `docker`/`podman` invocation appears anywhere in the build
  path

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

#### Scenario: Generated artefacts live under a single `/build/` root

- **WHEN** the build scripts run
- **THEN** their cmake `-B` directories are `/build/wasm` and
  `/build/icons` respectively
- **AND** no script writes or reads from `/puzzles/build`
- **AND** characterization harnesses (the `random-trace` pattern in
  `puzzles/auxiliary/`) configure cmake with `-B /build/native`
- **AND** `.gitignore` matches the consolidated layout via the
  pre-existing `/build/` rule, with no `/puzzles/build/` rule needed
