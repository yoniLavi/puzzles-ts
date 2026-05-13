# repo-layout spec delta

## ADDED Requirements

### Requirement: Repo root holds product-level config only

The repository root SHALL hold only files that conventionally belong at
the top level of a Node/TypeScript project: package manifests
(`package.json`, `package-lock.json`), language config (`tsconfig.json`,
`vitest.config.ts`, `vite.config.ts`, `biome.json`), runtime/system
declarations (`.gitignore`, `.gitattributes`, `.husky/`, `Brewfile`),
top-level documentation (`README.md`, `LICENSE.md`, `CREDITS.md`,
`AGENTS.md`, `CLAUDE.md`, `PLAN.md`), and entry-point directories
(`src/`, `public/`, `help/`, `puzzles/`, `scripts/`, `openspec/`,
`templates/`, `vite-plugins/`, `build/`).

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
