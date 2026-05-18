# repo-layout Specification

## Purpose
TBD - created by archiving change reorganize-repo-tooling. Update Purpose after archive.
## Requirements
### Requirement: Repo root holds product-level config only

The repository root SHALL hold only files that conventionally belong at
the top level of a Node/TypeScript project: package manifests
(`package.json`, `package-lock.json`), language config (`tsconfig.json`,
`vitest.config.ts`, `vite.config.ts`, `biome.json`), runtime/system
declarations (`.gitignore`, `.gitattributes`, `.husky/`, `Brewfile`),
top-level documentation (`README.md`, `LICENSE.md`, `CREDITS.md`,
`AGENTS.md`, `CLAUDE.md`), and entry-point directories (`src/`,
`public/`, `help/`, `puzzles/`, `scripts/`, `openspec/`, `templates/`,
`vite-plugins/`, `build/`).

`PLAN.md` is no longer a top-level file: its strategic content (Goal,
Lineage, Approach, Test discipline, Seam order, What's been done,
Known unresolved questions, License & attribution) lives in `AGENTS.md`
under the corresponding sections. The Agent-facing documentation
requirement covers the AGENTS.md/CLAUDE.md pair.

Build-helper scripts, plugin source, and Handlebars templates SHALL
NOT live loose at the root. Specifically:

- Vite plugin source SHALL live under `vite-plugins/` (one file per
  plugin, named without the redundant `vite-` prefix, e.g.
  `vite-plugins/extra-pages.ts`).
- Handlebars templates consumed by the Vite pipeline's `renderHandlebars`
  transform SHALL live under `templates/` (currently
  `templates/index.html.hbs`, `templates/puzzle.html.hbs`,
  `templates/_headers.txt.hbs`).
- Static HTML pages that vite consumes as direct rollup inputs MAY stay
  at the root. `unsupported.html` falls in this category: it is listed
  in `rollupOptions.input` and emitted to `dist/unsupported.html`, and
  `vite-plugin-sitemap` enumerates rollup outputs in a way that breaks
  when this input lives under a subdirectory.

#### Scenario: New top-level files are flagged for review

- **WHEN** a change proposes a new file at the repository root
- **THEN** the file MUST fit one of the categories listed above (config,
  manifest, top-level docs, or entry-point directory)
- **AND** if it does not, the proposal MUST justify why an existing
  subdirectory (`vite-plugins/`, `templates/`, `scripts/`, or a new
  named directory) is not the right home

#### Scenario: Templates are not entry points

- **WHEN** Vite is configured
- **THEN** `templates/*.html` files are not enumerated as Vite multi-page
  inputs by default; they are pulled in explicitly by the
  `extra-pages` plugin or by the `unsupported.html` allowlist
- **AND** moving the templates from the root into `templates/` does not
  change the set of pages emitted to `dist/`

#### Scenario: PLAN.md is not at the root

- **WHEN** the change has landed
- **THEN** `git ls-files PLAN.md` returns no rows
- **AND** the strategic content formerly in `PLAN.md` is discoverable
  by reading `AGENTS.md`

### Requirement: Cloudflare Pages tooling is not maintained in-tree

The repository SHALL NOT ship Cloudflare Pages configuration or local
preview tooling. The CF Pages workflow is disabled in this fork (per
PLAN.md "What's been done"), and the user's current hosting plan does
not include CF Pages.

Specifically:

- No `wrangler.toml` at the repository root.
- No `wrangler` package in `dependencies` or `devDependencies` of
  `package.json`.
- No `preview:pages` (or similarly named) script that invokes
  `wrangler`.

Standard Vite preview (`npm run preview`) covers the local-preview
need for the PWA.

#### Scenario: Wrangler is absent from the repo

- **WHEN** the change has landed
- **THEN** `git grep -i 'wrangler\|cloudflare'` returns no hits in
  tracked files outside `openspec/changes/archive/` (where historical
  proposals may reference removed setups)
- **AND** `npm install` does not pull wrangler into `node_modules/`

#### Scenario: Reviving CF Pages is a new proposal

- **WHEN** a contributor wants to restore CF Pages support
- **THEN** they SHALL open a new openspec change that re-adds
  `wrangler.toml`, the wrangler devDep, and a `preview:pages` script,
  along with whatever production deploy workflow is intended
- **AND** they SHALL NOT just resurrect the removed files in a regular
  PR

### Requirement: Source tree under `src/` groups files by UI role

`src/` SHALL group TypeScript files by the role they play, not by
filename pattern. The role-based subdirectories are:

- `src/screens/` — top-level screen components (one per HTML page) and
  the base class they extend. Currently: `screen.ts` (base),
  `home-screen.ts`, `puzzle-screen.ts`. Future per-screen Lit
  components belong here.
- `src/dialogs/` — modal / popover Lit components shown as overlays from
  one or more screens. Currently: `about-dialog.ts`, `alert-dialog.ts`,
  `crash-dialog.ts`, `enter-gameid-dialog.ts`,
  `saved-game-dialogs.ts`, `settings-dialog.ts`, `share-dialog.ts`.
- `src/components/` — reusable leaf Lit components that don't fit
  screen-or-dialog. Currently: `catalog-card.ts`, `command-link.ts`,
  `dynamic-content.ts`, `head-matter.ts`, `help-viewer.ts`,
  `saved-game-list.ts`.

The following kinds of files SHALL stay at `src/` root, not under a
subdirectory, because they are entry points or cross-cutting:

- HTML page entries referenced by `templates/*.html.hbs` (currently
  `home-page.ts`, `puzzle-page.ts`).
