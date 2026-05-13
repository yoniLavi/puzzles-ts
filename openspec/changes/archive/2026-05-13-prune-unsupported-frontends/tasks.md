# Tasks

## 1. Verify the deletion set is closed

- [x] 1.1 Re-run `grep -rn` from the proposal for every dropped file, confirm
  no surviving reference outside the deletion set itself.
- [x] 1.2 Confirm `webapp.cmake` and `unix.cmake` together cover every code
  path our `scripts/build-{emcc,icons}.sh` walk; cross-reference against
  `puzzles/CMakeLists.txt`.
- [x] 1.3 Confirm no `solver(...)`, `cliprogram(...)`, or `guiprogram(...)`
  call in `CMakeLists.txt` resolves to a body that builds on the web path
  (i.e. `build_cli_programs`/`build_gui_programs` are FALSE in webapp.cmake).

## 2. Remove top-level frontends and assets

- [x] 2.1 Delete `puzzles/windows.c`, `puzzles/winwix.mc`,
  `puzzles/padtoolbar.bmp`, `puzzles/puzzles.rc`.
- [x] 2.2 Delete `puzzles/osx.m`, `puzzles/osx-help.but`, `puzzles/osx/`.
- [x] 2.3 Delete `puzzles/PuzzleApplet.java`, `puzzles/nestedvm.c`,
  `puzzles/kaios/`.
- [x] 2.4 Delete `puzzles/puzzle.desktop.in`, `puzzles/desktop.pl`.

## 3. Remove the KaiOS-only emcc adapter

- [x] 3.1 Delete `puzzles/emcc.c`, `puzzles/emcclib.js`, `puzzles/emccpre.js`,
  `puzzles/emcccopy.but`.
- [x] 3.2 Edit `puzzles/cmake/platforms/webapp.cmake` to remove
  `${CMAKE_CURRENT_SOURCE_DIR}/emcccopy.but` from the halibut DEPENDS list
  (the file is already commented out of the COMMAND).

## 4. Remove CMake plumbing for dropped platforms

- [x] 4.1 Delete `puzzles/cmake/platforms/{windows,osx,nestedvm,emscripten}.cmake`.
- [x] 4.2 Delete `puzzles/cmake/{nestedvm-toolchain,toolchain-mingw,windows-dummy-toolchain}.cmake`.
- [x] 4.3 Delete `puzzles/cmake/glob-symlinks.py`.
- [x] 4.4 In `puzzles/cmake/setup.cmake`, collapse the
  `if(CMAKE_SYSTEM_NAME MATCHES "Windows") … elseif … else()` block to
  just two branches: `WEB_APP` → `webapp.cmake`, otherwise `unix.cmake`.

## 5. Remove upstream release / website infra

- [x] 5.1 Delete `puzzles/Buildscr`, `puzzles/CHECKLST.txt`,
  `puzzles/Makefile.doc`.
- [x] 5.2 Delete `puzzles/webpage.pl`, `puzzles/website.url`, `puzzles/chm.css`.
- [x] 5.3 Delete `puzzles/benchmark.pl`, `puzzles/benchmark.sh`.

## 6. Verify clean build

- [x] 6.1 Wipe the build dirs and re-run `npm run build:wasm` (flag OFF).
  Confirm `src/assets/puzzles/` contains the same set of files as before
  (modulo immaterial timestamp differences).
- [x] 6.2 Re-run `USE_TS_RANDOM=1 npm run build:wasm`. Confirm the random
  bridge still links — Solo round-trip
  (`randomSeed=3x3#786954740169111` → `formatAsText` MD5
  `d704406cde2b755bf708f9dc543b1c96`) still holds.
- [x] 6.3 Re-run `npm run build:icons`. Confirm `src/assets/icons/` is
  unchanged.
- [x] 6.4 `npm run dev`, smoke five puzzles (cube, mines, solo, loopy,
  flip) through at least one move and one share-game-id round trip.

## 7. Documentation

- [x] 7.1 Update README's "Structure" section so the description of
  `puzzles/` matches the trimmed contents (no more "Windows", "macOS",
  "KaiOS").
- [x] 7.2 Add a short note to PLAN.md "What's been done" recording this
  cleanup and that we now diverge from medmunds/upstream on the frontend
  inventory.

## 8. Spec sync

- [ ] 8.1 After landing, `openspec archive prune-unsupported-frontends
  --yes` to promote the build-pipeline spec delta.
