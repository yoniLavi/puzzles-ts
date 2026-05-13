## ADDED Requirements

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