- The main bootstrap (`main.ts`), the old-browser preflight gate
  (`preflight.ts`), and the service worker (`sw.ts`).
- Cross-cutting modules with no single-screen owner: `routing.ts`,
  `color-scheme.ts`, `color-scheme-init.ts`, `icons.ts`.
- Ambient-type files such as `vite-env.d.ts`.

Existing subdirectories with non-UI scope SHALL keep their shape:
`src/assets/` (generated), `src/css/` (styles), `src/puzzle/` (puzzle
runtime + Comlink worker), `src/store/` (Dexie schema), `src/utils/`
(general-purpose helpers).

`src/native/` SHALL hold the native-TS engine and the ported games:

- `src/native/engine/` — the TS midend, the `Game` interface, the
  per-game registry, and the clean save codec, with behavioural
  `*.test.ts` colocated.
- `src/native/games/<game>/` — one folder per ported game (the `Game`
  implementation and its behavioural `*.test.ts`), named by catalog
  `puzzleId`.
- `src/native/<module>/` — one folder per ported shared/leaf module
  (e.g. `random/`), containing `index.ts` (the TS implementation
  exporting the module's public surface), an optional `bridge.ts`
  (present only when the module has a wasm-side `--js-library` bridge,
  e.g. `random`), and behavioural `*.test.ts` named descriptively
  (e.g. `random.test.ts`, not `index.test.ts`). Internal dependencies
  that are not yet their own module MAY live inside the same folder
  (e.g. `src/native/random/sha1.ts`) and SHALL be lifted to their own
  `src/native/<dep>/` folder if/when they become a public seam.

A ported module under `src/native/` SHALL NOT be required to carry a
`__fixtures__/` characterization corpus captured from the native C
build: per the `ts-migration` doctrine, correctness is established by
behavioural and property tests, with the C build used only as a
dev-time differential spot-check, not a recorded golden corpus. A
module MAY keep fixtures where they aid behavioural testing, but they
are not a mandated layout element and are not an acceptance gate.

#### Scenario: A new Lit component lands in the right bucket

- **WHEN** a contributor adds a new top-level screen, dialog, or leaf
  component
- **THEN** the file is placed under `src/screens/`, `src/dialogs/`, or
  `src/components/` respectively
- **AND** the file is NOT added loose at `src/` root

#### Scenario: Page-entry script URLs in HTML templates still resolve

- **WHEN** the change has landed
- **THEN** `templates/index.html.hbs` continues to load
  `/src/home-page.ts` and `templates/puzzle.html.hbs` continues to load
  `/src/puzzle-page.ts`
- **AND** neither file moves, because both are HTML page entries

#### Scenario: Renames preserve git history

- **WHEN** files are relocated from `src/` root into a subdirectory
- **THEN** `git mv` is used (not delete + add) so
  `git log --follow <new path>` walks back into pre-move history

#### Scenario: The TS engine and a ported game land in the right place

- **WHEN** the engine layer is added and, later, a game is ported
- **THEN** the midend, `Game` interface, registry, and save codec live
  under `src/native/engine/`
- **AND** the ported game lives under `src/native/games/<puzzleId>/`
  with its behavioural tests colocated
- **AND** neither is added loose at `src/native/` root

#### Scenario: A new ported leaf module lands in `src/native/`

- **WHEN** a contributor adds a new ported shared/leaf module (e.g.
  `tree234`)
- **THEN** the files land under `src/native/tree234/`, with the TS
  impl at `index.ts`, the bridge (if any) at `bridge.ts`, and
  behavioural tests at `tree234.test.ts`
- **AND** no `__fixtures__/` characterization corpus captured from the
  native C build is required for acceptance
- **AND** they are NOT added loose at `src/native/` root

### Requirement: Agent-facing documentation lives in a single AGENTS.md

The repository SHALL keep agent-facing documentation (strategic
context, conventions, constraints) in a single source-of-truth
`AGENTS.md` at the repository root. `CLAUDE.md` SHALL be a symbolic
link to `AGENTS.md` so that tools reading either name see the same
content.

The OpenSpec instruction file under `openspec/` SHALL be named
`OPENSPEC_AGENTS.md` (not `AGENTS.md`) to disambiguate from the
project-root `AGENTS.md` for tools or contributors that scan for
`AGENTS.md` recursively. The managed `<!-- OPENSPEC:START --> ...
<!-- OPENSPEC:END -->` block at the top of `AGENTS.md` SHALL reference
`@/openspec/OPENSPEC_AGENTS.md`.

#### Scenario: CLAUDE.md and AGENTS.md never drift

- **WHEN** a contributor reads `CLAUDE.md`
- **THEN** the content is identical to `AGENTS.md`
- **AND** `readlink CLAUDE.md` resolves to `AGENTS.md`

#### Scenario: openspec instructions are at OPENSPEC_AGENTS.md

- **WHEN** an AI assistant follows the managed-block reference from
  the project-root `AGENTS.md`
- **THEN** it opens `openspec/OPENSPEC_AGENTS.md`, not
  `openspec/AGENTS.md`
- **AND** `openspec/AGENTS.md` does not exist as a tracked file

#### Scenario: Running `openspec update` doesn't silently overwrite

- **WHEN** a contributor runs the upstream `openspec update` CLI
  command (which writes `openspec/AGENTS.md`)
- **THEN** the contributor SHALL re-rename the regenerated file to
  `openspec/OPENSPEC_AGENTS.md` before committing
- **AND** the managed block in the project-root `AGENTS.md`/`CLAUDE.md`
  pair SHALL be re-pointed at `@/openspec/OPENSPEC_AGENTS.md` if
  `openspec update` reset it

