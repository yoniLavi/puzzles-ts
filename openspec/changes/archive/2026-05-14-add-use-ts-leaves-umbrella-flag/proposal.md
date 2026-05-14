# Change: Add USE_TS_LEAVES umbrella flag

## Why

Each ported seam introduces a build-flag pair: `USE_TS_RANDOM` (CMake) + `VITE_USE_TS_RANDOM` (Vite). At seam 1 that's two flags. By seam 7 (the bottom of the leaf-library list) it's fourteen, and we'd be in the business of testing exponentially many build combinations that nobody actually exercises in production.

We need an umbrella `USE_TS_LEAVES` flag now — before scaffolding `wire-combi-to-wasm` — for three reasons:

1. **One operational switch for the hybrid mode.** Production will only ever ship two configurations: pure-WASM (default) and "every leaf displaced to TS." A single env-var flip on each side gives operators a clear toggle.
2. **It tames the AGENTS.md "C is never deleted until rewrite is complete" policy.** Carrying both implementations forever is acceptable only if flipping between them is one switch, not seven. The benchmark soak (separate change) needs that one switch to compare hybrid vs pure-WASM cleanly.
3. **It establishes the pattern with one bridge, not seven.** Today only `USE_TS_RANDOM` exists. Adding the umbrella while there's a single per-module flag underneath is a small, isolated change — much cheaper than retrofitting it after five more bridges have shipped each with their own bikeshed.

Per-module flags remain as overrides for debugging — turn off one seam without giving up the rest. The umbrella is the default operational interface; per-module is the escape hatch.

## What Changes

- **CMake**: `puzzles/CMakeLists.txt` gains a `USE_TS_LEAVES` option (default OFF) that, when ON, sets the default of every per-module `USE_TS_<MODULE>` to ON. Per-module overrides applied via `-DUSE_TS_RANDOM=OFF` after `-DUSE_TS_LEAVES=ON` still work. Today: only one per-module flag exists (`USE_TS_RANDOM`); each new bridge adds its own under the umbrella.
- **`scripts/build-emcc.sh`**: gains a `USE_TS_LEAVES` env var mapped to `-DUSE_TS_LEAVES=ON`. The existing `USE_TS_RANDOM` env var still works as a per-module override.
- **Vite**: `VITE_USE_TS_LEAVES` is the umbrella for `VITE_USE_TS_<MODULE>` in `src/puzzle/worker.ts`. When `VITE_USE_TS_LEAVES` is truthy, every per-module Vite env var defaults to truthy; per-module env vars can override individually.
- **Coherence check at worker init**: the worker SHALL refuse to start (with a clear error to Sentry) if the WASM was built with one flag combination but the Vite/worker side believes another (e.g. `USE_TS_LEAVES=ON` for the build but `VITE_USE_TS_LEAVES` unset). The check fails closed.
- **Docs**: AGENTS.md "Build commands" section + the README's `Building puzzles` section reflect the umbrella as the primary interface.

**Out of scope**:

- The `wire-combi-to-wasm` bridge itself. The umbrella is laid down here so that change can plug in without bikeshedding.
- Renaming or removing `USE_TS_RANDOM` / `VITE_USE_TS_RANDOM`. Per-module flags stay forever (per the AGENTS.md "C is never deleted" policy — overrides need to persist as long as the C fallback does).

## Impact

- **Affected specs**: `build-pipeline` (adds requirement); `random` (the existing pre-commit/build scenarios remain valid — per-module flags still work — so no spec delta there).
- **Affected code**:
  - `puzzles/CMakeLists.txt` (umbrella option + defaulting logic).
  - `scripts/build-emcc.sh` (env-var plumbing).
  - `src/puzzle/worker.ts` (umbrella Vite env var; coherence check).
  - `vite.config.ts` if explicit env-var listing is required (likely not — `import.meta.env.VITE_*` is implicit).
  - `AGENTS.md` "Build commands" + `README.md` "Building puzzles" sections.
- **Affected workflows**: contributors learn `USE_TS_LEAVES=1` as the standard "give me the TS path" toggle. Existing `USE_TS_RANDOM` muscle memory still works.
- **Risk**: low. Additive change; defaults preserve current behaviour exactly. The coherence check is the most subtle piece — failing closed is the right default, but a poorly-formed error message would frustrate developers. Mitigation: a concrete error template ("WASM was built with USE_TS_LEAVES=ON but VITE_USE_TS_LEAVES is unset; re-run `npm run build:wasm` or set VITE_USE_TS_LEAVES=1") is captured in `design.md`.
