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

The long-term goal is to replace the C engine with native TypeScript, **top-down and product-value-first**. The authoritative statement of the migration approach is the `ts-migration` capability spec (`openspec/specs/ts-migration/spec.md`); this section is the readable summary. The prior bottom-up, byte-identical-fidelity doctrine was superseded on 2026-05-18 by the `pivot-to-top-down-ts` change and is preserved on branch `legacy/seam-by-seam-fidelity` + tag `pre-ts-pivot` in case of reversal.

## Goal

Replace the C/WASM puzzle engine with native TypeScript, ordered so that **user-facing value lands early** and the codebase becomes one where new games and cross-game features are cheap to build. Deliberate divergence from upstream (quick-save, mistake-checking, explained hints, per-game gameplay aids) is the *point*, not a fidelity regression. The bar for a ported game is "plays correctly, behavioural tests green, dev-time spot-check against C looks right" — **not** byte-identical reproduction of a recorded corpus.

## Lineage

- **Upstream**: [Simon Tatham's Portable Puzzle Collection][sgt-puzzles]. ~40 puzzles, MIT-licensed, actively maintained by Simon and a long list of contributors.
- **Direct parent**: [medmunds/puzzles-web]. A PWA shell over upstream's C compiled to WASM via Emscripten, using a C++ `webapp.cpp` + Embind as a typed frontend adapter, running the WASM in a Web Worker (via Comlink), with a Lit/Web-Awesome/Vite TS app. The `puzzles/` directory is a git subtree of upstream with a small number of local patches.
- **This project**: forked from puzzles-web. Replaces the C engine with native TypeScript, top-down, eventually displacing it entirely while deliberately growing beyond upstream's feature set.

## Upstream policy: no merges; C is a reference, not an oracle

This project is **not tracking upstream**. We forked from medmunds/puzzles-web at a specific point, which forked from Simon Tatham's puzzles at a specific point. No future merges from either upstream into the `puzzles/` subtree.

1. **The C source under `puzzles/` is a readable *reference* and a dev-time *differential-check* source — not an immutable byte-oracle.** It encodes years of subtle generator/solver logic (uniqueness, difficulty grading, symmetry) that is priceless to *read* when porting and to *spot-check against* in dev. It is still not casually edited (it's a stable reference and the no-merge subtree), but the reason is "don't churn the reference," not "byte parity is a release gate." There is no characterization-corpus parity bar.

2. **Files we added live in `puzzles/` too but follow our rules.** `puzzles/webapp.cpp` (the Embind adapter), `puzzles/random_bridge.js`, the harnesses under `puzzles/auxiliary/*`, and project-side CMake edits are *our code in upstream's directory*. Edit them freely. Test: does the file appear in the original Simon Tatham repository? If yes, it's the reference — change it only with cause. If no, it's ours.

- `puzzles/LICENCE` stays intact (MIT obligation, independent of tracking policy).
- A game's C source **is deleted when that game's TS port ships** (per-game, not deferred to a whole-rewrite endpoint — see "C deletion" below). `puzzles/` goes away entirely only when the last game is ported.

## Approach: top-down, product-value first

1. **Build the TS midend + a clean `Game` interface first.** Undo/redo/timer/preset/serialise (clean TS save format) plus the interface every ported game implements. This is the keystone — every product goal (new games, quick-save, mistake-check, hints, per-game aids) needs it. It is *first*, not last.
2. **Port games top-down, by behaviour.** Simplest first (Cube/Flip/Pegs) to establish the pattern, then the games we want to enhance (Galaxies for the cell↔dot aid), then outward to the rest. A game is "done" when it plays correctly under manual + behavioural tests and a dev-time differential spot-check against the C build looks right.
3. **Per-game hybrid.** C/WASM remains the runtime for every not-yet-ported game; ported games run their TS implementation; the app presents both uniformly. C for a game is deleted when its port ships.
4. **Leaf libraries are ported lazily, idiomatically, on demand.** When a game being ported needs dsf / tree234 / sort / findloop, write an idiomatic TS equivalent as an ordinary module dependency (dsf ≈ a ~20-line union-find; tree234 ≈ a Map or sorted structure). No standalone bridged seams, no corpora.

### Why this approach (alternatives considered and rejected)

- **Bottom-up seam-by-seam with byte-identical corpora (the prior plan).** Rejected/superseded. It delivered infrastructure first and user value last, and its byte-identical-fidelity bar directly conflicts with deliberately diverging from upstream (you cannot be byte-identical *and* add hints/aids). Preserved on `legacy/seam-by-seam-fidelity` if ever needed.
- **Full scratch rewrite, no C reference.** Rejected. The generators/solvers are genuinely hard; the C is a priceless *reference* even when not a byte-oracle. Keep it readable and diff-able, not deleted up front.
- **Top-down, C-as-reference, per-game (this plan).** Delivers a hot-reloading, enhanceable game (Galaxies) in weeks instead of after the entire leaf+mid+drawing layers; the irreducibly-hard part (faithful-enough generators) is identical in every plan, so don't also pay for a corpus on top.

## Test discipline

There is **no inherited test suite**. We build the discipline from scratch, now without a byte-corpus layer:

1. **Behavioural tests per ported game / module.** Ordinary unit/integration tests asserting the thing behaves correctly (generates solvable boards, solver solves them, input transitions are right, serialise/deserialise round-trips). Property tests where there's a closed-form invariant ("combi emits exactly C(n,r) lex-ordered tuples") — cheap, additive, catches unrecorded-input regressions.
2. **Dev-time differential spot-check.** An advisory harness that generates N boards from both the C build and the TS port for the same seed and surfaces diffs for human review. Review signal, **not** a pass/fail gate. Per-game tightening (a stricter check for a generator with brutal uniqueness constraints) is allowed but is not the default.
3. **Pre-commit gate stays:** `tsc -b --noEmit` → `biome lint` → `vitest run`.

Bit-identical RNG (`random.ts`, already ported) is retained so *future* shared game IDs reproduce across builds. Old C-format saves and pre-pivot shared IDs are expendable by decision.

## C deletion: per game, when its port ships

A game's `puzzles/<game>.c` is deleted once that game's TS port has landed and shipped — deletion is **per game**, not deferred to a whole-collection endpoint. C/WASM remains the runtime for unported games until each is ported. The collection is fully migrated, and `puzzles/` removed entirely, only when the last game lands. The point: don't carry a per-game C fallback past the moment its TS replacement is trusted in production.

## TS port style: idiomatic throughout

Port to the most idiomatic TS shape — classes over handle-passing, `[Symbol.iterator]()` over `while (next())`, `boolean` over `0|1`, GC over explicit `free()`, modern data structures over C-array mirrors. Use the C as a *reference for the logic* (what deductions the solver makes, how the generator ensures uniqueness), not as a control-flow template to mirror line-for-line. There is no corpus that a refactor could break, so write it clean the first time; the dev-time differential spot-check catches gross divergence.

## Migration order

Top-down, product-value first:

1. **TS midend + `Game` interface** — the keystone. **Landed** (`ts-midend-and-game-interface`): `src/native/engine/` ships the `Game` interface, the `Midend`, the runtime per-game registry, and the clean save codec, behind the unchanged Comlink surface, with an empty registry.
2. **Pattern-establishing game** — smallest (Cube/Flip/Pegs) end-to-end through the new midend (the *next* change); first to `registerGame(...)`, exercises the interface for real, and brings the dev differential harness (plus the deferred redraw/size/config refinements).
3. **Galaxies** — the goal-4 game; once TS, the cell↔dot aid is a small follow-up.
4. **Cross-game features** — quick-save (app-shell, small), optional `findMistakes()` / `hint()` hooks on the `Game` interface implemented per-game as games land.
5. **Outward** — remaining games, simplest-first; leaf libs pulled in idiomatically as needed; worker existence re-evaluated once games are TS (it exists for heavy WASM; light TS games may not need it).
6. **`random.c`** is already TS (`random.ts`); keep it.

## Build commands

- `npm run build:wasm` — compiles the puzzle wasm + manual into `src/assets/puzzles/` via `scripts/build-emcc.sh`. **Defaults to hybrid TS+C**: `USE_TS_LEAVES` defaults ON (CMake) and `VITE_USE_TS_LEAVES` defaults ON (worker), so zero-arg `npm run build:wasm && npm run dev` ships the hybrid build that production runs. Set `USE_TS_LEAVES=0` (paired with `VITE_USE_TS_LEAVES=0` on the worker side) to fall back to pure C — useful when bisecting whether a regression came from a TS port or the C reference. (Note: this umbrella is *runtime mechanics*; the migration strategy is per-game per the `ts-migration` spec, not per-leaf.) Per-module overrides (`USE_TS_RANDOM`, future `USE_TS_COMBI`, …) flip individual seams against the umbrella in either direction; per-module Vite env vars similarly override `VITE_USE_TS_LEAVES`. The worker fails closed at WASM instantiation if the CMake and Vite flag sets disagree (`assertWasmBridgesCoherent` in `src/puzzle/worker.ts`). When transitioning between flag combinations, reset cmake's cache with `rm -rf build/wasm/` before the next `npm run build:wasm` — cmake's `option()` honours previously-cached values, so a stale cache will silently win.
- `npm run build:assets` — alias for `build:wasm`. Kept as a wrapper so existing muscle memory and the `npm run build` doc-string still work; per-puzzle thumbnail icons are a committed snapshot (see `openspec/specs/puzzle-icons/spec.md`), not a build output.
- `scripts/build-native.sh [target...]` — host-native build of the harness sources in `puzzles/auxiliary/` (default target: `random-trace`). Output: `build/native/`. These back the dev-time differential spot-check (C vs TS port); run on demand, no npm wrapper because it's not part of `build:assets`.
- `npm run dev` — vite dev server.
- `npm run build` — production app build (tsc + vite). Assumes `build:assets` already ran.
- `npm run preview` — preview production build.
- `npm run check` — biome format + lint with autofix.
- `npm run test` / `npm run test:run` — vitest.

`src/assets/puzzles/` is gitignored (regenerate via `build:wasm`). `src/assets/icons/` is **committed** as a frozen snapshot of per-puzzle thumbnails; adding a new puzzle requires producing two PNGs by hand (see `openspec/specs/puzzle-icons/spec.md`). `src/asset-integrity.test.ts` asserts every catalog `puzzleId` has both its PNGs (64×64 and 128×128) and that every `new URL(<path>, import.meta.url)` reference in `src/` resolves. Everything under `build/` is gitignored too.

## Code conventions

- **TypeScript**: strict mode, no `any` (use `unknown` + type guards).
- **Formatter / linter**: Biome (2-space indent, 88 char width).
- **UI**: Lit web components; explicitly register Web Awesome components by importing them (e.g. `import "@awesome.me/webawesome/dist/components/button/button.js"`).
- **Reactive state**: `@lit-labs/signals`; use `SignalWatcher` mixin where consuming.
- **Persistence**: IndexedDB via Dexie.js (`src/store/db.ts`).
- **WASM**: runs in a web worker, exposed via Comlink (`src/puzzle/`).
- **Styling**: Web Awesome design tokens.
- **C code in `/puzzles`**: it's a *reference*, not an oracle (see "Upstream policy"). Don't churn it casually — it's a stable reference and a no-merge subtree — but it carries no byte-parity release gate. A game's C is deleted when its TS port ships. Files we added there (`webapp.cpp`, `*_bridge.js`, `auxiliary/*`) are ours — edit freely.

## Constraints

DO NOT:
- Casually churn the upstream C source under `/puzzles` or `/puzzles/unreleased` — it's a stable reference and a no-merge subtree (see "Upstream policy"). Reading it to port a game is the *expected* use. Deleting a game's C when its TS port ships is also expected. Our own additions there (`webapp.cpp`, `*_bridge.js`, `auxiliary/*`) are fine to edit.
- Break Baseline 2023 browser compatibility.
- Use top-level await, dynamic `import()`, or `import.meta` in `src/preflight.ts` — preflight runs on older browsers to gate the rest of the app.
- Add dependencies without considering bundle size and offline (PWA) support.
- Commit generated assets in `src/assets/puzzles/` or anything under `build/`. (`src/assets/icons/` is the exception — it's a committed snapshot maintained per `openspec/specs/puzzle-icons/spec.md`; add the two required PNGs by hand when a new puzzle joins the catalog.)
- Catch unrecoverable errors only to log them — let them propagate so Sentry records them.

DO:
- Test on touch devices and varying screen sizes when changing UI.
- Verify offline functionality still works (PWA / service worker).
- Check changes work with keyboard, mouse, and touch input.
- Consider accessibility.
- Take ownership of everything in this repo. Never describe a problem you observe as "pre-existing", "unrelated", or "out of scope" — that framing assumes a baseline blamelessness this project doesn't grant. If you see it, you own it: either fix it now, file it as a follow-up with a clear handoff, or surface it to the user with a recommendation. The framing matters because "unrelated" is also how a regression you actually caused gets misclassified and shipped.
- Don't ask the user "should I continue?" or "want me to commit and move on?" at every checkpoint. Continue by default once a task is complete and the next step is obvious. Reserve `AskUserQuestion` (and inline questions) for *actual decisions* — choices where there's a real trade-off, the course is genuinely unclear, or an action carries non-trivial risk (destructive, irreversible, affects shared state, or could surprise the user). Status pings at every step are friction, not diligence.

## Repo layout

Three roles to keep distinct:

- **`puzzles/`** (in-tree subtree of upstream). The trimmed upstream source (engine only; the GTK frontend was removed in `drop-icon-generation`), including `auxiliary/`. Reference + dev-time differential-check source; a game's C is deleted when its TS port ships. Project tooling (the differential-check harness, any auxiliary tooling) lives under `puzzles/auxiliary/`.
- **`../puzzles/`** (sibling clone). Useful only for running upstream's own tools (`benchmark.sh`, future upstream auxiliary tests) unmodified. **Not** a place to put our work.
- **`../puzzles-web/`** (sibling clone). The pre-fork baseline; useful as a diff reference in early phases.

Build outputs are partitioned under `/build/` (all gitignored):

- `/build/wasm/` — Emscripten cmake build (from `build-emcc.sh`).
- `/build/native/` — characterization-harness binaries (from `build-native.sh`).

Source tree under `src/`:

- `src/screens/` — top-level screen components.
- `src/dialogs/` — modal/popover Lit components.
- `src/components/` — reusable leaf Lit components.
- `src/native/<module>/` — TS ports of shared engine modules (today: `random/{index.ts, bridge.ts, sha1.ts, *.test.ts}`). The TS midend and per-game ports introduced by the top-down plan will land here / under a sibling games dir; exact layout is decided in `ts-midend-and-game-interface`.
- `src/assets/` (generated), `src/css/` (styles), `src/puzzle/` (puzzle runtime + Comlink worker), `src/store/` (Dexie schema), `src/utils/` (general-purpose helpers).
- HTML page entries, main bootstrap (`main.ts`), preflight gate (`preflight.ts`), service worker (`sw.ts`), and cross-cutting modules (`routing.ts`, `color-scheme.ts`, `color-scheme-init.ts`, `icons.ts`) live at `src/` root.

## Special files

- `puzzles/webapp.cpp` — frontend adapter between C puzzle code and TS via Embind.
- `src/puzzle/puzzle.ts`, `src/puzzle/worker.ts` — how the wasm frontend is exposed to the rest of the app.
- `templates/index.html.hbs`, `templates/puzzle.html.hbs` — handlebars templates for static page generation (handled by `vite-plugins/extra-pages.ts`).
- `src/preflight.ts` — Baseline 2023 capability checks.
- `src/store/db.ts` — Dexie schema.
- `src/sw.ts` — service worker (Workbox + vite-plugin-pwa).
- `puzzles/auxiliary/` — host-native harness sources (e.g. `random-trace.c`). Under the new plan these back the dev-time *differential spot-check* (generate N boards from C vs the TS port for the same seed, surface diffs) — an advisory dev aid, not a gating corpus.

## Work management

Tracked via **openspec**. See `openspec/OPENSPEC_AGENTS.md` for the workflow (proposal → tasks → design → spec deltas → validate → implement → archive). Treat this `AGENTS.md` and `openspec/project.md` as durable context; the authoritative migration approach is the `ts-migration` capability spec. Change-scoped tasks live in `openspec/changes/`.

**One openspec change per coherent unit of work** — the TS midend is one change; each game port is one change; a cross-game feature (quick-save) is one change. Bundle only when several items share genuinely identical `design.md` reasoning (e.g. three trivially-similar small games after the pattern is well-trodden); keep separate when an item has its own non-obvious decisions. A game port that ships its C deletion does both in the one change.

## What's been done

Recorded here as durable reference, not a changelog (commit history carries the detail):

- **Project setup**: openspec initialised; layered `LICENSE.md` + `CREDITS.md`; Vitest + a strict pre-commit gate (`tsc -b --noEmit` → `npm run lint` → `npm run test:run`).
- **`random.c` (TS impl half)** — `port-random-to-typescript`: corpus harness in-tree at `puzzles/auxiliary/random-trace.c`; corpus at `src/native/random/__fixtures__/corpus.json` (6 fixtures, 66 calls); TS port in `src/native/random/{index.ts, sha1.ts}`; replay test passes byte-for-byte.
- **`random.c` (bridge half)** — `wire-random-to-wasm`: TS owns canonical state, C holds integer handles, bridge via Emscripten `--js-library`, gated by `USE_TS_RANDOM` (CMake) + `VITE_USE_TS_RANDOM` (worker) (initially default OFF; later folded under `USE_TS_LEAVES` and flipped to default ON — see entries below). Five puzzles verified end-to-end through the bridge (cube/flip/mines/loopy/solo, 0 console errors).

  Sizing data for the next seam's "wire it up" half: ~40 min elapsed in the implementing session, dominated by ~25 min of docker rebuild latency across ~6 cold builds (eliminated by host-native build, see below). Four surprises captured in `wire-random-to-wasm/design.md` cost roughly one rebuild loop each: (1) `random.c` carries `misc.c`'s SHA-1 dep; (2) `build-emcc.sh` was baked into the docker image; (3) `tee` swallowed the docker exit code, masking a silent link failure; (4) `--js-library` only emits an env import when a C reference is live — needs `__attribute__((used))` keep-alive in `webapp.cpp`.
- **Build pipeline → host-native** (`remove-docker-emcc-build`): replaced `Docker/build-{emcc,icons}.{sh,Dockerfile}` with `scripts/build-{emcc,icons}.sh` driven by a brew-installed Emscripten + GTK+3 (see `Brewfile`); npm wrappers are `build:wasm`, `build:icons`, `build:assets`. Cold wasm build dropped from ~4 min (Docker) to ~1:51 (flag-OFF) / ~2:15 (flag-ON); incremental wasm rebuild is now ~2s, removing the iteration-latency tax. Side fix in `puzzles/emcc-dependency-info.py` resolves brew's symlinked `emcc` for license attribution. The Cloudflare Pages workflow inherited from upstream is disabled in this fork; rewiring it against the new scripts is left for whenever this fork wants its own CI/CD.
- **Pruned upstream frontends** (`prune-unsupported-frontends`): dropped every upstream platform this fork doesn't ship — Windows (`windows.c`, `winwix.mc`, `padtoolbar.bmp`, `puzzles.rc`), macOS (`osx.m`, `osx/`, `osx-help.but`), KaiOS (`kaios/` + the KaiOS-targeted `emcc.c`/`emcclib.js`/`emccpre.js`/`emcccopy.but` and `emscripten.cmake`), NestedVM (`nestedvm.c`, `nestedvm-toolchain.cmake`, `glob-symlinks.py`), Java applet (`PuzzleApplet.java`), Linux .desktop packaging (`puzzle.desktop.in`, `desktop.pl`), Windows MinGW toolchain helpers, and upstream's release infra (`Buildscr`, `CHECKLST.txt`, `Makefile.doc`, `webpage.pl`, `website.url`, `chm.css`, `benchmark.pl`, `benchmark.sh`). `puzzles/cmake/setup.cmake` then selected `webapp.cmake` (wasm via `WEB_APP=ON`) or `unix.cmake` (icons via GTK headless screenshots). `gtk.c`, `printing.c`, and `unix.cmake` were kept at that point (load-bearing for icons) and were later removed in `drop-icon-generation` once the icon pipeline became unnecessary; `ps.c` stays in `core_obj` (no measurable wasm size impact, defer to a future deletion checkpoint). From here on we diverge from medmunds on the frontend inventory; continue tracking upstream Simon Tatham for engine-side changes.
- **Root + src/ reorg** (`reorganize-repo-tooling`, `reorganize-src-layout`): vite plugin source moved to `vite-plugins/`, handlebars templates moved to `templates/`, build outputs consolidated under `/build/`. `src/` grouped by role: `screens/`, `dialogs/`, `components/`.
- **Pre-seam structure consolidation** (`consolidate-pre-seam-structure`): `src/native/` regrouped per ported module (`src/native/random/{index.ts, bridge.ts, sha1.ts, __fixtures__/, random.test.ts}`); `PLAN.md` folded into this `AGENTS.md`; `CLAUDE.md` symlinked to `AGENTS.md`; `openspec/AGENTS.md` renamed to `openspec/OPENSPEC_AGENTS.md` to avoid collision; `scripts/build-native.sh` added so harness binaries actually land in `/build/native/` as the build-pipeline spec already said they should.
- **Icon pipeline drop** (`drop-icon-generation`): deleted `scripts/build-icons.sh`, `puzzles/gtk.c`, `puzzles/printing.c`, `puzzles/cmake/platforms/unix.cmake`; dropped `gtk+3`/`pkgconf`/`imagemagick`/`oxipng` from `Brewfile`. `puzzles/cmake/setup.cmake` now auto-routes by `CMAKE_SYSTEM_NAME`: emscripten → `webapp.cmake`, native → new `platforms/native.cmake` (a minimal GTK-less platform file that keeps `scripts/build-native.sh` building the auxiliary harnesses). Per-puzzle thumbnails under `src/assets/icons/` are now a committed snapshot maintained per the new `puzzle-icons` spec — new puzzles need two PNGs produced by hand from the running PWA.
- **USE_TS_LEAVES umbrella + worker coherence check** (`add-use-ts-leaves-umbrella-flag`): one CMake option (`USE_TS_LEAVES`) and one Vite env var (`VITE_USE_TS_LEAVES`) gate the entire leaf-library bridge family at once. Per-module flags (`USE_TS_RANDOM`, future `USE_TS_COMBI`, …) survive as debugging overrides — set them explicitly to flip an individual seam against the umbrella in either direction. The worker enumerates WASM imports at instantiation (`assertWasmBridgesCoherent` in `src/puzzle/worker.ts`) and fails closed with a templated error if the CMake and Vite sides disagree (forward mismatch); reverse mismatch is silent by design. Each new bridge ports add one row to `FORWARD_MISMATCH_PROBES` and one `option(USE_TS_<MODULE> ... ${_default_ts_module})` line — that's the whole boilerplate.
- **Umbrella default flipped to ON** (`flip-ts-leaves-default-on`): zero-arg `npm run build:wasm && npm run dev` now produces the hybrid TS+C build that production runs. Pure C is now opt-in via `USE_TS_LEAVES=0` (paired with `VITE_USE_TS_LEAVES=0` on the worker side) — useful for bisecting "is this a TS-port regression or upstream-C behaviour?"
- **Doctrine pivot to top-down TS** (`pivot-to-top-down-ts`, 2026-05-18): the migration strategy was inverted. C went from immutable byte-oracle to readable reference + dev-time differential-check source; byte-identical characterization corpora dropped for behavioural tests + an advisory spot-check; seam order inverted from bottom-up (random→leaves→…→midend) to top-down (TS midend + `Game` interface first, then games simplest→Galaxies→outward, leaf libs lazily as idiomatic TS); C deletion is now per-game when each port ships; clean TS save format (old saves / pre-pivot shared IDs expendable; `random.ts` keeps future IDs stable); deliberate divergence from upstream is the point. Authoritative spec: `openspec/specs/ts-migration/spec.md`. The prior approach is preserved on branch `legacy/seam-by-seam-fidelity` + tag `pre-ts-pivot`. The obsolete `add-benchmark-soak` proposal (byte-diff hybrid-vs-pure) was retired. The `USE_TS_LEAVES` umbrella + coherence check still function as runtime mechanics but are no longer the migration *strategy* (migration is per-game now); a per-game switch is designed in the next change.

- **TS midend + `Game` interface keystone** (`ts-midend-and-game-interface`): `src/native/engine/` now holds the idiomatic `Game<Params,State,Move,Ui,DrawState>` interface (immutable state, GC not dup/free, union/boolean not int sentinels, discriminated `SolveResult`), the `Midend` orchestrator (move/undo/redo with a parallel move log, restart, solve→solved-with-help, preset-tree flattening, params validation, `params:desc`/`params#seed` ids, timer, size, redraw, existing `ChangeNotification` emission), the **runtime per-game registry** (the hybrid decision point — *not* a build flag), the clean versioned-JSON save codec, and a `TsWorkerPuzzle` adapter wired by a single dispatch seam in `src/puzzle/worker.ts`. The registry **ships empty**, so production is the byte-identical all-WASM path until the first port calls `registerGame(...)`. 22 behavioural/property tests drive a fake `Game` (no corpus). The drawing/size/config-UI contract is intentionally minimal — the first port refines it (an explicit interface-refinement allowance, not a spec breach).

## Known unresolved questions

- ~~Per-game switch shape~~ — **decided** (`ts-midend-and-game-interface`): a **runtime `puzzleId`→`Game` registry**, not a build flag. Present ⇒ TS midend; absent ⇒ C/WASM. `USE_TS_LEAVES` stays orthogonal (C-internal leaf bridges only). Alternatives (`USE_TS_<GAME>` flag / catalog field / tree-shake) and rationale: that change's `design.md`.
- ~~Where the TS midend + `Game` interface + per-game ports live in `src/`~~ — **decided** (same change, codified in the `repo-layout` spec): `src/native/engine/` for the engine, `src/native/games/<puzzleId>/` for ports; the retired mandatory `__fixtures__/` corpus was dropped from `src/native/<module>`.
- Whether the Web Worker survives once games are TS. It exists for heavy WASM; light TS games may not need it. Re-evaluate after the first few game ports (flagged in the `ts-migration` spec).
- Whether any single game ever warrants reinstating a stricter (corpus-like) differential check — a generator with brutal uniqueness constraints might. Left as a per-game tightening option, not a global default.
- The `~/codeliance/codeliance-stack/evaluator` doc convention this fork mirrors expects `openspec update` to be run rarely; if upstream openspec adds a way to configure the instruction filename, prefer that over the rename dance.

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
