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

## Upstream policy: no merges; C source is the fidelity oracle

This project is **not tracking upstream**. We forked from medmunds/puzzles-web at a specific point, which forked from Simon Tatham's puzzles at a specific point, and we're porting *those particular versions*. No future merges from either upstream into the `puzzles/` subtree.

Two practical consequences:

1. **The C source under `puzzles/` is immutable** for the lifetime of the port (until the eventual mass deletion when the rewrite is complete — see "C is never deleted until the rewrite is complete"). The C is our fidelity oracle: the characterization corpora are recorded against it; the benchmark soak compares hybrid output against pure-WASM output of *this* C; "did the TS port match the original?" is only a meaningful question if "the original" stays fixed across the entire project. Editing the C source changes our oracle and erodes the parity bar that makes this a port rather than a rewrite.

   The narrow exception: **trivial, observably-neutral instrumentation** is permitted when it lets the soak or a future harness reach engine state that isn't otherwise exposed. The bar: stripping the instrumentation from a build SHALL produce byte-identical output to the instrumented build. Examples that pass: a `#ifdef SOAK_INSTRUMENTATION` block exposing a counter through Embind. Examples that don't: bug fixes, refactors, "improvements," or anything that changes what the engine computes for any input.

2. **Files we added live in `puzzles/` too but follow our rules, not upstream's.** `puzzles/webapp.cpp` (the Embind adapter), `puzzles/random_bridge.js` and future per-module bridges, the harnesses under `puzzles/auxiliary/*-trace.c`, and project-side CMake edits are *our code in upstream's directory*. Edit them freely.

   Test whether a file is ours or upstream's: does it appear in the original Simon Tatham repository? If yes, it's the oracle — hands off. If no, it's ours.

**Constraints that relax under this policy:**

- "Keep `puzzles/.clang-format` style untouched" was a subtree-merge argument; it now follows trivially from "C source isn't edited at all."
- "Small subtree diff; upstreamable" framing in prior commit messages reflects the old policy. Drop it going forward.
- The previously-unresolved question "how long to keep tracking medmunds upstream" is resolved: we don't.

**Constraints that don't relax:**

- `puzzles/LICENCE` stays intact (MIT obligation, independent of tracking policy).
- The C is still the fidelity oracle, so "don't touch it" is *stronger* than under the prior framing, not weaker. Confidence in the rewrite comes from parity with the original, which only holds if "the original" doesn't move.

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

**For pure, deterministic seams**, also add a property-test layer alongside the corpus replay: a small set of invariant assertions that hold for *every* input in the input space, not just the recorded fixtures. For example, "the combi iterator emits exactly `C(n, r)` distinct lex-ordered `r`-tuples" is a 10-line property that catches future regressions which happen to pass the recorded fixtures but break on unrecorded `(r, n)` pairs. Property tests are additive to (not a replacement for) the corpus; they're cheap to add and meaningfully tighten the safety net. Stateful seams (e.g. `random.c`) and seams with no closed-form invariant fall back to corpus + ported upstream tests only.

Bit-identical RNG is **important** for characterization tests (so traces replay deterministically), and is also a product-side win (existing game IDs and shared puzzles keep working in the TS build).

## C is never deleted until the rewrite is complete

`puzzles/<module>.c` files are **not removed** when their TS port goes live. The C implementation stays in the upstream subtree as a permanent fallback, behind whatever build flag toggles between C and TS for that module. C is deleted only when the entire rewrite project is declared complete — *and* "complete" has a concrete trigger, not a vibe.

Concrete trigger for deletion (subject to revision; this is the standing definition):

- All six layers of the seam-order list below have been ported (random → leaf libs → mid-level → drawing → per-puzzle → midend).
- The benchmark soak (test-discipline layer 3) shows zero behavioral diff between the hybrid TS+C build and the pure-WASM build for N consecutive CI runs (N TBD when the soak lands).
- The hybrid build has shipped to production for a settled period without a fidelity-related issue.

Costs we're accepting in exchange for the safety net:

- **Upstream-subtree merges stay coupled to TS.** When a future upstream patch refactors `<module>.c`'s interface, we update both the C file (via subtree merge) and the TS port. Worth it: subtree fidelity stays high, upstream bug-fixes still apply.
- **The build matrix grows.** Pure-WASM, hybrid (umbrella flag ON), and any per-module overrides are all first-class. The benchmark soak runs against each.
- **Readers must understand both implementations.** Mitigation: this file and per-module `design.md`s document which mode ships in production.

The point of the rule: never trade away a working fallback for code cleanliness mid-port. Cleanliness comes once.

## TS port style: idiomatic surface, faithful internals

When porting a C module to TypeScript, **the public surface should be the most idiomatic TS shape that still lets the characterization corpus drive it byte-for-byte.** Prefer classes over handle-passing free functions when the C surface is morally a constructor + methods + destructor; prefer `[Symbol.iterator]()` over `while (next() !== null)`; prefer `boolean` over `0|1`; prefer `readonly T[]` over raw `Int32Array`; prefer GC over an explicit `free()`. Fall back to a closer C mirror only if the idiomatic shape would let a regression hide behind type coercion or would force the corpus harness into contortions. Document any such trade-off in the seam's `design.md`.

Module **internals** are a separate question. Mirror the C control flow exactly during the initial port — loop conditions, increment order, branch shape — because that's how byte-identical fidelity is most easily reasoned about. Refactor internals to more idiomatic TS only *after* the corpus is green and only if the corpus stays green.

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
- **C code in `/puzzles`**: don't edit it. The C is our fidelity oracle (see "Upstream policy"); changes erode the parity bar the whole port relies on. Files we added in that directory (`webapp.cpp`, `*_bridge.js`, `auxiliary/*-trace.c`) are exempt — those are our code.

## Constraints

DO NOT:
- Modify the upstream C source under `/puzzles` or `/puzzles/unreleased`. The C is our fidelity oracle (see "Upstream policy"). Our own additions in those directories (`webapp.cpp`, `*_bridge.js`, `auxiliary/*-trace.c`) are fine to edit. Trivial observably-neutral instrumentation is the only narrow exception.
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

**One openspec change per seam is the default**, not a rule. The first two leaf-library ports (`random.c`, `combi.c`) each got their own change because the pattern was still establishing itself. Once the pattern is well-trodden — by roughly seam 3 or 4 of the leaf-library list — straightforward seams that follow the established template (small module, single upstream interface, clean harness, no surprises in `design.md`) can be bundled into a single openspec change covering several modules at once (`port-leaves-batch-1`, etc.). Bundling is appropriate when each seam's `design.md` content would otherwise be "same as the last one"; it's *not* appropriate when a seam has its own non-obvious decisions (those still get their own change). The bridge half (`wire-X-to-wasm`) follows the same rule: bundle when the bridges are mechanical mirrors of the established `--js-library` pattern, separate when a seam's bridge has its own twist.

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
