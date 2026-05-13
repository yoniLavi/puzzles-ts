# random spec delta

Path-only refresh: this delta updates the three `src/native/random.ts`
references in the random spec to the new per-module path
(`src/native/random/index.ts`). No behavioural change; the rename is
covered by the `repo-layout` delta.

## MODIFIED Requirements

### Requirement: TypeScript random module reproduces C output byte-for-byte

The TypeScript implementation in `src/native/random/index.ts` SHALL produce byte-identical output to `puzzles/random.c` for every call in the characterization corpus. Bit-identical reproducibility is a product requirement: existing game IDs and shared seeds must keep working when the TS implementation is live.

The implementation SHALL expose, at minimum, the public surface used by upstream puzzles: `random_new(seed)`, `random_bits(state, bits)`, `random_upto(state, limit)`, `random_copy(state)`, `random_free(state)`, `random_state_encode(state)`, `random_state_decode(encoded)`.

The TS module SHALL bundle its own SHA-1 internally (currently at `src/native/random/sha1.ts`); the C `SHA_*` functions remain in `puzzles/misc.c` for their non-random callers and are out of scope for this requirement.

#### Scenario: Corpus replay passes byte-for-byte

- **WHEN** the Vitest replay loads each fixture in `src/native/random/__fixtures__/` and replays the recorded call sequence against `src/native/random/index.ts`
- **THEN** every returned value matches the C-recorded value byte-for-byte
- **AND** every `random_state_encode` output matches the C-recorded hex string character-for-character

#### Scenario: random_bits handles the SHA rollover

- **WHEN** the call sequence consumes more than 20 bytes of databuf so that `state.pos >= 20` triggers seedbuf increment and re-hash
- **THEN** the TS impl produces the same post-rollover bytes as the C impl

#### Scenario: random_bits returns 32-bit values without precision loss

- **WHEN** `random_bits(state, 32)` is called
- **THEN** the TS impl returns the same unsigned 32-bit value as the C impl, with no sign extension and no precision loss

#### Scenario: encode/decode round-trip preserves state

- **WHEN** a state is encoded with `random_state_encode` and decoded with `random_state_decode`
- **THEN** subsequent `random_bits` and `random_upto` calls on the decoded state produce the same outputs as on the original

### Requirement: Build flag toggles between C and TypeScript implementations

The build SHALL support a `USE_TS_RANDOM` CMake option (default OFF) that selects whether `random_*` calls in the WASM puzzles engine resolve to the C implementation (`puzzles/random.c`) or to the TypeScript implementation (`src/native/random/index.ts`) via the JS-library bridge. The default-off setting SHALL preserve byte-identical behaviour with the pre-change build.

The host-native wasm build script (`scripts/build-emcc.sh`, also exposed as `npm run build:wasm`) SHALL honour a `USE_TS_RANDOM` environment variable, mapping it to the CMake option.

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
