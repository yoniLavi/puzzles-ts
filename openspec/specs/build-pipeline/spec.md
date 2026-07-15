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

The build SHALL support a `USE_TS_LEAVES` CMake option (default ON)
that, when set to ON, activates every per-module `USE_TS_<MODULE>` flag
for any leaf-library bridge that exists. The umbrella is the primary
operator-facing toggle and the default operational mode; per-module
flags remain as debugging overrides. Pure C remains available as the
escape hatch via explicit `USE_TS_LEAVES=OFF`.

This requirement governs the umbrella *mechanics* only. The migration
*strategy* — what gets ported, in what order, and against what
acceptance bar — is owned by the `ts-migration` capability. Under that
capability the migration is **per-game**, not per-leaf-library: the
leaf-library umbrella is retained as working machinery (it correctly
toggles the `random` bridge and the fail-closed coherence check), but
it is no longer the description of how the project migrates. Future
ports do NOT have to add a per-leaf bridge or document a byte-identical
fidelity corpus; acceptance is governed by `ts-migration` (game plays
correctly + dev-time differential spot-check).

Per-module flag precedence: when both `USE_TS_LEAVES` and an individual
`USE_TS_<MODULE>` are specified on the cmake command line, the
per-module value wins for that module. Cached-value interaction
(`cmake --fresh` semantics) is documented in the umbrella's archived
`design.md`.

The host-native wasm build script (`scripts/build-emcc.sh`, exposed as
`npm run build:wasm`) SHALL honour a `USE_TS_LEAVES` environment
variable, mapping it to `-DUSE_TS_LEAVES=ON` or `-DUSE_TS_LEAVES=OFF`
as appropriate.

The Vite/worker side SHALL mirror the same structure via
`VITE_USE_TS_LEAVES`, defaulting to ON when unset. Each per-module
Vite env var (`VITE_USE_TS_RANDOM`, …) defaults to the umbrella's
value when unset; explicit per-module env vars override.

#### Scenario: Default build routes ported leaves through TS

- **WHEN** the project is built with neither `USE_TS_LEAVES` nor any
  `USE_TS_<MODULE>` set
- **THEN** every leaf-library C implementation that has a TS port is
  excluded from `core_obj`
- **AND** the corresponding JS-library bridges are linked into each
  WASM target
- **AND** observable per-game behaviour is correct (validated by
  ordinary behavioural tests and the `ts-migration` dev-time
  differential spot-check, NOT by a byte-identical corpus gate)

#### Scenario: Explicit umbrella OFF gives pure C

- **WHEN** the project is built with `USE_TS_LEAVES=OFF`
- **AND** no per-module `USE_TS_<MODULE>=ON` override is set
- **THEN** every per-module flag defaults to OFF (inheriting the
  umbrella)
- **AND** every leaf-library C implementation is included in `core_obj`
- **AND** no JS-library bridge is linked

#### Scenario: Umbrella ON activates every leaf-library bridge

- **WHEN** the project is built with `USE_TS_LEAVES=ON` explicitly (or
  by default)
- **THEN** every leaf-library C implementation that has a TS port is
  excluded from `core_obj`
- **AND** the corresponding JS-library bridges are linked into each
  WASM target
- **AND** the per-puzzle WASM calls the TS bridge object for every
  covered call

#### Scenario: Per-module override under the umbrella

- **WHEN** the project is built with `USE_TS_LEAVES=ON -DUSE_TS_RANDOM=OFF`
- **THEN** every leaf except `random` is routed to its TS bridge
- **AND** `puzzles/random.c` is included in `core_obj`
- **AND** `random_bridge.js` is not linked

#### Scenario: Per-module flag with umbrella explicitly OFF

- **WHEN** the project is built with `USE_TS_RANDOM=ON USE_TS_LEAVES=OFF`
- **THEN** only `random` is routed to its TS bridge
- **AND** every other leaf stays on C
- **AND** behaviour matches a deliberately-narrow per-seam debugging
  build (e.g. bisecting a regression to the `random` bridge alone)

#### Scenario: Coherence check at worker init refuses mismatched builds

- **WHEN** the WASM was compiled with a `USE_TS_<MODULE>=ON` (so it
  imports the corresponding bridge symbols)
- **AND** the Vite/worker side has no matching bridge object on
  `Module` (the corresponding `VITE_USE_TS_<MODULE>` is explicitly off
  AND `VITE_USE_TS_LEAVES` is explicitly off)
- **THEN** the worker SHALL throw an error containing the missing
  symbol's name and the env-var fix
- **AND** the error SHALL propagate to Sentry
- **AND** no puzzle call SHALL be served

#### Scenario: Reverse coherence — Vite says TS, WASM says C — degrades silently

- **WHEN** `VITE_USE_TS_LEAVES=1` is set (or defaults ON) but the WASM
  was built with `USE_TS_LEAVES=OFF`
- **THEN** the per-module bridge objects on `Module` are unused
- **AND** the WASM uses its bundled C implementation
- **AND** the worker MAY emit a debug log noting the unused bridge,
  but SHALL NOT throw — this configuration is harmless (no symbol
  mismatch)

### Requirement: `build:wasm` guards against a stale leaf-flag cmake cache

