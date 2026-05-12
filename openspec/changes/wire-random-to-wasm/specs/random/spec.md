## ADDED Requirements

### Requirement: Build flag toggles between C and TypeScript implementations

The build SHALL support a `USE_TS_RANDOM` CMake option (default OFF) that selects whether `random_*` calls in the WASM puzzles engine resolve to the C implementation (`puzzles/random.c`) or to the TypeScript implementation (`src/native/random.ts`) via the JS-library bridge. The default-off setting SHALL preserve byte-identical behaviour with the pre-change build.

The `Docker/build-emcc.sh` script SHALL honour a `USE_TS_RANDOM` environment variable, mapping it to the CMake option.

#### Scenario: Default build keeps C implementation

- **WHEN** the project is built without `USE_TS_RANDOM` set
- **THEN** `puzzles/random.c` is included in `core_obj`
- **AND** the JS bridge is not linked into the per-puzzle WASM targets
- **AND** observable behaviour is unchanged from the pre-change build

#### Scenario: Flag-on build routes to TypeScript

- **WHEN** the project is built with `USE_TS_RANDOM=ON`
- **THEN** `puzzles/random.c` is excluded from `core_obj`
- **AND** `puzzles/random_bridge.js` is linked into each WASM target via `em_link_js_library`
- **AND** the per-puzzle WASM calls `Module.tsRandomBridge` for every `random_*` invocation

#### Scenario: Same game ID, same board

- **WHEN** the same game ID is requested under both flag positions
- **THEN** the rendered board is identical (byte-for-byte for the underlying state)

### Requirement: Bridge wires C random_* calls to the TypeScript implementation

The bridge SHALL implement all seven public `random_*` symbols (`random_new`, `random_bits`, `random_upto`, `random_copy`, `random_free`, `random_state_encode`, `random_state_decode`) as JS-library entries that delegate to `Module.tsRandomBridge`. The TS bridge object SHALL be installed on the Emscripten Module before any WASM call that touches the random subsystem.

State ownership: TypeScript SHALL own the canonical `RandomState`. C SHALL hold only an opaque integer handle. The bridge maintains a `Map<number, RandomState>` keyed by monotonically-increasing handle IDs. `random_free` removes from the map; failure to call `random_free` from C leaks one entry (acceptable risk — matched by upstream's existing memory lifecycle).

#### Scenario: random_new returns a handle that subsequent calls accept

- **WHEN** C calls `random_new("seed", 4)`
- **THEN** the bridge constructs a `RandomState` via `randomNew`
- **AND** stores it in the handle table under a fresh integer
- **AND** returns that integer to C as the `random_state *`

#### Scenario: random_free releases the handle

- **WHEN** C calls `random_free(handle)`
- **THEN** the bridge removes that handle from the table
- **AND** the underlying `RandomState` becomes eligible for GC

#### Scenario: random_state_encode returns C-owned heap memory

- **WHEN** C calls `random_state_encode(handle)`
- **THEN** the bridge produces the encoded hex string via `randomStateEncode`
- **AND** allocates `strlen(s) + 1` bytes in the WASM heap via `_malloc`
- **AND** copies the string in via `stringToUTF8`
- **AND** returns the pointer, which the C caller is responsible for freeing via `sfree`
