# Tasks

## 1. CMake default

- [x] 1.1 In `puzzles/CMakeLists.txt`, flipped
      `option(USE_TS_LEAVES "..." OFF)` to ON. The per-module
      `${_default_ts_module}` mechanism inherits automatically.
- [x] 1.2 Verified: with `USE_TS_LEAVES=0 npm run build:wasm`, cmake
      emits `-DUSE_TS_LEAVES=OFF` and the resulting `emcc-runtime.js`
      has no `tsRandomBridge` reference; zero-arg build emits no
      `-DUSE_TS_LEAVES` arg (inherits the new ON default) and the
      runtime references `tsRandomBridge`.

## 2. Vite/worker default

- [x] 2.1 In `src/puzzle/worker.ts`, flipped
      `explicit(import.meta.env.VITE_USE_TS_LEAVES) ?? false` to
      `?? true`. `useTsRandom` inherits via `?? useTsLeaves`.
- [x] 2.2 `tsc -b --noEmit` clean.

## 3. Build script messaging

- [x] 3.1 Updated the `USE_TS_LEAVES` env-var documentation block at
      the top of `scripts/build-emcc.sh` to describe the tri-state
      semantics + the new default. Also updated the case logic so
      `USE_TS_LEAVES=0` actually passes `-DUSE_TS_LEAVES=OFF` (under
      the old default-OFF world, "unset" and "explicit OFF" both
      meant the same thing; under default-ON they're distinct).

## 4. Documentation

- [x] 4.1 `AGENTS.md` "Build commands": the bullet now leads with
      "Defaults to hybrid TS+C"; documents `USE_TS_LEAVES=0` as the
      pure-C escape hatch; preserves the per-module override
      semantics + the coherence-check + the cache-reset incantation.
- [x] 4.2 `README.md` "Building puzzles": flipped the example
      commands. Default `npm run build:wasm && npm run dev` is the
      hybrid path; `USE_TS_LEAVES=0` is the pure-C escape hatch;
      per-module override examples flipped to match.

## 5. Smoke verification

- [x] 5.1 `rm -rf build/wasm && npm run build:wasm` produces a wasm
      whose `emcc-runtime.js` contains `tsRandomBridge` (count = 1
      via `grep -c`).
- [x] 5.2 `npm run dev` (zero env vars) boots; playwright open
      `/galaxies` shows zero console errors and renders a real 7×7
      board. The coherence check passes silently on this happy path.
- [x] 5.3 `rm -rf build/wasm && USE_TS_LEAVES=0 npm run build:wasm`
      produces a wasm with no `tsRandomBridge` reference (count = 0).
- [x] 5.4 With pure-C wasm + zero-env vite (worker side defaults to
      hybrid), playwright open `/galaxies` shows zero console errors
      and renders. This is the reverse-coherence path — the worker
      installs an unused bridge, the WASM uses bundled C random,
      everything works.
- [x] 5.5 `npm run test:run` passes: 345/345 across 3 files.
- [x] 5.6 Pre-commit gate clean: `tsc -b --noEmit` (no errors),
      `npm run lint` (96 files, no fixes), `npm run test:run`
      (345/345).

## 6. OpenSpec hygiene

- [x] 6.1 `openspec validate flip-ts-leaves-default-on --strict`
      passes.
- [x] 6.2 On archive, the build-pipeline requirement reflects the
      flipped default + the new "Explicit umbrella OFF gives pure C"
      scenario, and existing scenarios are reworded for the new
      default-ON world ("Per-module flag with umbrella explicitly OFF"
      replaces "Per-module flag without umbrella", etc.).
