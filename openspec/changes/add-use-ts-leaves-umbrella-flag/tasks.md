# Tasks

## 1. CMake umbrella option

- [x] 1.1 Add `option(USE_TS_LEAVES ...)` to `puzzles/CMakeLists.txt`, default OFF.
- [x] 1.2 Use `USE_TS_LEAVES` to set the default of `USE_TS_RANDOM` (and future per-module flags) via the `_default_ts_module` pattern from `design.md`.
- [x] 1.3 Verify all four invocation matrices behave as designed:
  - default (no flags) → pure C. ✓ (no `-D` args; `tsRandomBridge` count in `emcc-runtime.js` = 0)
  - `-DUSE_TS_RANDOM=ON` (umbrella off) → only random TS. ✓ (bridge linked)
  - `-DUSE_TS_LEAVES=ON` → all leaves TS. ✓ (bridge linked via umbrella propagation)
  - `-DUSE_TS_LEAVES=ON -DUSE_TS_RANDOM=OFF` → all leaves TS except random. ✓ (per-module override wins; `tsRandomBridge` count = 0)

## 2. Build script umbrella env var

- [x] 2.1 Add `USE_TS_LEAVES` env-var plumbing to `scripts/build-emcc.sh`, mirroring the existing `USE_TS_RANDOM` block. Map to `-DUSE_TS_LEAVES=ON`.
- [x] 2.2 Update the script's top-of-file env-var documentation to mention `USE_TS_LEAVES` as the primary toggle and `USE_TS_RANDOM` as a per-module override. Also made `USE_TS_RANDOM` tri-state ("" / "0"/"OFF" / truthy) so the `USE_TS_LEAVES=1 USE_TS_RANDOM=0` matrix actually passes `-DUSE_TS_RANDOM=OFF`.

## 3. Vite/worker umbrella env var

- [x] 3.1 Add `VITE_USE_TS_LEAVES` resolution in `src/puzzle/worker.ts`. Each per-module Vite env var (`VITE_USE_TS_RANDOM` today) defaults to the umbrella's value when unset; explicit `0` / `false` / `off` for the per-module flag overrides downward.
- [x] 3.2 Introduce a small `explicit(env)` helper in the worker (returns `true | false | undefined`) so "unset" vs "explicitly off" is unambiguous. Also added `VITE_USE_TS_LEAVES` to `src/vite-env.d.ts` so TS sees it.

## 4. Coherence check at worker init

- [x] 4.1 Implement the import-list inspection: `assertWasmBridgesCoherent` calls `WebAssembly.Module.imports(module)` at instantiation and filters to `env`-module imports. Each per-module bridge has a probe entry in `FORWARD_MISMATCH_PROBES` naming its sentinel symbol, CMake flag, Vite flag, and `installed()` predicate.
- [x] 4.2 If the WASM imports a probe symbol that the worker hasn't installed, throw the templated error. The error propagates through Comlink and Sentry as an unhandled promise rejection. Verified end-to-end: bridged-wasm + plain-vite triggers exactly the templated message in the worker console.
- [x] 4.3 Implementation site: inside `instantiateWasm` after `WebAssembly.instantiateStreaming` but before `successCallback`. This is the eager-at-instantiation site; lazier-in-puzzle-call was the alternative the design considered. Eager wins on "catches mismatches even if no puzzle is opened" — and the imports list is already in hand at that moment, so there's no extra fetch.

## 5. Documentation

- [x] 5.1 Update `AGENTS.md` "Build commands" section: `USE_TS_LEAVES` is the standard toggle; `USE_TS_RANDOM` (and future per-module flags) are debug overrides. Also called out the coherence-check function by name so future readers can find it.
- [x] 5.2 Update `README.md` "Building puzzles" section similarly. Includes the three concrete invocation examples (umbrella, per-module-only, umbrella-with-override).
- [x] 5.3 Mention the `rm -rf build/wasm/` reset incantation when transitioning between flag combinations. Both files call out cmake's `option()` honouring stale cache values.

## 6. Tests

- [x] 6.1 Smoke-test all four CMake matrices land working WASMs. Verified by rebuilding and inspecting `grep -c tsRandomBridge src/assets/puzzles/emcc-runtime.js` for each matrix. Folds into the benchmark soak when it lands.
- [x] 6.2 Manually verify the coherence check fires when `USE_TS_LEAVES=1 npm run build:wasm` runs but `VITE_USE_TS_LEAVES` is unset for `npm run dev`. Verified via playwright opening /galaxies: console shows the templated error with the missing symbol, the CMake flag, the Vite flag, and the fix-it pointer; no cryptic "Cannot read properties of undefined" leaks through. Also verified the happy path (both flags ON) renders a real 7×7 galaxies board with zero console errors.

## 7. OpenSpec hygiene

- [x] 7.1 `openspec validate add-use-ts-leaves-umbrella-flag --strict` passes.
- [x] 7.2 On archive, the new build-pipeline requirement merges into `openspec/specs/build-pipeline/spec.md`.
