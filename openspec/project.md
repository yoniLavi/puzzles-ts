# Project Context

## Purpose

`puzzles-ts` is an ongoing port of [Simon Tatham's Portable Puzzle Collection](https://git.tartarus.org/?p=simon/puzzles.git) from C/WASM to native TypeScript. The eventual goal is to replace the C engine entirely while keeping the app green at every step.

The non-negotiable bar is **fidelity** (byte-identical behavior at every replaced seam, verified by characterization tests) combined with **incremental risk** (no big-bang rewrite, no sustained red bar). The full strategic context — goal, lineage, approach, test discipline, seam order, what's been done — lives in `AGENTS.md` (project root). This `project.md` is the openspec-flavoured slice that openspec tooling reads; `AGENTS.md` is the broader brief.

## Tech Stack

- **Language**: TypeScript (strict), targeting modern browsers via Vite 7
- **UI**: Lit 3 + Web Awesome 3 + Material Design / Lucide icons
- **State / reactivity**: `@lit-labs/signals`, `signal-utils`, `@lit/context`
- **Persistence**: Dexie (IndexedDB)
- **Workers / IPC**: Comlink wraps the WASM puzzle worker
- **WASM toolchain**: Emscripten installed via Homebrew (`Brewfile`), driven by `scripts/build-emcc.sh`
- **Bridging C ↔ JS**: Embind via `webapp.cpp` (the frontend adapter that
  replaces upstream's Emscripten glue for the web build)
- **Telemetry**: Sentry browser + WASM source-map plugin
- **PWA**: `vite-plugin-pwa` + Workbox
- **Tooling**: Biome (format + lint), Husky + lint-staged

Vitest runs both the TS unit tests under `src/**/*.test.ts` and the in-tree characterization harnesses (added during the random.c seam work; see `vitest.config.ts`).

## Project Conventions

### Code Style

- Biome is the source of truth — run `npm run check` (which runs `biome check --write .`). Husky enforces `biome check --write --no-errors-on-unmatched` on staged files.
- TypeScript: strict mode; no `any` unless justified.
- C code in `puzzles/` is upstream's and is treated as immutable: it's the fidelity oracle for the rewrite. See `AGENTS.md` "Upstream policy" for the full rule and its narrow instrumentation exception. Files we added in that directory (`webapp.cpp`, `*_bridge.js`, `auxiliary/*-trace.c`) are exempt and edit-able as our own.

### Architecture Patterns

- **Seam replacement (Feathers-style).** For each C module we displace:
  1. Pick a seam — usually a single C module with a clean interface.
  2. Capture characterization traces from the native C build (via `../puzzles/` reference clone).
  3. Implement a TS equivalent.
  4. Replay the corpus against TS, assert byte-identical outputs.
  5. Bridge via Embind/cwrap so the rest of C can call TS instead of its own implementation. Build flag toggles which side is live.
  6. Delete the C impl when stable.

  See `AGENTS.md` "Approach" and "Seam order" for the full rationale and the planned bottom-up sequence (random.c → leaf libs → mid-level → drawing → per-puzzle → midend).

- **WASM stays in a Web Worker** via Comlink for now. Re-evaluate after midend ports.
- **Subtree, not submodule, and not tracked.** `puzzles/` is a git subtree of upstream Simon Tatham, frozen at the version this project forked from. We are not pulling future upstream changes. `puzzles/LICENCE` must stay intact in place (MIT obligation, independent of tracking). See `AGENTS.md` "Upstream policy".

### Testing Strategy

Three layers, in increasing scope:

1. **Characterization tests per seam.** Golden input/output corpora captured from the native C binary, replayed against the TS impl with byte-identical assertions. Primary fidelity guarantee. Each new seam ships with its corpus.
2. **Upstream per-module unit tests, ported.** Where upstream has `auxiliary/*-test.c` covering a module we're replacing (tree234, latin, dsf-via-findloop, sort, combi, hat, penrose, spectre), port to TS alongside the module. The C test becomes the spec.
3. **Benchmark soak (end-to-end).** Equivalent of upstream's `benchmark.sh`: for every preset of every puzzle, generate N boards via the hybrid TS/WASM build and prove each is solvable. Both pure-WASM and hybrid builds must stay green.

Bit-identical RNG is **important**: characterization replays depend on it, and product-side it preserves existing game IDs and shared puzzles in the TS build.

### Git Workflow

- Default branch: `main`.
- Reference oracles live as siblings, not subdirectories: `../puzzles/` (upstream native), `../puzzles-web/` (pre-fork baseline). Treat them as read-only for this project.
- Each seam is its own openspec change. Land changes incrementally; don't batch unrelated seams.

## Domain Context

### Lineage

- **Upstream**: Simon Tatham's Portable Puzzle Collection. ~40 puzzles, MIT-licensed, actively maintained.
- **Direct parent**: [medmunds/puzzles-web](https://github.com/medmunds/puzzles-web). PWA shell over upstream's C compiled to WASM via Emscripten, with `webapp.cpp` + Embind as a typed frontend adapter, running WASM in a Web Worker (Comlink), with a Lit/Web-Awesome/Vite TS app. `puzzles/` is a subtree of upstream with small local patches.
- **This project**: forked from puzzles-web. Pushes the TS/WASM seam progressively deeper into the C code, eventually displacing it entirely.

### Source-tree map

- `puzzles/` — upstream C subtree (drawing, midend, ~40 puzzle back ends, libraries). **Do not restyle.**
- `src/` — the TS web app (Lit components, routing, worker, drawing adapter). The TS replacements for C modules will live here too, organized by capability.
- `scripts/` — host-native build entry points (`build-emcc.sh`, `build-native.sh`).
- `Brewfile` — pinned dependency list for the wasm pipeline (Emscripten, halibut, jq, cmake, coreutils).
- `public/`, `help/`, `*.html.hbs`, `vite-*.ts` — the PWA + Vite plugins.
- `openspec/` — spec-driven change management (this directory).
- `AGENTS.md` — durable strategic context + conventions for AI assistants and human contributors. Symlinked as `CLAUDE.md`.

## Important Constraints

- **Fidelity > speed.** Every seam must produce byte-identical output to the C original on its characterization corpus before it can replace the C side. SHA-1-based RNG must reproduce bit-for-bit, so existing game IDs keep working.
- **Always-green bar.** No sustained red. Hybrid (TS + remaining WASM) and pure-WASM builds must both pass at every step.
- **Don't edit upstream C.** The C source under `puzzles/` is the fidelity oracle and is immutable (see `AGENTS.md` "Upstream policy"); `puzzles/LICENCE` stays intact per MIT.
- **No big-bang rewrite.** Bottom-up, leaves first. The seam order in `AGENTS.md` is the plan of record; deviations need justification.

## External Dependencies

- **Upstream Simon Tatham** (`../puzzles/` sibling clone): historical reference for running upstream's own tools (`benchmark.sh`) unmodified. *Not* tracked — this project froze the `puzzles/` subtree at a specific upstream version (see `AGENTS.md` "Upstream policy"). The in-tree subtree is the fidelity oracle; the sibling is just a convenience for invoking upstream's own utilities.
- **medmunds/puzzles-web** (`../puzzles-web/` sibling clone): pre-fork baseline. Useful in early phases; less useful as the TS layer grows.
- **Emscripten** (host-native via Homebrew, see `Brewfile`): the WASM toolchain. Required for builds until the C side is fully displaced.
- **Hosting**: TBD for this fork. The CF Pages setup inherited from puzzles-web is no longer wired here — `wrangler.toml` and the `preview:pages` script were dropped in the `reorganize-repo-tooling` openspec change. Some Cloudflare-flavoured comments and CSP entries (for CF Insights) remain in `vite.config.ts` / `templates/_headers.txt.hbs` as known-format references in case CF Pages is revisited.
