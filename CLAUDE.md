<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

## Project at a glance

PWA port of Simon Tatham's Portable Puzzle Collection. Two halves:

- **C/C++ puzzles** in `/puzzles` (git subtree of upstream + `puzzles/unreleased`),
  compiled to WebAssembly via host-native Emscripten (see `Brewfile`).
- **TypeScript web app** in `/src` using Lit web components and Vite.
  Targets Baseline 2023 (see `src/preflight.ts`).

## Build commands

- `npm run build:wasm` — compiles the puzzle wasm + manual into `src/assets/puzzles/`
  via `scripts/build-emcc.sh`. Honours `USE_TS_RANDOM=1` (must be paired with
  `VITE_USE_TS_RANDOM=1` for vite).
- `npm run build:icons` — generates puzzle icons into `src/assets/icons/`
  via `scripts/build-icons.sh` (uses brew GTK+3 + ImageMagick + oxipng).
- `npm run build:assets` — both, in series.
- `npm run dev` — vite dev server.
- `npm run build` — production app build (tsc + vite). Assumes `build:assets` already ran.
- `npm run preview` — preview production build.
- `npm run check` — biome format + lint with autofix.
- `npm run test` / `npm run test:run` — vitest.

Both `src/assets/icons/` and `src/assets/puzzles/` are gitignored — regenerate
via the scripts above when stale.

## Code conventions

- **TypeScript**: strict mode, no `any` (use `unknown` + type guards).
- **Formatter / linter**: Biome (2-space indent, 88 char width).
- **UI**: Lit web components; explicitly register Web Awesome components by
  importing them (e.g. `import "@awesome.me/webawesome/dist/components/button/button.js"`).
- **Reactive state**: `@lit-labs/signals`; use `SignalWatcher` mixin where consuming.
- **Persistence**: IndexedDB via Dexie.js (`src/store/db.ts`).
- **WASM**: runs in a web worker, exposed via Comlink (`src/puzzle/`).
- **Styling**: Web Awesome design tokens.

## Constraints

DO NOT:
- Modify `/puzzles` or `/puzzles/unreleased` without considering upstream impact
  (these are git subtrees pulled from upstream — see `puzzles/auxiliary/`
  for our own additions/harnesses that live alongside).
- Break Baseline 2023 browser compatibility.
- Use top-level await, dynamic `import()`, or `import.meta` in `src/preflight.ts`
  — preflight runs on older browsers to gate the rest of the app.
- Add dependencies without considering bundle size and offline (PWA) support.
- Commit generated assets in `src/assets/icons/` or `src/assets/puzzles/`.
- Catch unrecoverable errors only to log them — let them propagate so Sentry
  records them.

DO:
- Test on touch devices and varying screen sizes when changing UI.
- Verify offline functionality still works (PWA / service worker).
- Check changes work with keyboard, mouse, and touch input.
- Consider accessibility.

## Special files

- `puzzles/webapp.cpp` — frontend adapter between C puzzle code and TS via Embind.
- `src/puzzle/puzzle.ts`, `src/puzzle/worker.ts` — how the wasm frontend is
  exposed to the rest of the app.
- `index.html.hbs`, `puzzle.html.hbs` — handlebars templates for static page
  generation (handled by `vite-extra-pages.ts`).
- `src/preflight.ts` — Baseline 2023 capability checks.
- `src/store/db.ts` — Dexie schema.
- `src/sw.ts` — service worker (Workbox + vite-plugin-pwa).

## Documentation

The in-app help system is assembled from three sources:
- `/help` — main help pages.
- `/puzzles/html` — upstream per-puzzle overview.
- `/puzzles/puzzles.but` — upstream manual, built into HTML by halibut as part
  of `build:wasm`.

Update `/help` when adding features that diverge from upstream.

## Git

- Main branch: `main`.
- Husky pre-commit runs `biome check --write --no-errors-on-unmatched` on
  staged files (see `package.json` lint-staged config).

## License

- Web app code: MIT (`LICENSE.md`).
- Upstream puzzles: MIT (`puzzles/LICENCE`).
- A consolidated credits view lives in `CREDITS.md`.
