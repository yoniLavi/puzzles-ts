<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/OPENSPEC_AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/OPENSPEC_AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions. Note: `openspec update` writes to `openspec/AGENTS.md` (upstream's convention). This project renames that file to `openspec/OPENSPEC_AGENTS.md` to avoid colliding with the project-root `AGENTS.md`. After running `openspec update`, re-rename the regenerated file and re-point this managed block at `@/openspec/OPENSPEC_AGENTS.md` if it got reverted.

<!-- OPENSPEC:END -->

# Notes for All Agents (also symlinked as CLAUDE.md)

`CLAUDE.md` is a symbolic link to this file. There is one source of truth for the project's strategic context and working conventions; both names read the same content.

## Project at a glance

PWA port of [Simon Tatham's Portable Puzzle Collection][sgt-puzzles]. Two halves:

- **C/C++ puzzles** in `/puzzles` (git subtree of upstream + `puzzles/unreleased`), compiled to WebAssembly via host-native Emscripten (see `Brewfile`).
- **TypeScript web app** in `/src` using Lit web components and Vite. Targets Baseline 2023 (see `src/preflight.ts`).

The long-term goal is to progressively replace the C engine with native TypeScript while keeping the app green at every step. See *Goal*, *Approach*, and *Seam order* below for the why and the shape.

## Goal

Gradually replace the C/WASM puzzle engine in this project with a native TypeScript implementation, while keeping the app green at every step. The non-negotiable bar is **fidelity** (byte-identical behavior at every replaced seam, verified by characterization tests) combined with **incremental risk** (no big-bang rewrite, no sustained red bar).

## Lineage

- **Upstream**: [Simon Tatham's Portable Puzzle Collection][sgt-puzzles]. ~40 puzzles, MIT-licensed, actively maintained by Simon and a long list of contributors.
- **Direct parent**: [medmunds/puzzles-web]. A PWA shell over upstream's C compiled to WASM via Emscripten, using a C++ `webapp.cpp` + Embind as a typed frontend adapter, running the WASM in a Web Worker (via Comlink), with a Lit/Web-Awesome/Vite TS app. The `puzzles/` directory is a git subtree of upstream with a small number of local patches.
- **This project**: forked from puzzles-web. Pushes the TS/WASM seam progressively deeper into the C code, eventually displacing it entirely.

## Approach: Feathers-style seam replacement

Treat each C module as a unit to "characterize, seam, replace" per Michael Feathers' *Working Effectively with Legacy Code*:

1. Pick a seam — typically a single C module with a clean, well-bounded interface.
2. Generate **characterization tests**: feed the existing C implementation a corpus of inputs, capture outputs as golden data.
3. Implement a TS equivalent.
4. Replay the corpus against the TS impl; assert byte-identical outputs.
5. Add an Embind/cwrap bridge so the rest of the C code can call the TS impl instead of its own. Verify benchmark-style integration tests still pass.
6. Once stable, delete the C impl; the TS impl becomes the only implementation.

This pattern is already proven for the frontend boundary in puzzles-web (`webapp.cpp` + Embind + Comlink). The work here extends it inward.

### Why this approach (alternatives considered and rejected)

- **Full native TS rewrite from scratch.** Rejected. ~100–150 KLOC of subtle generator/solver logic with no fidelity bar during the journey; loses upstream's bug-fix lineage; multi-person-year effort with no incremental green bar.
- **Port one whole puzzle end-to-end, side-by-side with WASM.** Simpler infra and a quicker first ship, but each puzzle requires re-deriving its dependencies (midend slice, drawing, library helpers). Higher per-puzzle cost and no shared TS library to amortize across puzzles.
- **Seam-by-seam (this plan).** Most disciplined. Highest fidelity (golden tests at every step). Keeps upstream integration viable for un-displaced modules. The cost is real bridge boilerplate per seam and the obligation to maintain two parallel implementations during each transition.

## Test discipline

There is **no inherited test suite** of any depth. Upstream has per-module unit tests in `puzzles/auxiliary/` (e.g. `tree234-test.c`, `latin-test.c`) and used to ship a `benchmark.sh` smoke test (dropped in the `prune-unsupported-frontends` change; the equivalent will be re-implemented in TS). puzzles-web shipped no tests at v0.0.1. We are building this discipline from scratch.

Three layers of testing, in increasing scope:

1. **Characterization tests per seam.** Golden input/output corpora captured from the native C binary; replayed against the TS impl with byte-identical assertions. Each new seam ships with its corpus. This is the primary fidelity guarantee.
2. **Upstream per-module unit tests, ported.** Where upstream's `auxiliary/*-test.c` covers a module we're replacing (tree234, latin, dsf-via-findloop, sort, combi, hat, penrose, spectre), port the test to TS alongside the module. The C test becomes the spec.
3. **Benchmark soak (end-to-end).** Per-preset board generation across every puzzle, replacing upstream's `benchmark.sh` with a TS implementation that drives both the pure-WASM and hybrid TS/WASM builds. Both must stay green.

Bit-identical RNG is **important** for characterization tests (so traces replay deterministically), and is also a product-side win (existing game IDs and shared puzzles keep working in the TS build).

## Seam order

Bottom-up, leaves first, to maximize how much downstream code benefits from each replacement:

1. **`random.c`** — done. ~350 lines (SHA-1 based pure state machine), every puzzle uses it. Shipped in two openspec changes: `port-random-to-typescript` (characterize → TS impl → corpus replay) and `wire-random-to-wasm` (`--js-library` bridge + build flag, WASM rebuild, browser verification). Patterns established here — in-tree harnesses, JSON corpus replay via Vitest, the integer-handle bridge — carry to every later seam.
2. **Leaf libraries**: `tree234.c`, `dsf.c`, `combi.c`, `sort.c`, `findloop.c`, `matching.c`, `divvy.c`. Each has a clear interface; most have existing C unit tests.
3. **Mid-level shared logic**: `latin.c`, `loopgen.c`, `grid.c`, `laydomino.c`, `penrose.c`, `hat.c`, `spectre.c`.
4. **Drawing API**: `drawing.c` is already a function-pointer dispatcher — a natural seam. In the WASM build, per-frontend drawing handlers are already JS (callbacks dispatched from `webapp.cpp` via Embind); displacing the C wrapper is mostly removing a layer.
5. **Per-puzzle back ends**: ~40 files, smallest first (Cube, Pegs, Flip). Each back end's `const game thegame` table is a natural seam.
6. **`midend.c`** — last. ~3.2 KLOC of stateful undo/redo/timing/serialisation. The biggest single port; benefits enormously from having all its transitive callees already in TS.

## Build commands

- `npm run build:wasm` — compiles the puzzle wasm + manual into `src/assets/puzzles/` via `scripts/build-emcc.sh`. Honours `USE_TS_RANDOM=1` (must be paired with `VITE_USE_TS_RANDOM=1` for vite).
- `npm run build:icons` — generates puzzle icons into `src/assets/icons/` via `scripts/build-icons.sh` (uses brew GTK+3 + ImageMagick + oxipng).
- `npm run build:assets` — both, in series.
- `scripts/build-native.sh [target...]` — host-native build of the characterization harnesses in `puzzles/auxiliary/` (default target: `random-trace`). Output: `build/native/`. Run on demand when fixtures need regenerating; no npm wrapper because it's not part of `build:assets`.
- `npm run dev` — vite dev server.
- `npm run build` — production app build (tsc + vite). Assumes `build:assets` already ran.
- `npm run preview` — preview production build.
- `npm run check` — biome format + lint with autofix.
- `npm run test` / `npm run test:run` — vitest.

Both `src/assets/icons/` and `src/assets/puzzles/` are gitignored — regenerate via the scripts above when stale. Everything under `build/` is gitignored too.

## Code conventions

- **TypeScript**: strict mode, no `any` (use `unknown` + type guards).
- **Formatter / linter**: Biome (2-space indent, 88 char width).
- **UI**: Lit web components; explicitly register Web Awesome components by importing them (e.g. `import "@awesome.me/webawesome/dist/components/button/button.js"`).
- **Reactive state**: `@lit-labs/signals`; use `SignalWatcher` mixin where consuming.
- **Persistence**: IndexedDB via Dexie.js (`src/store/db.ts`).
- **WASM**: runs in a web worker, exposed via Comlink (`src/puzzle/`).
- **Styling**: Web Awesome design tokens.
- **C code in `/puzzles`**: keep upstream's style (`puzzles/.clang-format`) untouched. Subtree fidelity matters for future upstream merges.

## Constraints

DO NOT:
- Modify `/puzzles` or `/puzzles/unreleased` without considering upstream impact (these are git subtrees pulled from upstream — see `puzzles/auxiliary/` for our own additions/harnesses that live alongside).
- Break Baseline 2023 browser compatibility.
- Use top-level await, dynamic `import()`, or `import.meta` in `src/preflight.ts` — preflight runs on older browsers to gate the rest of the app.
- Add dependencies without considering bundle size and offline (PWA) support.
- Commit generated assets in `src/assets/icons/`, `src/assets/puzzles/`, or anything under `build/`.
- Catch unrecoverable errors only to log them — let them propagate so Sentry records them.

DO:
- Test on touch devices and varying screen sizes when changing UI.
- Verify offline functionality still works (PWA / service worker).
- Check changes work with keyboard, mouse, and touch input.
- Consider accessibility.

## Repo layout

Three roles to keep distinct:

- **`puzzles/`** (in-tree subtree of upstream). The trimmed upstream source (engine + GTK frontend), including `auxiliary/`. **All project work** — characterization harnesses, fixtures, any auxiliary tooling — lives here. The harness pattern is established by `puzzles/auxiliary/random-trace.c`.
- **`../puzzles/`** (sibling clone). Useful only for running upstream's own tools (`benchmark.sh`, future upstream auxiliary tests) unmodified. **Not** a place to put our work.
- **`../puzzles-web/`** (sibling clone). The pre-fork baseline; useful as a diff reference in early phases.

Build outputs are partitioned under `/build/` (all gitignored):

- `/build/wasm/` — Emscripten cmake build (from `build-emcc.sh`).
- `/build/icons/` — Unix/GTK cmake build for icons (from `build-icons.sh`).
- `/build/native/` — characterization-harness binaries (from `build-native.sh`).

Source tree under `src/`:

- `src/screens/` — top-level screen components.
- `src/dialogs/` — modal/popover Lit components.
- `src/components/` — reusable leaf Lit components.
- `src/native/<module>/` — one folder per ported C module. Holds the TS impl (`index.ts`), the worker-side bridge (`bridge.ts`, when wasm callers exist), per-module fixtures (`__fixtures__/`), Vitest tests (`*.test.ts`), and any internal deps that aren't yet their own seam (e.g. `src/native/random/sha1.ts`).
- `src/assets/` (generated), `src/css/` (styles), `src/puzzle/` (puzzle runtime + Comlink worker), `src/store/` (Dexie schema), `src/utils/` (general-purpose helpers).
- HTML page entries, main bootstrap (`main.ts`), preflight gate (`preflight.ts`), service worker (`sw.ts`), and cross-cutting modules (`routing.ts`, `color-scheme.ts`, `color-scheme-init.ts`, `icons.ts`) live at `src/` root.

## Special files

- `puzzles/webapp.cpp` — frontend adapter between C puzzle code and TS via Embind.
- `src/puzzle/puzzle.ts`, `src/puzzle/worker.ts` — how the wasm frontend is exposed to the rest of the app.
- `templates/index.html.hbs`, `templates/puzzle.html.hbs` — handlebars templates for static page generation (handled by `vite-plugins/extra-pages.ts`).
- `src/preflight.ts` — Baseline 2023 capability checks.
- `src/store/db.ts` — Dexie schema.
- `src/sw.ts` — service worker (Workbox + vite-plugin-pwa).
- `puzzles/auxiliary/random-trace.c` — pattern-establishing characterization harness for the random seam; the model future seams copy from.

## Work management

Tracked via **openspec**. See `openspec/OPENSPEC_AGENTS.md` for the workflow (proposal → tasks → design → spec deltas → validate → implement → archive). Treat this `AGENTS.md` and `openspec/project.md` as durable context; per-seam tasks live in `openspec/changes/`.

## What's been done

Recorded here as durable reference, not a changelog (commit history carries the detail):

- **Project setup**: openspec initialised; layered `LICENSE.md` + `CREDITS.md`; Vitest + a strict pre-commit gate (`tsc -b --noEmit` → `npm run lint` → `npm run test:run`).
- **`random.c` (TS impl half)** — `port-random-to-typescript`: corpus harness in-tree at `puzzles/auxiliary/random-trace.c`; corpus at `src/native/random/__fixtures__/corpus.json` (6 fixtures, 66 calls); TS port in `src/native/random/{index.ts, sha1.ts}`; replay test passes byte-for-byte.
- **`random.c` (bridge half)** — `wire-random-to-wasm`: TS owns canonical state, C holds integer handles, bridge via Emscripten `--js-library`, gated by `USE_TS_RANDOM` (CMake) + `VITE_USE_TS_RANDOM` (worker) (both default OFF). Five puzzles verified end-to-end through the bridge (cube/flip/mines/loopy/solo, 0 console errors).

  Sizing data for the next seam's "wire it up" half: ~40 min elapsed in the implementing session, dominated by ~25 min of docker rebuild latency across ~6 cold builds (eliminated by host-native build, see below). Four surprises captured in `wire-random-to-wasm/design.md` cost roughly one rebuild loop each: (1) `random.c` carries `misc.c`'s SHA-1 dep; (2) `build-emcc.sh` was baked into the docker image; (3) `tee` swallowed the docker exit code, masking a silent link failure; (4) `--js-library` only emits an env import when a C reference is live — needs `__attribute__((used))` keep-alive in `webapp.cpp`.
- **Build pipeline → host-native** (`remove-docker-emcc-build`): replaced `Docker/build-{emcc,icons}.{sh,Dockerfile}` with `scripts/build-{emcc,icons}.sh` driven by a brew-installed Emscripten + GTK+3 (see `Brewfile`); npm wrappers are `build:wasm`, `build:icons`, `build:assets`. Cold wasm build dropped from ~4 min (Docker) to ~1:51 (flag-OFF) / ~2:15 (flag-ON); incremental wasm rebuild is now ~2s, removing the iteration-latency tax. Side fix in `puzzles/emcc-dependency-info.py` resolves brew's symlinked `emcc` for license attribution. The Cloudflare Pages workflow inherited from upstream is disabled in this fork; rewiring it against the new scripts is left for whenever this fork wants its own CI/CD.
- **Pruned upstream frontends** (`prune-unsupported-frontends`): dropped every upstream platform this fork doesn't ship — Windows (`windows.c`, `winwix.mc`, `padtoolbar.bmp`, `puzzles.rc`), macOS (`osx.m`, `osx/`, `osx-help.but`), KaiOS (`kaios/` + the KaiOS-targeted `emcc.c`/`emcclib.js`/`emccpre.js`/`emcccopy.but` and `emscripten.cmake`), NestedVM (`nestedvm.c`, `nestedvm-toolchain.cmake`, `glob-symlinks.py`), Java applet (`PuzzleApplet.java`), Linux .desktop packaging (`puzzle.desktop.in`, `desktop.pl`), Windows MinGW toolchain helpers, and upstream's release infra (`Buildscr`, `CHECKLST.txt`, `Makefile.doc`, `webpage.pl`, `website.url`, `chm.css`, `benchmark.pl`, `benchmark.sh`). `puzzles/cmake/setup.cmake` now selects `webapp.cmake` (wasm via `WEB_APP=ON`) or `unix.cmake` (icons via GTK headless screenshots) — no other platform branches. `gtk.c`, `printing.c`, and `ps.c` were intentionally kept (load-bearing for icons / in `core_obj`); they go later when icon generation moves off GTK. From here on we diverge from medmunds on the frontend inventory; continue tracking upstream Simon Tatham for engine-side changes.
- **Root + src/ reorg** (`reorganize-repo-tooling`, `reorganize-src-layout`): vite plugin source moved to `vite-plugins/`, handlebars templates moved to `templates/`, build outputs consolidated under `/build/`. `src/` grouped by role: `screens/`, `dialogs/`, `components/`.
- **Pre-seam structure consolidation** (`consolidate-pre-seam-structure`): `src/native/` regrouped per ported module (`src/native/random/{index.ts, bridge.ts, sha1.ts, __fixtures__/, random.test.ts}`); `PLAN.md` folded into this `AGENTS.md`; `CLAUDE.md` symlinked to `AGENTS.md`; `openspec/AGENTS.md` renamed to `openspec/OPENSPEC_AGENTS.md` to avoid collision; `scripts/build-native.sh` added so harness binaries actually land in `/build/native/` as the build-pipeline spec already said they should.

## Known unresolved questions

- Whether to keep the WASM in a Web Worker (via Comlink) as TS replacements grow, or migrate logic to the main thread. Likely keep the worker until midend ports, then re-evaluate.
- How long to keep tracking medmunds upstream. Useful in early phases; less useful as our TS layer grows materially. Track upstream Simon Tatham always.
- Performance budget once enough seams have crossed the wasm/JS boundary. Each crossing has fixed cost; at some point it may make sense to batch or to flip whole subsystems at once.
- The `~/codeliance/codeliance-stack/evaluator` doc convention this fork now mirrors expects `openspec update` to be run rarely; if upstream openspec adds a way to configure the instruction filename, prefer that over the rename dance.

## License & attribution

- **Web app code**: MIT (`LICENSE.md`).
- **Upstream puzzles**: MIT (`puzzles/LICENCE`) — kept intact wherever the subtree lives. Satisfies MIT's "include in all copies" obligation.
- **Top-level `LICENSE.md`** carries a layered MIT notice crediting, in chronological order: Simon Tatham + upstream contributors (deferring to `puzzles/LICENCE` for the full list), Mike Edmunds (puzzles-web), Yoni Lavi (this project). Single MIT body covers all three.
- **`CREDITS.md`** is the graceful gesture with explicit thanks and links to upstream and puzzles-web. Legal compliance is satisfied by the layered MIT notice alone.

## Documentation

The in-app help system is assembled from three sources:
- `/help` — main help pages (this fork's additions/divergences).
- `/puzzles/html` — upstream per-puzzle overview.
- `/puzzles/puzzles.but` — upstream manual, built into HTML by halibut as part of `build:wasm`.

Update `/help` when adding features that diverge from upstream.

## Git

- Main branch: `main`.
- Husky pre-commit runs `tsc -b --noEmit` → `biome lint` → `vitest run` (blocks on any failure). See `.husky/pre-commit`.

[sgt-puzzles]: https://git.tartarus.org/?p=simon/puzzles.git
[medmunds/puzzles-web]: https://github.com/medmunds/puzzles-web
