# Change: Group `src/` by role — screens, dialogs, components

## Why

`src/` is flat: 25+ TypeScript files at the top level mixing different roles
(page entries, screen-level Lit components, dialogs, leaf components,
cross-cutting bootstrap). Subdirectories already exist for clearly-owned
concerns (`puzzle/`, `store/`, `utils/`, `native/`, `css/`, `assets/`), but
the largest category — the Lit UI surface — is unorganised.

This bites in three ways today, and gets worse as the rewrite progresses:

1. **`src/` is the place new TS-port modules land.** `src/native/` is already
   growing (random ported; tree234, dsf, etc. queued). The roadmap will add
   per-puzzle directories under `src/native/` too. Keeping the UI flat means
   the file tree mixes UI components and engine modules at the same depth,
   making the "what is this file?" answer harder than it needs to be.
2. **The README already calls it out.** "The src directory is a little in
   flux right now" (`README.md` near line 138). README acknowledges that the
   exact split will change; we should pay that cost once.
3. **It's pure mechanical change.** Imports inside `src/` are nearly all
   relative (`./foo.ts`). The only external references to specific files
   from outside `src/` are `index.html.hbs` → `/src/home-page.ts` and
   `puzzle.html.hbs` → `/src/puzzle-page.ts`. Keeping those two page-entry
   files at `src/` root means the HTML templates don't change.

## What Changes

Move Lit-component files into role-based subdirectories. Page entry-points,
bootstrap, and cross-cutting modules stay at `src/` root.

### Stays at `src/` root (entry / bootstrap / cross-cutting)

- `main.ts` — main bootstrap (Sentry, error handlers, lit patch, PWA, etc.)
- `preflight.ts` — old-browser capability gate (must stay simple; see
  CLAUDE.md "DO NOT" list)
- `sw.ts` — service worker entry
- `home-page.ts`, `puzzle-page.ts` — HTML page entries (referenced by name
  from `templates/*.html.hbs`)
- `routing.ts` — cross-cutting URL handling
- `color-scheme.ts`, `color-scheme-init.ts` — cross-cutting theming
- `icons.ts` — icon registry (single global registration call from `main.ts`)
- `vite-env.d.ts` — env-type ambient declaration

### Moves to `src/screens/`

- `screen.ts` (base class)
- `home-screen.ts`
- `puzzle-screen.ts`

### Moves to `src/dialogs/`

- `about-dialog.ts`
- `alert-dialog.ts`
- `crash-dialog.ts`
- `enter-gameid-dialog.ts`
- `saved-game-dialogs.ts`
- `settings-dialog.ts`
- `share-dialog.ts`

### Moves to `src/components/`

- `catalog-card.ts`
- `command-link.ts`
- `dynamic-content.ts`
- `head-matter.ts`
- `help-viewer.ts`
- `saved-game-list.ts`

### Unchanged

- `src/assets/`, `src/css/`, `src/native/`, `src/puzzle/`, `src/store/`,
  `src/utils/` keep their current shape and contents.

### Non-goals (explicitly)

- **Not splitting `src/utils/`.** It's 22 files but each is small, and
  there's no obvious axis of split that isn't bikeshedding (DOM vs. lit
  vs. errors vs. timing…). Leave it.
- **Not splitting `src/css/`.** Nine files; the boundary between global and
  per-screen styles is already legible.
- **Not renaming files.** Path moves only; preserve the `kebab-case.ts`
  names so `git log --follow` works cleanly across the rename.
- **Not touching `src/native/` shape.** That subdir's organisation is the
  rewrite's concern and is sequenced per seam in PLAN.md.

## Impact

- **Affected specs**:
  - `repo-layout` (MODIFIED — adds a "src/ shape" requirement on top of the
    root-layout requirement introduced by `reorganize-repo-tooling`).
- **Affected code**:
  - `src/*.ts` — 16 file moves (3 to `screens/`, 7 to `dialogs/`, 6 to
    `components/`).
  - Every `from "./<moved-file>"` import in `src/` updates to `from
    "./<subdir>/<moved-file>"` or `from "../<subdir>/<moved-file>"`.
  - `home-page.ts` and `puzzle-page.ts` update their imports (`./home-screen`
    → `./screens/home-screen`, etc.).
  - No change to `templates/*.html.hbs` script `src=` attributes.
  - No change to `vite.config.ts` (preflight stays at root; multi-page
    inputs unchanged).
  - README's "Web app code" section updates to reference the new shape.
- **Verification**:
  - `npm run check` passes (biome lint + format on every moved file).
  - `tsc -b --noEmit` passes (every import resolves).
  - `npm run test:run` passes.
  - `npm run dev` boots and the home screen renders.
  - `npm run dev` then loading `/cube` renders the puzzle screen and one
    move plays through.
  - `git log --follow src/screens/home-screen.ts` shows pre-move history.

### Sequencing

This change has the largest diff of the three cleanup proposals but the
lowest semantic risk (pure renames + path updates). Recommended landing
order across the three openspec changes is:

1. `prune-unsupported-frontends` (low touch on `src/`)
2. `reorganize-repo-tooling` (touches `vite.config.ts` for plugin and
   template moves)
3. `reorganize-src-layout` (this one — last, so it doesn't conflict with #2)
