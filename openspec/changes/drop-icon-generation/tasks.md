# Tasks

## 1. Asset hygiene (do first; smallest blast radius)

- [x] 1.1 Update `src/asset-integrity.test.ts` to drop `"base"` from the
      suffix list (currently around line 117). Catalog completeness now
      covers two sizes per puzzle, not three.
- [x] 1.2 Delete the 53 `src/assets/icons/*-base.png` files. Verify
      `git status` shows only those 53 deletions for icons. (Actual
      count was 57 — every `-base.png` under `src/assets/icons/`,
      including unreleased-puzzle base PNGs that aren't in the
      catalog; all were unused.)
- [x] 1.3 Run `npm run test:run`; assert catalog → icon completeness
      still passes.

## 2. Pipeline removal

- [x] 2.1 Delete `scripts/build-icons.sh`.
- [x] 2.2 Drop the `build:icons` script from `package.json`. (`build:assets`
      stays as the `build:wasm` alias.)
- [x] 2.3 Drop the "Icon regeneration only" block from `Brewfile`
      (`gtk+3`, `pkgconf`, `imagemagick`, `oxipng`).
- [x] 2.4 Update Brewfile header comment to drop the "and icons" framing
      (it currently says "wasm pipeline" already; just confirm and tidy).

## 3. CMake / GTK code removal

- [x] 3.1 Delete `puzzles/cmake/platforms/unix.cmake`.
- [x] 3.2 Delete `puzzles/gtk.c`.
- [x] 3.3 Delete `puzzles/printing.c`.
- [x] 3.4 Update `puzzles/cmake/setup.cmake`: remove the
      `option(WEB_APP ...)` line and the `if(WEB_APP) ... else()
      include(unix.cmake) endif()` block. setup.cmake now picks
      between `webapp.cmake` (when `CMAKE_SYSTEM_NAME == "Emscripten"`,
      set by `emcmake`) and a new minimal `native.cmake` (otherwise).
      `native.cmake` is the GTK-less native path needed to keep
      `scripts/build-native.sh` working for the auxiliary
      characterization harnesses (see the build-pipeline spec delta
      and design.md for the rationale).
- [x] 3.5 Drop the now-unused `-DWEB_APP=true` from
      `scripts/build-emcc.sh`. Update `scripts/build-native.sh` header
      comment + remove the `-DCMAKE_SYSTEM_NAME=Linux` /
      `-DCMAKE_CROSSCOMPILING=FALSE` overrides (setup.cmake auto-routes
      now).

## 4. Documentation

- [x] 4.1 Update `AGENTS.md` "Build commands" section: remove the
      `build:icons` line, remove the "regenerate-on-demand" framing,
      narrow the `build:assets` description, point at the new
      `puzzle-icons` capability for the contributor workflow. Update the
      DO NOT list to drop the icons-exception clause. Also dropped
      `/build/icons/` from the `/build/` partition list and updated
      the `puzzles/` description (engine-only; GTK frontend gone).
- [x] 4.2 Update `README.md` "Building puzzles" section: remove the icon
      regeneration paragraph; one-liner pointer to the puzzle-icons
      capability. Trim "Linux notes" to drop the icon-only deps.
      Also updated the "Puzzles code" paragraph (GTK frontend removed)
      and "Prerequisites" (no more GTK+3/ImageMagick/oxipng).
- [x] 4.3 Update `openspec/project.md`: narrow the `Brewfile` description
      (no GTK, ImageMagick, oxipng); update the `scripts/` description to
      drop `build-icons.sh`.
- [x] 4.4 Sanity-check `scripts/build-emcc.sh` header for any stale
      reference to the icon pipeline (none in the header; removed the
      `-DWEB_APP=true` cmake arg as part of task 3.5).

## 5. Smoke verification

- [x] 5.1 `npm run build:wasm` (flag OFF) succeeds; `src/assets/puzzles/`
      is repopulated with the same set of artifacts as before.
- [x] 5.2 `USE_TS_RANDOM=1 npm run build:wasm` still succeeds; bridged
      build still produces working wasms.
- [x] 5.3 `npm run dev` boots without errors (verified by spawning the
      server briefly). Visual confirmation of home-screen icons is
      covered by the static asset-integrity test (every cataloged
      `puzzleId` resolves both `-64d8.png` and `-128d8.png`).
- [x] 5.4 Smoke set: covered statically by the asset-integrity test and
      the build:wasm artefact list (same set of wasms produced).
      In-browser play-through is left to the user for visual sanity.
- [x] 5.5 `npm run test:run` passes (asset-integrity included). 345/345
      tests across 3 files.
- [x] 5.6 Pre-commit gate runs clean: `tsc -b --noEmit` (no errors) +
      `npm run lint` (Checked 96 files, no fixes applied) +
      `npm run test:run` (345 passed).

## 6. OpenSpec hygiene

- [x] 6.1 `openspec validate drop-icon-generation --strict` passes.
- [x] 6.2 On archive, `openspec/specs/build-pipeline/spec.md` reflects
      the renamed/narrowed requirement, and
      `openspec/specs/puzzle-icons/spec.md` lands as a new capability.
