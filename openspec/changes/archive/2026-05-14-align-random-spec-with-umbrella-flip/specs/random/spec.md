# random spec delta

## MODIFIED Requirements

### Requirement: Build flag toggles between C and TypeScript implementations

The build SHALL support a `USE_TS_RANDOM` CMake option (and a
matching `VITE_USE_TS_RANDOM` Vite env var) that selects whether
`random_*` calls in the WASM puzzles engine resolve to the C
implementation (`puzzles/random.c`) or to the TypeScript
implementation (`src/native/random/index.ts`) via the JS-library
bridge.

The default value of `USE_TS_RANDOM` SHALL be governed by the
umbrella `USE_TS_LEAVES` flag — see the `build-pipeline` capability
for default semantics, per-module inheritance, the worker coherence
check, and the `cmake --fresh` reset incantation. This requirement
asserts only the *behaviour* of the flag when set, not its default
value (which is owned by `build-pipeline` and may change without
touching this spec).

The host-native wasm build script (`scripts/build-emcc.sh`, also
exposed as `npm run build:wasm`) SHALL honour a `USE_TS_RANDOM`
environment variable, mapping it to the CMake option (with
explicit "0"/"OFF"/"off" mapping to `-DUSE_TS_RANDOM=OFF` so the
override works under both umbrella positions).

#### Scenario: Flag-on build routes to TypeScript

- **WHEN** the project is built with `USE_TS_RANDOM=ON` (whether by
  explicit override or by inheriting `USE_TS_LEAVES=ON`)
- **THEN** `puzzles/random.c` is excluded from `core_obj`
- **AND** `puzzles/random_bridge.js` is linked into each WASM target
  via `em_link_js_library`
- **AND** the per-puzzle WASM calls `Module.tsRandomBridge` for
  every `random_*` invocation

#### Scenario: Same game ID, same board

- **WHEN** the same game ID is requested under both flag positions
- **THEN** the rendered board is identical (byte-for-byte for the
  underlying state)
