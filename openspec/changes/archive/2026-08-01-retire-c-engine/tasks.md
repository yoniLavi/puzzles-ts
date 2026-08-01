# Tasks — retire-c-engine

Order matters twice over: **hand-author the type surface (§0) before anything
else**, or `tsc` stops dead the moment the generated `.d.ts` goes; and **re-home
the catalog + manual (§1) before removing the Emscripten build (§3)**, or the app
loses its game list and help. Build the app after each stage.

## 0. Re-home the generated type surface (do FIRST — design D0)

- [x] 0.1 In `src/puzzle/types.ts`, replace the `import type … from
      "../assets/puzzles/emcc-runtime"` and the re-export block with
      hand-authored declarations of the same shapes: `Colour`, `Point`, `Size`,
      `Rect`, `KeyLabel`, `PresetMenuEntry`, `DrawTextOptions`,
      `NotifyGameIdChange`, `NotifyGameStateChange`, `NotifyParamsChange`.
- [x] 0.2 Restate `ConfigDescription` / `ConfigItem` / `ConfigValues` directly
      instead of as `ReturnType<Frontend[…]>` — same shapes
      (`ConfigValues = Record<string, string | boolean | number>`).
- [x] 0.3 Restate `DrawingImpl` without `Omit<DrawingWrapper, keyof ClassHandle
      | "notifyOnDestruction">`, and drop `Drawing.bind(module)` +
      `PuzzleModule` from `src/puzzle/drawing.ts`. (`Frontend`, `PuzzleModule`,
      `ClassHandle`, `DrawingWrapper`, `MainModule` are referenced nowhere else
      in `src/` and retire with `WorkerPuzzle` in §2.)
- [x] 0.4 **Verification: no importer changed.** `tsc -b --noEmit` green with
      **zero edits** to any of the 202 files importing `puzzle/types.ts`. A file
      that wants an edit means a shape drifted — fix the shape, not the importer.

## 1. Re-home the assets that ride on the Emscripten build (design D2)

- [x] 1.1 Transcribe all 57 games' catalog metadata (`name`, `description`,
      `objective`, `collection`) out of the `puzzle()` calls in
      `puzzles/CMakeLists.txt` + `puzzles/unreleased/CMakeLists.txt` into a
      committed `src/puzzle/catalog-data.ts`. **Data migration, not a script** —
      the metadata exists nowhere else.
- [x] 1.2 Have `catalog.json`'s consumers read the committed source (`version`
      from the git SHA vite already computes). Remove `vite.config.ts`'s
      config-load-time import of the gitignored
      `./src/assets/puzzles/catalog.json`.
- [x] 1.3 **Verified by an independent parse**, which is stronger than the
      deep-equality check this task originally asked for: a paren-matching
      parser over the `puzzle()` calls in both CMake files (comments stripped —
      they contain parens) reproduced the generated `catalog.json` exactly —
      **57 games, zero field differences**. That also proved the on-disk catalog
      was not stale relative to its source. It cannot become a standing test
      (the CMake files are deleted); the durable guards are
      `catalog-registry.test.ts` (catalog ≡ registry, both directions) and
      `asset-integrity.test.ts` (every catalog id has its two icons).
- [x] 1.4 Keep the halibut manual build (`puzzles.but` → in-app HTML) but detach
      it from wasm compilation, so the manual builds with no Emscripten step
      around it.
- [x] 1.5 Build the app and load a game **plus the help pages** with no
      `build:wasm` having run — prove both assets survive independently.

## 2. Collapse the worker dispatch to the TS engine (design D4)

- [x] 2.1 In `src/puzzle/worker.ts`, remove `WorkerPuzzle`, the WASM
      instantiation, `assertWasmBridgesCoherent`, `FORWARD_MISMATCH_PROBES`, and
      the `explicit()` env-var reader; always construct the TS engine.
- [x] 2.2 Keep `PuzzleEngineSurface` (D4 default) so the app-facing type holds
      steady. Delete the `emcc-runtime` import and the random-bridge install.
- [x] 2.3 Confirm the app's remote puzzle type is unchanged (no `src/screens/`,
      `src/dialogs/`, `src/puzzle/puzzle.ts` or `src/store/` edits needed —
      other than the badge removal in §5, which is a deliberate UI change).

## 3. Remove the Emscripten build + leaf-flag machinery

- [x] 3.1 Delete `scripts/build-emcc.sh`, `webapp.cmake`, `native.cmake`,
      `setup.cmake`, every `CMakeLists.txt` under `puzzles/`, the
      `build:wasm`/`build:assets` npm scripts, and `src/assets/puzzles/*` +
      its `.gitignore` entry.
- [x] 3.2 Remove `USE_TS_LEAVES` / `VITE_USE_TS_LEAVES`, every per-module
      `USE_TS_*` flag, and `src/native/random/bridge.ts` (the C-side bridge).
- [x] 3.3 Delete `puzzles/webapp.cpp`, `puzzles/random_bridge.js`,
      `puzzles/emcc-dependency-info.py`.
- [x] 3.4 Decide `scripts/build-native.sh`'s fate — with no `common` library and
      no harness subjects there is nothing left to build; remove it.
- [x] 3.5 `Brewfile`: drop `emscripten`, `cmake`, `jq` — and `coreutils` too,
      which this task expected to keep: it was there for `gnproc` parallel-job
      detection inside the build scripts, and `build-manual.sh` runs one halibut
      invocation. Only `halibut` remains.

## 4. Delete the runtime-orphaned C sources (design D1)

