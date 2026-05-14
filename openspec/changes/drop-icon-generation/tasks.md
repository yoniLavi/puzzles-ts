# Tasks

## 1. Asset hygiene (do first; smallest blast radius)

- [ ] 1.1 Update `src/asset-integrity.test.ts` to drop `"base"` from the
      suffix list (currently around line 117). Catalog completeness now
      covers two sizes per puzzle, not three.
- [ ] 1.2 Delete the 53 `src/assets/icons/*-base.png` files. Verify
      `git status` shows only those 53 deletions for icons.
- [ ] 1.3 Run `npm run test:run`; assert catalog → icon completeness
      still passes.

## 2. Pipeline removal

- [ ] 2.1 Delete `scripts/build-icons.sh`.
- [ ] 2.2 Drop the `build:icons` script from `package.json`. (`build:assets`
      stays as the `build:wasm` alias.)
- [ ] 2.3 Drop the "Icon regeneration only" block from `Brewfile`
      (`gtk+3`, `pkgconf`, `imagemagick`, `oxipng`).
- [ ] 2.4 Update Brewfile header comment to drop the "and icons" framing
      (it currently says "wasm pipeline" already; just confirm and tidy).

## 3. CMake / GTK code removal

- [ ] 3.1 Delete `puzzles/cmake/platforms/unix.cmake`.
- [ ] 3.2 Delete `puzzles/gtk.c`.
- [ ] 3.3 Delete `puzzles/printing.c`.
- [ ] 3.4 Update `puzzles/cmake/setup.cmake`: collapse the
      `if(WEB_APP) ... else() include(unix.cmake) endif()` block to
      unconditional `include(cmake/platforms/webapp.cmake)`. Remove the
      `option(WEB_APP ...)` line.

## 4. Documentation

- [ ] 4.1 Update `AGENTS.md` "Build commands" section: remove the
      `build:icons` line, remove the "regenerate-on-demand" framing,
      narrow the `build:assets` description, point at the new
      `puzzle-icons` capability for the contributor workflow. Update the
      DO NOT list to drop the icons-exception clause.
- [ ] 4.2 Update `README.md` "Building puzzles" section: remove the icon
      regeneration paragraph; one-liner pointer to the puzzle-icons
      capability. Trim "Linux notes" to drop the icon-only deps.
- [ ] 4.3 Update `openspec/project.md`: narrow the `Brewfile` description
      (no GTK, ImageMagick, oxipng); update the `scripts/` description to
      drop `build-icons.sh`.
- [ ] 4.4 Sanity-check `scripts/build-emcc.sh` header for any stale
      reference to the icon pipeline (probably none).

## 5. Smoke verification

- [ ] 5.1 `npm run build:wasm` (flag OFF) succeeds; `src/assets/puzzles/`
      is repopulated with the same set of artifacts as before.
- [ ] 5.2 `USE_TS_RANDOM=1 npm run build:wasm` still succeeds; bridged
      build still produces working wasms.
- [ ] 5.3 `npm run dev` boots; the home page shows per-puzzle icons (from
      the committed snapshot).
- [ ] 5.4 Smoke set: cube, mines, solo, loopy, flip play through one
      move each.
- [ ] 5.5 `npm run test:run` passes (asset-integrity included).
- [ ] 5.6 Pre-commit hook runs clean: `tsc -b --noEmit` + `npm run lint`
      + `npm run test:run`.

## 6. OpenSpec hygiene

- [ ] 6.1 `openspec validate drop-icon-generation --strict` passes.
- [ ] 6.2 On archive, `openspec/specs/build-pipeline/spec.md` reflects
      the renamed/narrowed requirement, and
      `openspec/specs/puzzle-icons/spec.md` lands as a new capability.
