# Tasks

## 1. CMake umbrella option

- [ ] 1.1 Add `option(USE_TS_LEAVES ...)` to `puzzles/CMakeLists.txt`, default OFF.
- [ ] 1.2 Use `USE_TS_LEAVES` to set the default of `USE_TS_RANDOM` (and future per-module flags) via the `_default_ts_module` pattern from `design.md`.
- [ ] 1.3 Verify all four invocation matrices behave as designed:
  - default (no flags) → pure C.
  - `-DUSE_TS_RANDOM=ON` (umbrella off) → only random TS.
  - `-DUSE_TS_LEAVES=ON` → all leaves TS.
  - `-DUSE_TS_LEAVES=ON -DUSE_TS_RANDOM=OFF` → all leaves TS except random.

## 2. Build script umbrella env var

- [ ] 2.1 Add `USE_TS_LEAVES` env-var plumbing to `scripts/build-emcc.sh`, mirroring the existing `USE_TS_RANDOM` block. Map to `-DUSE_TS_LEAVES=ON`.
- [ ] 2.2 Update the script's top-of-file env-var documentation to mention `USE_TS_LEAVES` as the primary toggle and `USE_TS_RANDOM` as a per-module override.

## 3. Vite/worker umbrella env var

- [ ] 3.1 Add `VITE_USE_TS_LEAVES` resolution in `src/puzzle/worker.ts`. Each per-module Vite env var (`VITE_USE_TS_RANDOM` today) defaults to the umbrella's value when unset; explicit `0` / `false` / `""` for the per-module flag overrides downward.
- [ ] 3.2 Introduce a small `explicit(env)` helper in the worker (returns `true | false | undefined`) so "unset" vs "explicitly off" is unambiguous.

## 4. Coherence check at worker init

- [ ] 4.1 Implement the import-list inspection: at WASM instantiation, enumerate the WebAssembly module's imports and match against the expected per-module bridge symbols.
- [ ] 4.2 If the WASM imports a bridge symbol that the worker hasn't installed on `Module`, throw the templated error message from `design.md` (with the actual missing symbol substituted in). The error propagates so Sentry records it.
- [ ] 4.3 Decide implementation site (eager in `webapp.cpp` vs lazy in worker wrapper). Lean lazy per `design.md`; revisit only if it bites.

## 5. Documentation

- [ ] 5.1 Update `AGENTS.md` "Build commands" section: `USE_TS_LEAVES` is the standard toggle; `USE_TS_RANDOM` (and future per-module flags) are debug overrides.
- [ ] 5.2 Update `README.md` "Building puzzles" section similarly.
- [ ] 5.3 Mention the `cmake --fresh` / `rm -rf build/wasm/` reset incantation when transitioning between flag combinations.

## 6. Tests

- [ ] 6.1 Smoke-test all four CMake matrices land working WASMs. (Manual today; folds into the benchmark soak when it lands.)
- [ ] 6.2 Manually verify the coherence check fires when `USE_TS_LEAVES=1 npm run build:wasm` runs but `VITE_USE_TS_LEAVES` is unset for `npm run dev`. Error message readable, points to the right fix.

## 7. OpenSpec hygiene

- [ ] 7.1 `openspec validate add-use-ts-leaves-umbrella-flag --strict` passes.
- [ ] 7.2 On archive, the new build-pipeline requirement merges into `openspec/specs/build-pipeline/spec.md`.
