# Tasks — retire-c-engine

Order matters: **re-home the catalog + manual (§1) before removing the
Emscripten build (§3)**, or the app loses its game list and help. Build the app
after each stage.

## 1. Re-home the assets that ride on the Emscripten build (do FIRST)

- [ ] 1.1 Generate `catalog.json` without cmake — directly from the TS catalog
      metadata (all games are TS-served now, so the union is just the TS list).
      A small script or vite plugin; verify the produced catalog matches the
      current one for every `puzzleId`.
- [ ] 1.2 Keep the halibut manual build (`puzzles.but` → in-app HTML) but detach
      it from the wasm compilation, so the manual still builds with no
      Emscripten toolchain step around it.
- [ ] 1.3 Build the app and load a game **plus the help pages** with no
      `build:wasm` having run — prove both assets survive independently.

## 2. Collapse the worker dispatch to the TS engine (design D4)

- [ ] 2.1 In `src/puzzle/worker.ts`, remove the `WorkerPuzzle` C/WASM path, the
      WASM instantiation, and `assertWasmBridgesCoherent`; always construct the
      TS engine (`createTsEngine`).
- [ ] 2.2 Keep or inline the shared `PuzzleEngineSurface` (D4 — default: keep it;
      it holds the app-facing type stable). Delete `WorkerPuzzle` and its imports.
- [ ] 2.3 Confirm the app's remote puzzle type is unchanged (no `src/screens/`,
      `src/dialogs/`, `src/puzzle/puzzle.ts` or `src/store/` edits needed).

## 3. Remove the Emscripten build + leaf-flag machinery

- [ ] 3.1 Delete `scripts/build-emcc.sh`, `webapp.cmake`, the `build:wasm` /
      `build:assets` npm scripts (or repoint them at the new asset build), and
      the `src/assets/puzzles/*.wasm` outputs + their gitignore/glob wiring.
- [ ] 3.2 Remove the `USE_TS_LEAVES` / `VITE_USE_TS_LEAVES` umbrella and every
      per-module `USE_TS_*` flag (CMake + Vite env), and the `FORWARD_MISMATCH_PROBES`
      / coherence machinery — they gate C-internal bridges that no longer exist.
- [ ] 3.3 Delete `puzzles/webapp.cpp`, `puzzles/random_bridge.js`, and any other
      `*_bridge.js` that only served the C↔TS leaf seam.

## 4. Delete the runtime-orphaned C sources (design D1)

- [ ] 4.1 Re-derive the orphan set against the current build (grep includers +
      the `core_obj`/`common` lists) — do NOT delete from a remembered list.
- [ ] 4.2 Delete the orphaned leaves + C engine stack: `tree234.c`+`.h`,
      `latin.c`+`.h`, `combi.c`, `dsf.c`, `findloop.c`, `sort.c`, `midend.c`,
      `drawing.c`, `misc.c`, `malloc.c`, `tdq.c`, `ps.c`, `draw-poly.c`,
      `version.c`, the random stack, the null frontends — building after each
      batch. `matching.c` is a core source AND an aux program: handle both.
      Keep `puzzles/LICENCE`. Confirm `divvy.c` is already gone (it is).
- [ ] 4.3 Prune the now-empty auxiliary harnesses whose subjects were deleted
      (latin-test, tree234-test, combi-test/trace, sort-test, matching, obfusc,
      findloop-test, random-trace — whichever no longer have a subject) and their
      `cliprogram()` lines. Decide whether `scripts/build-native.sh` survives at
      all; if nothing remains for it to build, remove it too.

## 5. Web Worker decision (design D3)

- [ ] 5.1 Record the decision (default: keep the worker — retiring C and moving
      games off-thread are separable). If keeping, no code change beyond §2. If
      removing, that is a separate follow-up, not this change.

## 6. Close out

- [ ] 6.1 Full gate green (`tsc` → biome → vitest → `vite build`) with the new
      asset build in place; the gate's `vite build` step must no longer assume
      `build:wasm` populated `src/assets/puzzles/`.
- [ ] 6.2 Update `AGENTS.md` (the build commands, the "Upstream policy", the
      repo-layout notes) and any doc that describes the hybrid runtime.
- [ ] 6.3 `openspec validate retire-c-engine --strict`.
- [ ] 6.4 Dev-verify: a clean checkout builds and runs the app (a game + help)
      with the Emscripten toolchain uninstalled.
- [ ] 6.5 Archive, then commit.
