## ADDED Requirements

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
