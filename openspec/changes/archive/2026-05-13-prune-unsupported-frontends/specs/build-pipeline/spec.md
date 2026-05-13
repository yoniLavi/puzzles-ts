# build-pipeline spec delta

## MODIFIED Requirements

### Requirement: WASM and icon builds run on host-native tooling

The wasm and icon build pipelines SHALL execute on the developer's host
machine using brew-installed tooling (Emscripten, GTK+3, ImageMagick,
halibut, jq, oxipng, coreutils), with no dependency on a container
runtime (Docker, Podman, etc.). A `Brewfile` at the repository root
SHALL enumerate every external dependency needed to build the
deliverables from a clean checkout.

The pipeline SHALL preserve the env-var surface and output locations of
the prior Docker-based scripts so that consumers (npm scripts, the
in-tree characterization harnesses, future seam-port changes) need no
adjustment beyond invoking the host-native scripts in place of the
container.

The pipeline targets exactly two frontends from the upstream `puzzles/`
subtree: the **webapp** path (`puzzles/cmake/platforms/webapp.cmake`,
producing wasm + catalog + manual into `src/assets/puzzles/`) and the
**unix/GTK** path (`puzzles/cmake/platforms/unix.cmake`, used only to
screenshot puzzle binaries for icon generation into
`src/assets/icons/`). All other upstream frontends — Windows, macOS,
NestedVM, KaiOS, the KaiOS-targeted Emscripten adapter, and the Java
applet — SHALL NOT be present in the tree. Their source files, CMake
platform files, and supporting toolchain files are removed; upstream
remains the canonical source for anyone building those platforms.

#### Scenario: Clean-checkout build succeeds with brew bundle only

- **WHEN** a contributor clones the repository on a machine with only
  brew installed
- **AND** runs `brew bundle install && npm install` followed by the
  documented `build:wasm` and `build:icons` commands
- **THEN** `src/assets/puzzles/` and `src/assets/icons/` are populated
  with the same set of artifacts the Docker pipeline previously produced
- **AND** no `docker`/`podman` invocation appears anywhere in the build
  path

#### Scenario: USE_TS_RANDOM still toggles the TS random bridge

- **WHEN** the host-native `build:wasm` is invoked with
  `USE_TS_RANDOM=1`
- **THEN** the produced wasms import the seven `random_*` symbols from
  the JS-library bridge (matching the behaviour spec'd in the `random`
  capability)
- **AND** the same byte-fidelity Solo round-trip
  (`randomSeed=3x3#786954740169111` → `formatAsText` MD5
  `d704406cde2b755bf708f9dc543b1c96`) holds

#### Scenario: Docker artefacts are gone from the tree

- **WHEN** the change has landed
- **THEN** the repository contains no Dockerfiles, no `docker run` /
  `podman run` invocations in README or scripts, and no references to
  `/app/puzzles` or `/app/build` container paths in build tooling

#### Scenario: Only webapp + unix CMake platform files remain

- **WHEN** the change has landed
- **THEN** `puzzles/cmake/platforms/` contains exactly two files:
  `webapp.cmake` and `unix.cmake`
- **AND** `puzzles/cmake/setup.cmake` selects between them by `WEB_APP`
  alone — no `CMAKE_SYSTEM_NAME` branch for Windows / Darwin / NestedVM,
  no KaiOS `else()` fallback
- **AND** no source file in `puzzles/` targets Windows, macOS, KaiOS,
  NestedVM, or the Java applet frontend (no `windows.c`, `osx.m`,
  `nestedvm.c`, `PuzzleApplet.java`, `kaios/`, `emcc.c`, `emcclib.js`,
  `emccpre.js`, `emcccopy.but`, `winwix.mc`, `padtoolbar.bmp`,
  `puzzles.rc`, `puzzle.desktop.in`, `desktop.pl`, `osx-help.but`,
  `osx/`)

#### Scenario: Upstream release infra is not maintained in-tree

- **WHEN** the change has landed
- **THEN** `puzzles/` contains no `Buildscr`, `CHECKLST.txt`,
  `Makefile.doc`, `webpage.pl`, `website.url`, `chm.css`,
  `benchmark.pl`, or `benchmark.sh`
- **AND** any future need for an end-to-end soak benchmark (per PLAN.md
  "Test discipline" layer 3) is satisfied by a TS implementation, not by
  reviving the dropped Perl/shell scripts
