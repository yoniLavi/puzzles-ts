# Project Context

## Purpose

`puzzles-ts` is an ongoing port of [Simon Tatham's Portable Puzzle Collection](https://git.tartarus.org/?p=simon/puzzles.git) from C/WASM to native TypeScript. The eventual goal is to replace the C engine entirely while keeping the app green at every step.

The approach is **top-down and product-value-first**: build a TS midend + clean game interface, then port games (simplest → Galaxies → outward), deliberately growing beyond upstream's feature set. C is a porting reference + dev-time differential-check source, not a byte-oracle. The authoritative migration approach is the `ts-migration` capability spec (`openspec/specs/ts-migration/spec.md`). The full strategic context — goal, lineage, approach, test discipline, migration order, what's been done — lives in `AGENTS.md` (project root). This `project.md` is the openspec-flavoured slice; `AGENTS.md` is the broader brief. (The prior bottom-up byte-identical-fidelity doctrine was superseded 2026-05-18 by `pivot-to-top-down-ts`; preserved on branch `legacy/seam-by-seam-fidelity` + tag `pre-ts-pivot`.)

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

Vitest runs the TS tests under `src/**/*.test.ts` (see `vitest.config.ts`). The host-native harnesses under `puzzles/auxiliary/` back the dev-time differential spot-check (C vs TS port) — an advisory aid, not a gating corpus.

## Project Conventions

### Code Style

- Biome is the source of truth — run `npm run check` (which runs `biome check --write .`). Husky enforces `biome check --write --no-errors-on-unmatched` on staged files.
- TypeScript: strict mode; no `any` unless justified.
- C code in `puzzles/` is a porting reference + dev-time differential-check source — not casually churned (stable reference, no-merge subtree), and a game's C is deleted when its TS port ships. See `AGENTS.md` "Upstream policy". Files we added there (`webapp.cpp`, `*_bridge.js`, `auxiliary/*`) are ours and edit-able.

### Architecture Patterns

- **Top-down port.** Build the TS midend + clean `Game` interface first; then port games by user-facing priority (simplest to establish the pattern → Galaxies → outward). A game is "done" when it plays correctly, behavioural tests are green, and a dev-time differential spot-check against the C build looks right. Leaf libraries (dsf, tree234, …) are ported lazily as idiomatic TS when a game needs them — not as standalone bridged seams. Per-game hybrid: C/WASM runs unported games; a game's C is deleted when its port ships. See the `ts-migration` capability spec for the authoritative rules and `AGENTS.md` "Approach"/"Migration order" for rationale.

- **WASM stays in a Web Worker** via Comlink for now. It exists for heavy WASM; re-evaluate once games are TS (light TS games may not need a worker).
- **Subtree, not submodule, and not tracked.** `puzzles/` is a git subtree of upstream Simon Tatham, frozen at the version this project forked from. We are not pulling future upstream changes. `puzzles/LICENCE` must stay intact in place (MIT obligation, independent of tracking). See `AGENTS.md` "Upstream policy".

### Testing Strategy

No byte-corpus layer. Discipline (see the `ts-migration` spec):

1. **Behavioural tests per ported game / module.** Generates solvable boards, solver solves them, input transitions correct, serialise/deserialise round-trips. Property tests where a closed-form invariant exists.
2. **Dev-time differential spot-check.** Advisory harness: N boards from the C build vs the TS port for the same seed, diffs surfaced for human review. Review signal, not a pass/fail gate. Per-game tightening allowed where a generator has brutal uniqueness constraints, but not the default.
3. **Pre-commit gate.** `tsc -b --noEmit` → `biome lint` → `vitest run`.

Bit-identical RNG (`random.ts`, already ported) is retained so *future* shared game IDs reproduce across builds; old C-format saves and pre-pivot shared IDs are expendable by decision.

### Git Workflow

- Default branch: `main`.
- Reference clones live as siblings, not subdirectories: `../puzzles/` (upstream native), `../puzzles-web/` (pre-fork baseline). Treat them as read-only for this project.
- Each coherent unit of work (the TS midend, a game port, a cross-game feature) is its own openspec change. Land changes incrementally; don't batch unrelated work.

## Domain Context

### Lineage

- **Upstream**: Simon Tatham's Portable Puzzle Collection. ~40 puzzles, MIT-licensed, actively maintained.
- **Direct parent**: [medmunds/puzzles-web](https://github.com/medmunds/puzzles-web). PWA shell over upstream's C compiled to WASM via Emscripten, with `webapp.cpp` + Embind as a typed frontend adapter, running WASM in a Web Worker (Comlink), with a Lit/Web-Awesome/Vite TS app. `puzzles/` is a subtree of upstream with small local patches.
- **This project**: forked from puzzles-web. Replaces the C engine with native TypeScript top-down (midend + game interface first, then games), deliberately growing beyond upstream's feature set. See the `ts-migration` capability spec for the authoritative approach.

### Source-tree map

- `puzzles/` — upstream C subtree (drawing, midend, ~40 puzzle back ends, libraries). A *reference* + dev-time differential-check source; a game's C is deleted when its TS port ships. Don't churn casually.
- `src/` — the TS web app (Lit components, routing, worker, drawing adapter). The TS midend and per-game ports live here, organized by capability.
- `scripts/` — host-native build entry points (`build-emcc.sh`, `build-native.sh`).
- `Brewfile` — pinned dependency list for the wasm pipeline (Emscripten, halibut, jq, cmake, coreutils).
- `public/`, `help/`, `*.html.hbs`, `vite-*.ts` — the PWA + Vite plugins.
- `openspec/` — spec-driven change management (this directory).
- `AGENTS.md` — durable strategic context + conventions for AI assistants and human contributors. Symlinked as `CLAUDE.md`.

## Important Constraints

- **Product value first.** Order work so user-facing capability lands early (top-down: midend + game interface, then games simplest→Galaxies→outward). Deliberate divergence from upstream (quick-save, mistake-check, hints, per-game aids) is the goal, not a regression.
- **Correctness, spot-checked — not byte-identical.** A port is done when it plays correctly, behavioural tests are green, and a dev-time differential spot-check against the C build looks right. No byte-identical characterization-corpus gate. `random.ts` stays bit-identical so future shared game IDs reproduce; old C-format saves / pre-pivot IDs are expendable.
- **Always-green bar.** No sustained red; `tsc → lint → vitest` pre-commit gate holds.
- **C is a reference, not an oracle.** Don't churn `puzzles/` casually (stable reference, no-merge subtree); a game's C is deleted when its TS port ships. `puzzles/LICENCE` stays intact per MIT.
- **No big-bang rewrite.** Top-down and incremental. The `ts-migration` capability spec is the plan of record; deviations need justification.

## External Dependencies

- **Upstream Simon Tatham** (`../puzzles/` sibling clone): convenience for running upstream's own tools unmodified. *Not* tracked — this project froze the `puzzles/` subtree at a specific upstream version (see `AGENTS.md` "Upstream policy"). The in-tree subtree is a porting *reference* + dev-time differential-check source, not a byte-oracle.
- **medmunds/puzzles-web** (`../puzzles-web/` sibling clone): pre-fork baseline. Useful in early phases; less useful as the TS layer grows.
- **Emscripten** (host-native via Homebrew, see `Brewfile`): the WASM toolchain. Required for builds until the C side is fully displaced.
- **Hosting**: TBD for this fork. The CF Pages setup inherited from puzzles-web is no longer wired here — `wrangler.toml` and the `preview:pages` script were dropped in the `reorganize-repo-tooling` openspec change. Some Cloudflare-flavoured comments and CSP entries (for CF Insights) remain in `vite.config.ts` / `templates/_headers.txt.hbs` as known-format references in case CF Pages is revisited.
