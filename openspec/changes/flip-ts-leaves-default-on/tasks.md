# Tasks

## 1. CMake default

- [ ] 1.1 In `puzzles/CMakeLists.txt`, flip
      `option(USE_TS_LEAVES "..." OFF)` to
      `option(USE_TS_LEAVES "..." ON)`. The per-module
      `${_default_ts_module}` mechanism inherits automatically.
- [ ] 1.2 Verify `cmake -B build/wasm -S puzzles` (no `-D` flags)
      surfaces `USE_TS_LEAVES:BOOL=ON` and `USE_TS_RANDOM:BOOL=ON`
      in the cache. Confirm `cmake -B build/wasm -S puzzles
      -DUSE_TS_LEAVES=OFF` flips both back.

## 2. Vite/worker default

- [ ] 2.1 In `src/puzzle/worker.ts`, flip the `useTsLeaves`
      resolution from `explicit(import.meta.env.VITE_USE_TS_LEAVES) ?? false`
      to `?? true`. `useTsRandom` (and future per-module reads)
      inherit automatically via `?? useTsLeaves`.
- [ ] 2.2 Run `tsc -b --noEmit` to confirm no type regressions.

## 3. Build script messaging

- [ ] 3.1 Update `scripts/build-emcc.sh`: the `USE_TS_LEAVES` info
      line should make the new default explicit ("(default ON;
      override with USE_TS_LEAVES=0)"). The existing case structure
      stays — only the wording needs adjustment.

## 4. Documentation

- [ ] 4.1 Update `AGENTS.md` "Build commands": `USE_TS_LEAVES=1` is
      no longer the toggle; the new default IS the umbrella. Document
      `USE_TS_LEAVES=0` as the pure-C escape hatch and note the
      production implication.
- [ ] 4.2 Update `README.md` "Building puzzles": flip the example
      commands. Default `npm run build:wasm` is hybrid; pure C is
      now `USE_TS_LEAVES=0 npm run build:wasm`.

## 5. Smoke verification

- [ ] 5.1 `rm -rf build/wasm && npm run build:wasm` produces a wasm
      whose `emcc-runtime.js` references `tsRandomBridge` (default
      hybrid).
- [ ] 5.2 `npm run dev` (zero env vars) boots; playwright open
      `/galaxies` renders a real board with zero console errors
      (coherence check passes by default).
- [ ] 5.3 `rm -rf build/wasm && USE_TS_LEAVES=0 npm run build:wasm`
      produces a wasm whose `emcc-runtime.js` does NOT reference
      `tsRandomBridge` (pure C via explicit OFF).
- [ ] 5.4 With pure-C wasm + zero-env vite (worker side defaults to
      hybrid), playwright open `/galaxies` renders without error
      (reverse-coherence is silent by design; no `randomNew` crash).
- [ ] 5.5 `npm run test:run` passes (345/345, no regression).
- [ ] 5.6 `tsc -b --noEmit` + `npm run lint` + `npm run test:run`
      pre-commit gate clean.

## 6. OpenSpec hygiene

- [ ] 6.1 `openspec validate flip-ts-leaves-default-on --strict`
      passes.
- [ ] 6.2 On archive, the build-pipeline requirement reflects the
      flipped default + the new "Explicit umbrella OFF" scenario.