`scripts/build-emcc.sh` SHALL ensure the cmake configuration it builds matches
the leaf-library flags it was invoked with. Because a cmake `option()` honours a
previously-cached value, flipping `USE_TS_LEAVES` / `USE_TS_<MODULE>` against a
stale `build/wasm/CMakeCache.txt` would otherwise silently build the *previous*
configuration. When an explicitly-passed leaf flag disagrees with the cached
value, the script SHALL reconfigure from a clean build directory (or fail with a
message naming the flag and the fix) rather than honour the stale cache. The
footgun and the guard SHALL be documented in a comment in the script itself, not
only in `AGENTS.md`.

#### Scenario: Flipping the umbrella flag reconfigures cleanly

- **WHEN** a contributor runs `npm run build:wasm` (default, `USE_TS_LEAVES` ON),
  then re-runs it with `USE_TS_LEAVES=0`
- **THEN** the second build reconfigures so the produced wasm reflects
  `USE_TS_LEAVES=0`, without the contributor first having to `rm -rf build/wasm/`
- **AND** the script emits no silent wrong-configuration build

#### Scenario: An unchanged flag set reuses the build directory

- **WHEN** `build:wasm` is run twice with the same leaf-flag environment
- **THEN** the second run reuses the existing `build/wasm/` (incremental), with no
  forced reconfigure

### Requirement: Continuous integration runs the full gate on push to main

The repository SHALL provide a GitHub Actions workflow that, on every push to
`main`, runs the same gate as the husky pre-commit hook: `build:wasm` followed by
`npm run gate` (`tsc -b --noEmit` → `biome lint` → `vitest run` → `vite build`).
Because the typecheck, tests, and production build all import generated artifacts
from `src/assets/puzzles/` (`catalog.json`, `emcc-runtime`), the workflow SHALL
ensure those assets are present before the gate — there is no valid asset-free CI
tier (a no-asset job fails at `tsc -b`). When it must build them it SHALL provision
the wasm toolchain (Emscripten via an emsdk action pinned to the Brewfile's
version, plus the `halibut`/`jq`/`cmake` system packages) so the build runs from a
clean checkout. The assets MAY be restored from a cache keyed on the wasm inputs
(the `puzzles/**` sources, the build script, and the emscripten version) rather
than rebuilt every run, skipping the toolchain steps on a cache hit; the cache key
SHALL bust whenever any of those inputs changes, so a stale build is never served.

The project is trunk-based (no pull-request flow), so the gate runs post-push on
`main` rather than pre-merge; a `pull_request` trigger MAY be added later if a
contributor PR flow is adopted. This closes the single-point-of-failure gap where
the pre-commit hook was the only gate (a `--no-verify` commit or a clone whose
hooks never installed could land breakage on `main` undetected).

#### Scenario: A push to main is gated

- **WHEN** a commit is pushed to `main` (including one made with `--no-verify`)
- **THEN** the CI workflow builds the wasm assets and runs typecheck, lint, tests,
  and the production build, so breakage that bypassed the local hook is still
  surfaced
- **AND** a failure in any stage fails the run

### Requirement: The pre-commit gate minimises wall-clock without dropping checks

The pre-commit gate SHALL run all four checks (`tsc -b --noEmit`, `biome lint`,
`vitest run`, `vite build`) and block a commit on any failure, while being
orchestrated to reduce wall-clock: the fast checks (`tsc` then `biome`) run
first as a fail-fast prefix, and the two heavy, mutually-independent checks
(`vitest run` and `vite build`, which share no inputs or outputs) SHALL run
**concurrently when the machine has spare capacity, and serially otherwise,
never oversubscribing the CPU**. The concurrency decision is a load probe (the
build runs concurrently only when the 1-minute load average leaves at least one
core of headroom); the serial fallback is the safe default, so a misjudged
probe costs at most the parallelism win and never spuriously blocks a commit.
The gate SHALL fail if either heavy check fails, regardless of which branch it
ran in. No correctness check may be removed, weakened, sampled, or moved
off the per-commit path to buy speed, and `vite build` SHALL remain in the gate
(it is the only step that exercises the production build, where two prod-only
regressions have shipped undetected). Any vitest pool/isolation tuning adopted
to reduce per-file module-load overhead SHALL preserve the `repo-layout`
requirement that "the test suite is deterministic under parallel load" —
verified by a green full run repeated under the new configuration (including
under file-order shuffle, which stresses the shared-module-state that
non-isolated pools expose) — or be reverted.

The gate's orchestration SHALL live in a single script (`scripts/gate.sh`)
invoked by both `.husky/pre-commit` and `npm run gate`, so the hook and the
manual command cannot drift.

#### Scenario: Independent heavy steps run concurrently when there is capacity

- **WHEN** the pre-commit gate runs after `tsc` and `biome` pass on a machine
  with spare cores
- **THEN** `vitest run` and `vite build` execute concurrently
- **AND** the commit is rejected if either the tests or the production build
  fails

#### Scenario: A busy machine runs the heavy steps serially rather than flake

- **WHEN** the pre-commit gate runs on an already-loaded machine (the 1-minute
  load average leaves no core of headroom)
- **THEN** `vitest run` runs first and `vite build` runs after it, rather than
  concurrently
- **AND** the gate still rejects the commit if either fails
- **BECAUSE** running the all-core build concurrently on a saturated box
  oversubscribes CPU/memory and starves vitest's timeout-bound tests, and a
  reliable blocking gate outranks the parallel wall-clock win

#### Scenario: A speed change never weakens the gate

- **WHEN** a pool/isolation setting is changed to speed up `vitest run`
- **THEN** the full suite is shown to remain green and deterministic under the
  new setting (repeated runs, including under file-order shuffle)
- **AND** if it does not, the setting is reverted rather than shipped

