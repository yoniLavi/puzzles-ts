# Change: Wire the TypeScript random module into the WASM build

## Why

`port-random-to-typescript` proved the TS random module produces byte-for-byte identical output to `puzzles/random.c` (66 calls across 6 fixtures all pass). It did not, however, replace the C calls that the running WASM engine actually makes. Every C-side puzzle generator still calls into `puzzles/random.c` regardless of whether the TS port exists.

This change is the integration half: make the WASM build optionally route `random_*` calls to the TS implementation via Emscripten's `--js-library` mechanism, behind a default-off `USE_TS_RANDOM` CMake option. When the flag is on, the puzzle engine becomes a hybrid (C engine, TS random); when it's off, behaviour is unchanged from today.

This is the **first time** we cross the WASM/JS seam *inward* (rather than the existing outward direction in `webapp.cpp`). Patterns established here — the handle table, the JS-library skeleton, the build-flag mechanism — will be reused by every future seam.

## What Changes

- **Build flag**: `USE_TS_RANDOM` (CMake option), wired through `Docker/build-emcc.sh` as an env var. Default OFF.
- **C side**: when flag is ON, `random.c` is excluded from `core_obj` sources. (The upstream subtree edit is a single CMake conditional; no `random.c` modification.)
- **JS library** `puzzles/random_bridge.js`: implements the seven `random_*` C symbols as JS thunks that delegate to `Module.tsRandomBridge`. Linked via `em_link_js_library` only when the flag is ON.
- **Worker wiring**: `src/puzzle/worker.ts` (or a small sibling module) imports `src/native/random.ts`, builds the `tsRandomBridge` object with a `Map<number, RandomState>` handle table, and installs it on the Emscripten Module before WASM instantiation.
- **Build process**: rebuild WASM via Docker once with `USE_TS_RANDOM=1`. Verify in browser.
- **Verification**: manually open 3–5 puzzles in dev server with the flag on; confirm boards generate, render, play. Then with flag off, confirm no regression. Pick a known game ID, confirm same board under both.

**Out of scope**:
- Removing `puzzles/random.c` entirely. The follow-on cleanup happens after this change has been live and green for some time.
- Displacing SHA-1 for misc.c's non-random callers. Tracked separately.
- A runtime toggle (compile-time only).

## Impact

- **Affected specs**: `random` (adds the "Build flag toggles..." requirement, plus a "Bridge wires C to TS" requirement).
- **Affected code**:
  - `puzzles/CMakeLists.txt` — option + conditional source list (single edit).
  - `puzzles/random_bridge.js` — new file in the in-tree subtree; the only meaningful subtree addition.
  - `Docker/build-emcc.sh` — pass env var through to CMake.
  - `src/puzzle/worker.ts` — install `Module.tsRandomBridge` at pre-init.
  - Rebuilt WASM assets in `src/assets/puzzles/` (gitignored).
- **Risk**:
  - First time we bridge C → TS through `--js-library`. Detail bugs (string allocation lifetime, handle leakage) are likely to bite once.
  - Iteration loop is slow — each WASM rebuild is multi-minute Docker work.
  - Worker boundary debugging is harder than main-thread debugging.
- **Mitigation**: the existing corpus replay still gates correctness of the TS impl itself, so any bridge bug shows up as "C-side WASM call produces wrong output", not as "TS impl drifted". That isolates the failure mode.
