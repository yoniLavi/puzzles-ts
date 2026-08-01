# Tasks — fix-ci-after-c-retirement

- [ ] 1.1 Rewrite `.github/workflows/ci.yml`: drop emsdk, the `jq`/`cmake` apt
      packages, the `src/assets/puzzles/` cache and its key, the
      `force_wasm_rebuild` input, and `npm run build:wasm`. Install `halibut`,
      run `npm run build:assets`, then `npm run gate`.
- [ ] 1.2 Re-check the Node version comment — it justified Node 24 by
      `RegExp.escape` in `vite-plugins/wasm-sourcemaps.ts`, which is deleted.
      State the real reason or drop the claim.
- [ ] 2.1 Restate the `build-pipeline` CI requirement: the gate needs no
      generated assets.
- [ ] 2.2 Restate `ts-engine`'s "reproduce the existing Comlink `WorkerPuzzle`
      API surface" and "Per-game engine selection is a runtime registry, not a
      build flag".
- [ ] 3.1 **Grep the applied specs** for every name the teardown deleted
      (`USE_TS_*`, `build:wasm`, `build-emcc`, `webapp.cpp`, `WorkerPuzzle`,
      `emcc-runtime`, `assets/puzzles`, `random_bridge`, `ts-ported-ids`) and
      confirm only historical prose remains.
- [ ] 4.1 Gate green; `openspec validate --all --strict`.
- [ ] 4.2 Archive, then commit.
