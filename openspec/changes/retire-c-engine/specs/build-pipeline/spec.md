# build-pipeline Specification Delta — retire-c-engine

## ADDED Requirements

### Requirement: The asset build produces the catalog and manual without a WASM toolchain

With no game served by C/WASM, the build SHALL produce the two artefacts the app
depends on — the game `catalog.json` and the in-app manual HTML — **without the
Emscripten toolchain**. The catalog SHALL be derived from a **committed
TypeScript catalog source** holding each game's display metadata (every game is
TS-served, so the catalog is exactly the set of registered TS games); that
metadata previously existed only in the CMake `puzzle()` calls being deleted, so
it moves rather than being re-derived. The manual SHALL continue to be built by
halibut from `puzzles.but`, detached from any wasm-compilation step.

The build configuration SHALL NOT depend on any generated, gitignored artefact at
config-load time, so a clean checkout is configurable before anything has been
generated.

A clean checkout SHALL build the app and serve every game and its help pages
with no Emscripten toolchain installed.

#### Scenario: A clean checkout builds with no Emscripten

- **WHEN** the app is built from a clean checkout on a machine without the
  Emscripten toolchain
- **THEN** the catalog and the manual HTML are produced
- **AND** the app lists every game and serves its help pages
- **AND** no wasm artifact is produced or required

#### Scenario: A clean checkout needs no generated artefact to configure

- **WHEN** the build is configured on a checkout where nothing has been generated
- **THEN** the configuration loads and the build proceeds
- **AND** the game catalog is read from committed source

## REMOVED Requirements

### Requirement: WASM build runs on host-native tooling

**Reason**: Every game is now served by the TypeScript engine; no wasm is built,
so there is no wasm build pipeline to run on host-native tooling. The
catalog/manual generation this requirement also covered is preserved by the new
"asset build produces the catalog and manual without a WASM toolchain"
requirement above.

**Migration**: `scripts/build-emcc.sh`, `webapp.cmake` and the `build:wasm` path
are deleted; the catalog is generated from TS metadata and the manual continues
via halibut. The `Brewfile` drops Emscripten (halibut and any manual-only tools
remain).

### Requirement: USE_TS_LEAVES umbrella flag activates every leaf-library TS bridge

**Reason**: The `USE_TS_LEAVES` umbrella and its per-module `USE_TS_<MODULE>`
flags gate C-internal leaf-library bridges (the C calling into TS-owned leaves).
With the C engine retired there is no C side to bridge, so every such flag is
inert.

**Migration**: Remove the `USE_TS_LEAVES` / `VITE_USE_TS_LEAVES` umbrella, all
per-module flags, and the worker's forward-mismatch coherence probe. The TS
leaves are simply the implementation now.

### Requirement: `build:wasm` guards against a stale leaf-flag cmake cache

**Reason**: The guard exists only because flipping the leaf-library flags against
a cached cmake `option()` could silently build the wrong bridge configuration.
With no wasm build and no leaf flags, there is nothing to guard.

**Migration**: Removed together with `build:wasm` and the leaf-flag machinery.
