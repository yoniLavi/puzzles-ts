# Change: Drop the icon-generation pipeline (gtk.c, unix.cmake, brew GTK)

## Why

The previous `prune-unsupported-frontends` change explicitly **deferred**
removing `puzzles/gtk.c`, `puzzles/printing.c`, `puzzles/ps.c`, and
`puzzles/cmake/platforms/unix.cmake` because they were "load-bearing for
icons" — the GTK frontend was the rendering engine for the headless
screenshots that produce per-puzzle thumbnail PNGs in `src/assets/icons/`.
Quoted from `prune-unsupported-frontends/proposal.md`:

> "Deferred (not in this change). These are entangled with the icons
>  pipeline or with `core_obj` and are out of scope here. The cleanup
>  proposal will revisit them when the dependency is gone."

Two recent shifts make those files unnecessary now:

1. **`src/assets/icons/` is a committed snapshot.** A separate ungated
   change (just landed; not previously spec'd) committed the 53×3 PNGs to
   git, removed the gitignore line, and reduced `npm run build:assets` to
   wasm-only. The icon-build script was demoted to "regenerate-on-demand."
2. **The C source is frozen.** Per AGENTS.md "Upstream policy", the
   `puzzles/` subtree is no longer tracked upstream. Since the icons are
   screenshots of frozen C, their *content* is also frozen. Running
   `build-icons.sh` would produce, by construction, the same bytes that
   are already in git.

So the script and its dependency cascade — ~5,000 lines of upstream GTK
code, 130 lines of CMake platform plumbing, a 100-line bash script, and
four brew deps (`gtk+3`, `pkgconf`, `imagemagick`, `oxipng`) — are pure
carrying cost. A future contributor adding a new puzzle to the catalog
can produce the two required PNGs by playing the puzzle in the running
PWA and screenshotting the canvas: a 3-minute manual workflow that's
strictly simpler than installing a brew GTK toolchain to run a
CMake-driven headless GTK binary.

This change executes the cleanup for `gtk.c`, `printing.c`, and
`unix.cmake`. It deliberately KEEPS `ps.c` in `core_obj` for the same
reason as before (low-value edit to the upstream core source list, no
measurable wasm size impact); revisit when the broader rewrite reaches a
natural deletion checkpoint per AGENTS.md "C is never deleted until the
rewrite is complete."

## What Changes

### Pipeline removal

- `scripts/build-icons.sh` — delete.
- `package.json` — drop the `build:icons` npm script.
- `Brewfile` — drop the "Icon regeneration only" block (`gtk+3`,
  `pkgconf`, `imagemagick`, `oxipng`); update the file's header comment.

### CMake / GTK code removal

- `puzzles/cmake/platforms/unix.cmake` — delete (~130 lines).
- `puzzles/gtk.c` — delete (~4,781 lines).
- `puzzles/printing.c` — delete (only pulled in by `unix.cmake`'s
  `platform_common_sources`).
- `puzzles/cmake/setup.cmake` — collapse the `WEB_APP` toggle. Today:
  `if(WEB_APP) include(webapp.cmake) else() include(unix.cmake) endif()`.
  After: unconditional `include(cmake/platforms/webapp.cmake)`. The
  `option(WEB_APP ...)` line goes away.

### Asset hygiene

- The 53 `*-base.png` files in `src/assets/icons/` are unused (only
  `-64d8` and `-128d8` are read by `src/components/catalog-card.ts:54,58`).
  Delete them.
- Update `src/asset-integrity.test.ts` to drop `"base"` from the suffix
  list (line ~117).

### Documentation

- `AGENTS.md` — re-edit the "Build commands" section: remove the
  `build:icons` line and the "regenerate-on-demand" framing; narrow the
  `build:assets` description; point at the new `puzzle-icons` capability
  for the contributor workflow. Update the DO NOT list to drop the
  icons-exception clause we added a moment ago.
- `README.md` — re-edit the "Building puzzles" section to drop the icon
  regeneration paragraph; point at `openspec/specs/puzzle-icons/spec.md`
  for the contributor workflow. Trim "Linux notes" to drop the
  icon-only deps.
- `openspec/project.md` — narrow the `Brewfile` and `scripts/`
  descriptions.

### Deliberate scoping (not in this change)

- `puzzles/ps.c` stays in `core_obj`. Same reasoning as
  `prune-unsupported-frontends`: low-value edit to the upstream core
  source list, no measurable wasm size impact, defer to a natural future
  deletion checkpoint.
- `/build/icons/` directory disappears organically (no script writes
  there any more). No proactive `.gitignore` cleanup is needed —
  `/build/` is already wholesale ignored.
- TS-side icon rendering (e.g. a hidden `/dev/screenshot/<puzzleId>` URL
  that captures the puzzle canvas at fixed dimensions) — out of scope.
  The manual workflow is sufficient for the expected frequency of icon
  additions; revisit if friction proves real.

## Impact

- **Affected specs**:
  - `build-pipeline` — RENAMED + MODIFIED. The single existing
    requirement narrows from "WASM and icon builds" to "WASM build";
    icon-related scenarios drop, a new scenario asserts the GTK
    artefacts are gone.
  - `puzzle-icons` — ADDED. New capability codifying the
    committed-snapshot policy and the manual screenshot workflow for
    new puzzles.
- **Affected code**:
  - Deletions: `puzzles/gtk.c`, `puzzles/printing.c`,
    `puzzles/cmake/platforms/unix.cmake`, `scripts/build-icons.sh`,
    53 × `src/assets/icons/*-base.png`.
  - Edits: `puzzles/cmake/setup.cmake`, `package.json`, `Brewfile`,
    `AGENTS.md`, `README.md`, `openspec/project.md`,
    `src/asset-integrity.test.ts`.
- **Affected workflows**:
  - Contributors no longer need brew `gtk+3` / `pkgconf` / `imagemagick`
    / `oxipng`. The routine path becomes `emscripten` / `halibut` / `jq`
    / `cmake` / `coreutils`.
  - `npm run build:icons` no longer exists.
  - Adding a new puzzle to the catalog requires producing two PNGs by
    hand (procedure documented in `puzzle-icons` spec).
- **Risk**: low.
  - Files removed are upstream frontend / build-system code, not engine
    code. The wasm build (`webapp.cmake`) does not reference any of
    them.
  - The committed PNGs are identical to what the deleted pipeline would
    produce on this fork, so visual fidelity does not change.
  - `ps.c` stays as-is, so `core_obj` is untouched; the wasm build has
    zero risk of breaking on this change.
- **Verification**:
  - `npm run build:wasm` (flag OFF and `USE_TS_RANDOM=1`) succeeds and
    produces the same set of artifacts in `src/assets/puzzles/`.
  - `npm run dev` boots; the home page shows per-puzzle icons (now
    strictly from the committed snapshot); a smoke set of puzzles (cube,
    mines, solo, loopy, flip) play through one move each.
  - `npm run test:run` passes; `src/asset-integrity.test.ts` continues
    to assert catalog → icon completeness over the two remaining sizes.
  - `git ls-files puzzles/gtk.c puzzles/printing.c
    puzzles/cmake/platforms/unix.cmake scripts/build-icons.sh` returns
    zero rows.
