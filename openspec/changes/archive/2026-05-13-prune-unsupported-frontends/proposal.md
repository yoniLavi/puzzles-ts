# Change: Prune upstream frontends and release infra that target platforms we don't ship

## Why

`puzzles/` is a subtree of upstream Simon Tatham's collection, which historically
ships nine frontends (GTK, Windows, macOS, Java applet, NestedVM, KaiOS,
Emscripten/KaiOS, an upstream-tailored emcc adapter, and a CLI nullfe). This
fork ships exactly one product — a PWA — and PLAN.md commits the project to a
gradual full TS rewrite. Three concrete costs of carrying the full upstream
surface area:

- **Grep and navigation noise.** `puzzles/` is 130 files; ~30 of them are
  frontends, installers, and release scripts for platforms we will never
  compile. Every file search has to triage them. `windows.c` (3.5k LOC),
  `osx.m` (1.9k LOC), `PuzzleApplet.java` (651 LOC), `nestedvm.c`, and `kaios/`
  are pure carrying cost.
- **Build-config branches.** `puzzles/cmake/setup.cmake` selects between
  Windows / OSX / NestedVM / Emscripten-KaiOS / Unix platform files based on
  `CMAKE_SYSTEM_NAME`. The Unix branch is load-bearing (icons screenshot via
  GTK) and the Emscripten branch is bypassed entirely by `WEB_APP=true`
  (`puzzles/cmake/platforms/webapp.cmake`). The other branches exist only to
  guard upstream toolchains we don't run.
- **KaiOS-only emcc adapter.** `puzzles/{emcc.c, emcclib.js, emccpre.js,
  emcccopy.but}` is upstream's web frontend, replaced in this fork by
  `webapp.cpp` + Embind (README and `webapp.cmake` both say so). It compiles
  only into the KaiOS path, which we don't ship.

PLAN.md already accepts the drift: "How long to keep tracking medmunds
upstream. Useful in early phases; less useful as our TS layer grows
materially." We continue to track upstream Simon Tatham for puzzle-content
changes, but the platform-specific frontends are out of scope for the rewrite.

The user's medium-term target is the web PWA plus, eventually, a packaged
mobile shell on top of the same PWA. Neither uses any of the code being
removed here.

## What Changes

### Top-level frontends and their assets (remove)

- `puzzles/windows.c`, `puzzles/winwix.mc`, `puzzles/padtoolbar.bmp`,
  `puzzles/puzzles.rc` — Windows native frontend + installer.
- `puzzles/osx.m`, `puzzles/osx-help.but`, `puzzles/osx/` — macOS native bundle.
- `puzzles/PuzzleApplet.java` — Java applet frontend (long deprecated upstream).
- `puzzles/nestedvm.c` — NestedVM (Java-bytecode-from-C) backend.
- `puzzles/kaios/` — KaiOS feature-phone manifest/glue.
- `puzzles/puzzle.desktop.in`, `puzzles/desktop.pl` — Linux .desktop file
  template + generator (only used by the GTK packaging path).
- **BREAKING**: Anyone building `puzzles/` natively for Windows / macOS / KaiOS
  / NestedVM / Java applet against this fork will be broken. Upstream is the
  canonical source for those platforms; redirect there.

### KaiOS-only emcc adapter (remove)

`webapp.cmake` is the active web build; the parallel `emscripten.cmake` exists
only for KaiOS. Drop the adapter and its supporting CMake:

- `puzzles/emcc.c`, `puzzles/emcclib.js`, `puzzles/emccpre.js`,
  `puzzles/emcccopy.but`
- `puzzles/cmake/platforms/emscripten.cmake`
- Remove the `if(WEB_APP)` branch in `puzzles/cmake/setup.cmake` — webapp is
  the only emcc path we build.

### CMake platform plumbing for dropped platforms (remove)

- `puzzles/cmake/platforms/windows.cmake`
- `puzzles/cmake/platforms/osx.cmake`
- `puzzles/cmake/platforms/nestedvm.cmake`
- `puzzles/cmake/nestedvm-toolchain.cmake`
- `puzzles/cmake/toolchain-mingw.cmake`
- `puzzles/cmake/windows-dummy-toolchain.cmake`
- `puzzles/cmake/glob-symlinks.py` (only referenced by `nestedvm.cmake`)
- Collapse `puzzles/cmake/setup.cmake`'s platform-selection block to just
  webapp (when `WEB_APP=true`) or unix (default for icons).

### Upstream release / website infra (remove)

These are Simon Tatham's release tooling, not used by our build:

- `puzzles/Buildscr` — bobsleigh-builder script for upstream's release pipeline
- `puzzles/CHECKLST.txt` — upstream release checklist
- `puzzles/Makefile.doc` — upstream doc-publishing makefile
- `puzzles/webpage.pl` — upstream's website generator
- `puzzles/website.url` — Windows shortcut to upstream's website
- `puzzles/chm.css` — Windows CHM help theming
- `puzzles/benchmark.pl`, `puzzles/benchmark.sh` — superseded by the
  characterization-harness pattern outlined in PLAN.md "Test discipline";
  PLAN.md item 3 ("Benchmark soak") will be a TS implementation when needed.

### Deferred (not in this change)

These are entangled with the icons pipeline or with `core_obj` and are out of
scope here. The cleanup proposal will revisit them when the dependency is
gone:

- `puzzles/gtk.c` — load-bearing for icon screenshots (`unix.cmake`).
  Goes once icons come from a TS renderer or another route.
- `puzzles/printing.c` — only pulled in by `unix.cmake` (printing-from-GTK).
  Goes with `gtk.c`.
- `puzzles/ps.c` — postscript helpers compiled into `core_obj`. Dead in the
  wasm output but pulling it out edits the upstream core source list and is
  not worth the conflict surface for ~10 KB of dead bytes.

## Impact

- **Affected specs**: `build-pipeline` (MODIFIED — adds a "supported frontends"
  constraint to the existing requirement).
- **Affected code**:
  - `puzzles/` (file removals, listed above)
  - `puzzles/cmake/setup.cmake` (collapse platform-selection block)
  - `puzzles/cmake/platforms/webapp.cmake` (drop the stale `emcccopy.but`
    line from the halibut DEPENDS list)
- **Verification**:
  - `npm run build:wasm` (flag OFF and `USE_TS_RANDOM=1`) succeeds and
    produces the same set of wasm/json/html artifacts in `src/assets/puzzles/`.
  - `npm run build:icons` succeeds and produces the same icon set in
    `src/assets/icons/`.
  - `npm run dev` boots and a smoke set of puzzles (cube, mines, solo, loopy,
    flip) play through one move each.
  - `git diff --stat puzzles/` should show only deletions plus the small edits
    to `setup.cmake` and `webapp.cmake`.
