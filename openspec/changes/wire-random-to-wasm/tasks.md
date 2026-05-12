# Tasks

The detailed bridge architecture (handle ownership, function shapes, build-flag mechanism) is captured in `openspec/changes/port-random-to-typescript/design.md`. This change carries that design into code.

## 1. CMake option + conditional sources

- [ ] 1.1 Add `option(USE_TS_RANDOM "Route random_* calls to the TypeScript implementation via --js-library" OFF)` to `puzzles/CMakeLists.txt`.
- [ ] 1.2 Wrap `random.c` in the `core_obj` source list with `$<$<NOT:$<BOOL:${USE_TS_RANDOM}>>:random.c>` (or split into a conditional `set()` for readability).
- [ ] 1.3 In `puzzles/cmake/platforms/webapp.cmake`, when `USE_TS_RANDOM` is ON, call `em_link_js_library(${TARGET} ${PUZZLES_ROOT_DIR}/random_bridge.js)` inside `set_platform_puzzle_target_properties`.

## 2. JS library bridge

- [ ] 2.1 Add `puzzles/random_bridge.js` implementing the seven `random_*` symbols via `mergeInto(LibraryManager.library, ...)`. Each function looks up `Module.tsRandomBridge` and forwards to it.
- [ ] 2.2 Use `__deps: ['$UTF8ToString']` etc. for any Emscripten helpers the bridge calls.
- [ ] 2.3 For `random_state_encode`: allocate WASM memory with `_malloc` and copy the encoded string via `stringToUTF8`. Document who owns the freed pointer (the C caller, via `sfree`).

## 3. Worker wiring

- [ ] 3.1 Create `src/native/random-bridge.ts` (no test file needed at this stage — the corpus replay covers the TS impl; the bridge is exercised end-to-end). Export a factory `createTsRandomBridge()` that builds the bridge object: a `Map<number, RandomState>`, monotonically-increasing handle IDs, and the seven methods called from `random_bridge.js`.
- [ ] 3.2 In `src/puzzle/worker.ts`, install the bridge on the Emscripten Module config:
  ```ts
  preInit: [(m: any) => { m.tsRandomBridge = createTsRandomBridge(); }]
  ```
  (Or `preRun` if `preInit` is too early for `_malloc`.)
- [ ] 3.3 Add a worker-side env-var or feature flag to control whether the bridge is installed (when the WASM is built with the C random, the bridge is unused but harmless — but it's clearer to skip it).

## 4. Docker / build-emcc plumbing

- [ ] 4.1 Modify `Docker/build-emcc.sh` to honour a `USE_TS_RANDOM` env var, passing it through as `-DUSE_TS_RANDOM=ON` in `CMAKE_ARGS` when set.
- [ ] 4.2 Document the workflow in `Docker/` (or README): `USE_TS_RANDOM=1 docker run ...`.

## 5. Build and verify

- [ ] 5.1 Rebuild WASM with `USE_TS_RANDOM=1`. Confirm the build succeeds and `random.c` is excluded (check the link log / nm output for the random_bridge symbols).
- [ ] 5.2 Start dev server (`npm run dev`). Open 3–5 puzzles across categories: a simple one (Cube or Flip), a generator-heavy one (Loopy or Mines), one with serialised state (Solo). Confirm boards generate, render, and play.
- [ ] 5.3 Pick one known game ID from the existing C build, confirm the same ID under the TS bridge produces an identical board (this is the byte-fidelity end-to-end proof).
- [ ] 5.4 Rebuild WASM **without** the flag. Confirm no behaviour regression compared to today's baseline.

## 6. Document and wrap

- [ ] 6.1 Record how long the integration actually took. PLAN.md's reflection note: this is data for sizing future seams' "wire it up" half.
- [ ] 6.2 Note any surprises (string lifetime gotchas, worker init ordering, etc.) in `design.md` so the next seam's bridge change has a cheat sheet.
- [ ] 6.3 Re-run `openspec validate wire-random-to-wasm --strict`.