- [x] 4.1 Re-derive the orphan set against the current build (grep includers +
      the `core_obj`/`common` lists) — do NOT delete from a remembered list.
- [x] 4.2 Delete the C engine stack and leaves: `combi.c`, `draw-poly.c`,
      `drawing.c`, `dsf.c`, `findloop.c`, `latin.c`+`.h`, `malloc.c`,
      `matching.c`+`.h`, `midend.c`, `misc.c`, `ps.c`, `random.c`, `sha.c`,
      `sort.c`, `tdq.c`, `tree234.c`+`.h`, `version.c`+`.h`, `puzzles.h`,
      `gtk.h`, `list.c`, `no-icon.c`, `nullfe.c`, `nullgame.c`, `fuzzpuzz.c`,
      `fuzzpuzz.dict`, `icons/`, `README`, `devel.but`, `.gitignore`.
      `matching.c` is a core source AND an aux program: handle both.
- [x] 4.3 Delete `puzzles/auxiliary/*.c` (combi-test, combi-trace, findloop-test,
      latin-test, matching, obfusc, random-trace, sort-test, tree234-test) — every
      subject is gone.
- [x] 4.4 **Move `puzzles/auxiliary/doc/*.svg` to `docs/`** (D5) — they document
      the hat/spectre tilings, which are live TypeScript in
      `src/native/engine/tilings/`, not deleted C.
- [x] 4.5 Keep: `puzzles/LICENCE`, `puzzles/puzzles.but`, `puzzles/html/**`.
      **Amended on owner review:** the two unbuilt greenfield references were
      going to stay at `puzzles/unfinished/`, but they are dead weight in a tree
      whose only other job is serving help. They moved instead to
      `openspec/changes/add-{path,numgame}-ts-port/reference/`, beside the work
      that reads them, each with a provenance/licence README; upstream's
      `unfinished/README` (all of it about the CMake build) went. `openspec
      validate --all --strict` passes with a `reference/` subdirectory in a
      change (81/81), and `openspec archive` renames the whole change directory,
      so they travel into the archive. `puzzles/` now holds **no C at all**.

## 5. Remove the wasm-era guards and the engine badges

- [x] 5.1 `@sentry/wasm`: drop `wasmIntegration()`, `registerWebWorkerWasm`, the
      `reWasm` third-party-frame filter in `src/utils/sentry.ts`, and the
      dependency from `package.json`.
- [x] 5.2 `vite.config.ts`: drop the CSP `'wasm-unsafe-eval'` allowance, the
      `wasmSourcemaps()` plugin registration, and the PWA `globPatterns` wasm
      entry. Delete `vite-plugins/wasm-sourcemaps.ts`.
- [x] 5.3 `src/dialogs/about-dialog.ts`: drop the fetch of the no-longer-produced
      `dependencies.json` (the emsdk/musl attribution — correctly gone, since we
      no longer ship their code). Left in place it throws on a 404.
- [x] 5.4 `src/dialogs/crash-dialog.ts` + `src/utils/sentry.ts`: drop the
      "Emscripten runtime aborted wasm load" special cases.
- [x] 5.5 **Engine badges (D6)**: remove `renderEngineBadge` from
      `catalog-card.ts` and `puzzle-screen.ts`, and `engineType` /
      `PuzzleEngineType` from `PuzzleStaticAttributes` and its producers.
- [x] 5.6 `scripts/new-game-port.sh`: rewrite the C-referencing steps (it tells
      you to read `puzzles/<game>.c` and write a `*-trace.c` harness) — this is
      the scaffold Path and Numgame will use.
- [x] 5.7 Delete the already-dead `scripts/gen-hat-tables.mjs` and
      `gen-spectre-tables.mjs` (their inputs `puzzles/hat-tables.h` and
      `auxiliary/spectre-tables-dump.c` went with the Loopy subtree), and
      repoint `scripts/diff.vitest.config.mts` (its `scripts/diff-*.test.ts`
      glob already matches nothing) at the colour checks.
- [x] 5.8 `src/puzzle/README.md` — it describes the wasm architecture.

## 6. Web Worker decision (design D3)

- [x] 6.1 **Decision: keep the worker.** Retiring the C engine and moving games
      off-thread are separable concerns, and folding both into one change widens
      a mechanical teardown into a threading rearchitecture (D3). The Comlink
      surface and `TsWorkerPuzzle` already live there, and the heavy generators
      (Loopy Hard, Solo) still benefit from being off the main thread. No code
      change beyond §2. Removing it stays an open question, recorded in
      `openspec/project.md`.

## 7. Close out

- [x] 7.1 **The 48 per-game differentials must still pass, untouched.** They are
      frozen-fixture tests with no binary dependency, and they are the
      regression net for the refactoring rounds that follow this change.
- [x] 7.2 Full gate green (`tsc` → biome → vitest → `vite build`); the gate's
      `vite build` step must no longer assume `build:wasm` populated
      `src/assets/puzzles/` (`scripts/gate.sh` says it does, in prose).
- [x] 7.3 Update `AGENTS.md` (build commands, "Upstream policy", repo layout,
      the hybrid-runtime description) and `openspec/project.md`.
- [x] 7.4 Scaffold the follow-up `rehome-upstream-help-sources` change (D5).
- [x] 7.5 `openspec validate retire-c-engine --strict`.
- [x] 7.6 Dev-verify in Chrome: a game plays, the help pages and the manual
      serve, the About dialog opens, 0 console errors.
- [ ] 7.7 Archive, then commit.
