# Project Context

## Purpose

`puzzles-ts` is a port of [Simon Tatham's Portable Puzzle Collection](https://git.tartarus.org/?p=simon/puzzles.git) from C/WASM to native TypeScript, **complete as of `retire-c-engine` (2026-08-01)**: all 57 games and the engine are TypeScript, and the C engine and its build are deleted. The goal now is to grow the collection and its deliberate divergences on a codebase where that is cheap.

The approach is **top-down and product-value-first**: build a TS midend + clean game interface, then port games (simplest → Galaxies → outward), deliberately growing beyond upstream's feature set. C is a porting reference + dev-time differential-check source, not a byte-oracle. The authoritative migration approach is the `ts-migration` capability spec (`openspec/specs/ts-migration/spec.md`). The full strategic context — goal, lineage, approach, test discipline, migration order, what's been done — lives in `AGENTS.md` (project root). This `project.md` is the openspec-flavoured slice; `AGENTS.md` is the broader brief. (The prior bottom-up byte-identical-fidelity doctrine was superseded 2026-05-18 by `pivot-to-top-down-ts`; preserved on branch `legacy/seam-by-seam-fidelity` + tag `pre-ts-pivot`.)

## Tech Stack

- **Language**: TypeScript (strict), targeting modern browsers via Vite 7
- **UI**: Lit 3 + Web Awesome 3 + Material Design / Lucide icons
- **State / reactivity**: `@lit-labs/signals`, `signal-utils`, `@lit/context`
- **Persistence**: Dexie (IndexedDB)
- **Workers / IPC**: Comlink wraps the puzzle worker
- **Asset toolchain**: halibut via Homebrew (`Brewfile`), driven by `scripts/build-manual.sh` — the in-app manual is the only generated asset. (The Emscripten/WASM toolchain was retired with the C engine, `retire-c-engine` 2026-08-01.)
- **Puzzle engine**: native TypeScript (`src/native/engine/` + `src/native/games/`). There is no C↔JS bridge; the Embind `webapp.cpp` adapter went with the engine.
- **Telemetry**: Sentry browser
- **PWA**: `vite-plugin-pwa` + Workbox
- **Tooling**: Biome (format + lint), Husky + lint-staged

Vitest runs the TS tests under `src/**/*.test.ts` (see `vitest.config.ts`). The 48 per-game differentials under `src/native/games/*/` compare against **frozen JSON fixtures** recorded while the C build existed; they need no binary and are the regression net for refactoring. There is no live C to diff against any more.

## Project Conventions

### Code Style

- Biome is the source of truth — run `npm run check` (which runs `biome check --write .`). Husky enforces `biome check --write --no-errors-on-unmatched` on staged files.
- TypeScript: strict mode; no `any` unless justified.
- There is no C engine (`retire-c-engine`). `puzzles/` holds upstream's help sources (`puzzles.but`, `html/`), the MIT licences, and two unbuilt `unfinished/` references — all upstream's words, not casually churned. See `AGENTS.md` "Upstream policy".

### Architecture Patterns

- **Top-down port.** Build the TS midend + clean `Game` interface first; then port games by user-facing priority (simplest to establish the pattern → Galaxies → outward). A game was "done" when it played correctly, behavioural tests were green, and a dev-time differential spot-check against the C build looked right. Leaf libraries (dsf, tree234, …) were ported lazily as idiomatic TS when a game needed them — not as standalone bridged seams. The per-game hybrid (C/WASM for unported games, C deleted per port) reached its terminal state and was retired with the C. See the `ts-migration` capability spec for the authoritative rules and `AGENTS.md` "Approach"/"Migration order" for rationale.

- **The engine stays in a Web Worker** via Comlink. It existed for heavy WASM, and `retire-c-engine` deliberately kept it rather than folding a threading change into an engine teardown: heavy generators (Loopy Hard, Solo) still benefit from being off the main thread. Removing it is a separate question, unanswered.
- **Subtree, not submodule, and not tracked.** `puzzles/` is what remains of a git subtree of upstream Simon Tatham, frozen at the version this project forked from. We are not pulling future upstream changes, and the C it once held is deleted. `puzzles/LICENCE` must stay intact in place (MIT obligation, independent of tracking). See `AGENTS.md` "Upstream policy".

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

- `puzzles/` — what is left of the upstream subtree: the manual source, the per-puzzle overview fragments, the MIT licences, and two unbuilt `unfinished/` C files. Nothing is compiled. Don't churn casually — these are upstream's words, served verbatim.
- `src/` — the TS web app (Lit components, routing, worker, drawing adapter). The TS midend and per-game ports live here, organized by capability.
- `scripts/` — host-native build entry points (`build-emcc.sh`, `build-native.sh`).
- `Brewfile` — the one native tool the asset build needs (halibut, for the manual).
- `public/`, `help/`, `*.html.hbs`, `vite-*.ts` — the PWA + Vite plugins.
- `openspec/` — spec-driven change management (this directory).
- `AGENTS.md` — durable strategic context + conventions for AI assistants and human contributors. Symlinked as `CLAUDE.md`.

## Important Constraints

- **Product value first.** Order work so user-facing capability lands early (top-down: midend + game interface, then games simplest→Galaxies→outward). Deliberate divergence from upstream (quick-save, mistake-check, hints, per-game aids) is the goal, not a regression.
- **Correctness, spot-checked — not byte-identical.** A port is done when it plays correctly, behavioural tests are green, and a dev-time differential spot-check against the C build looks right. No byte-identical characterization-corpus gate. `random.ts` stays bit-identical so future shared game IDs reproduce; old C-format saves / pre-pivot IDs are expendable.
- **Always-green bar.** No sustained red; `tsc → lint → vitest` pre-commit gate holds.
- **The C is gone, and it was a reference, not an oracle.** What remains under `puzzles/` is upstream's help material; don't churn it. `puzzles/LICENCE` stays intact per MIT.
- **No big-bang rewrite.** Top-down and incremental. The `ts-migration` capability spec is the plan of record; deviations need justification.

## External Dependencies

- **Upstream Simon Tatham** (`../puzzles/` sibling clone): convenience for running upstream's own tools unmodified. *Not* tracked — this project froze the `puzzles/` subtree at a specific upstream version (see `AGENTS.md` "Upstream policy"). The in-tree subtree no longer holds any engine C; the sibling clone is where to go if a question genuinely needs it.
- **medmunds/puzzles-web** (`../puzzles-web/` sibling clone): pre-fork baseline. Useful in early phases; less useful as the TS layer grows.
- **halibut** (host-native via Homebrew, see `Brewfile`): builds the in-app manual. Optional — without it the app builds and the manual pages are simply absent. (Emscripten was required until the C side was fully displaced; it no longer is.)
- **Hosting**: TBD for this fork. The CF Pages setup inherited from puzzles-web is no longer wired here — `wrangler.toml` and the `preview:pages` script were dropped in the `reorganize-repo-tooling` openspec change. Some Cloudflare-flavoured comments and CSP entries (for CF Insights) remain in `vite.config.ts` / `templates/_headers.txt.hbs` as known-format references in case CF Pages is revisited.
