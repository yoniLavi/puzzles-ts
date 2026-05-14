# build-pipeline Specification

## Purpose
TBD - created by archiving change remove-docker-emcc-build. Update Purpose after archive.
## Requirements
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
- **AND** `puzzles/cmake/setup.cmake` has no `WEB_APP` option and no
  `unix.cmake` branch
- **AND** `puzzles/cmake/platforms/` contains exactly two files:
  `webapp.cmake` (selected automatically when emscripten is the
  toolchain, i.e. `CMAKE_SYSTEM_NAME == "Emscripten"`) and `native.cmake`
  (a minimal GTK-less native path used by `scripts/build-native.sh` for
  the auxiliary characterization harnesses)

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

### Requirement: USE_TS_LEAVES umbrella flag activates every leaf-library TS bridge

The build SHALL support a `USE_TS_LEAVES` CMake option (default OFF) that, when set to ON, activates every per-module `USE_TS_<MODULE>` flag for the leaf-library layer of the seam-order list. The umbrella SHALL be the primary operator-facing toggle for "give me the hybrid TS+C build"; per-module flags SHALL remain as debugging overrides.

Per-module flag precedence: when both `USE_TS_LEAVES` and an individual `USE_TS_<MODULE>` are specified on the cmake command line, the per-module value wins for that module. Cached-value interaction (`cmake --fresh` semantics) is documented in `design.md`.

The host-native wasm build script (`scripts/build-emcc.sh`, exposed as `npm run build:wasm`) SHALL honour a `USE_TS_LEAVES` environment variable, mapping it to `-DUSE_TS_LEAVES=ON`.

The Vite/worker side SHALL mirror the same structure via `VITE_USE_TS_LEAVES`. Each per-module Vite env var (`VITE_USE_TS_RANDOM`, future `VITE_USE_TS_COMBI`, …) defaults to the umbrella's value when unset; explicit per-module env vars override.

#### Scenario: Default build is pure C

- **WHEN** the project is built with neither `USE_TS_LEAVES` nor any `USE_TS_<MODULE>` set
- **THEN** every leaf-library C implementation is included in `core_obj`
- **AND** no JS-library bridge is linked
- **AND** observable behaviour is unchanged from a pre-umbrella build

#### Scenario: Umbrella ON activates every leaf-library bridge

- **WHEN** the project is built with `USE_TS_LEAVES=ON`
- **THEN** every leaf-library C implementation that has a TS port is excluded from `core_obj`
- **AND** the corresponding JS-library bridges are linked into each WASM target
- **AND** the per-puzzle WASM calls the TS bridge object for every covered call

#### Scenario: Per-module override under the umbrella

- **WHEN** the project is built with `USE_TS_LEAVES=ON -DUSE_TS_RANDOM=OFF`
- **THEN** every leaf except `random` is routed to its TS bridge
- **AND** `puzzles/random.c` is included in `core_obj`
- **AND** `random_bridge.js` is not linked

#### Scenario: Per-module flag without umbrella

- **WHEN** the project is built with `USE_TS_RANDOM=ON` and `USE_TS_LEAVES` unset
- **THEN** only `random` is routed to its TS bridge
- **AND** every other leaf stays on C
- **AND** behaviour matches the pre-umbrella `USE_TS_RANDOM=ON` build exactly

#### Scenario: Coherence check at worker init refuses mismatched builds

- **WHEN** the WASM was compiled with a `USE_TS_<MODULE>=ON` (so it imports the corresponding bridge symbols)
- **AND** the Vite/worker side has no matching bridge object on `Module` (the corresponding `VITE_USE_TS_<MODULE>` and `VITE_USE_TS_LEAVES` are both unset)
- **THEN** the worker SHALL throw an error containing the missing symbol's name and the env-var fix
- **AND** the error SHALL propagate to Sentry
- **AND** no puzzle call SHALL be served

#### Scenario: Reverse coherence — Vite says TS, WASM says C — degrades silently

- **WHEN** `VITE_USE_TS_LEAVES=1` is set but the WASM was built without the umbrella
- **THEN** the per-module bridge objects on `Module` are unused
- **AND** the WASM uses its bundled C implementation
- **AND** the worker MAY emit a debug log noting the unused bridge, but SHALL NOT throw — this configuration is harmless (no symbol mismatch)

