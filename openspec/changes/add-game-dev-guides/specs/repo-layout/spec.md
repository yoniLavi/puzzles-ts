## MODIFIED Requirements

### Requirement: Repo root holds product-level config only

The repository root SHALL hold only files that conventionally belong at
the top level of a Node/TypeScript project: package manifests
(`package.json`, `package-lock.json`), language config (`tsconfig.json`,
`vitest.config.ts`, `vite.config.ts`, `biome.json`), runtime/system
declarations (`.gitignore`, `.gitattributes`, `.husky/`, `Brewfile`),
top-level documentation (`README.md`, `LICENSE.md`, `CREDITS.md`,
`AGENTS.md`, `CLAUDE.md`), and entry-point directories (`src/`,
`public/`, `help/`, `puzzles/`, `scripts/`, `openspec/`, `templates/`,
`vite-plugins/`, `build/`, `docs/`).

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

Developer-facing prose guides (the *how-to* of porting and feature work,
distinct from the `/help` in-app user docs) SHALL live under `docs/`.

#### Scenario: New top-level files are flagged for review

- **WHEN** a change proposes a new file at the repository root
- **THEN** the file MUST fit one of the categories listed above (config,
  manifest, top-level docs, or entry-point directory)
- **AND** if it does not, the proposal MUST justify why an existing
  subdirectory (`vite-plugins/`, `templates/`, `scripts/`, `docs/`, or a
  new named directory) is not the right home

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

## ADDED Requirements

### Requirement: Developer guides live under docs/ and link to specs

Developer guides under `docs/` SHALL describe procedure (the followable
*how*) and SHALL NOT restate normative requirements. A guide MUST link to
the authoritative spec requirement rather than paraphrase it, and MUST name
exemplar files rather than copy code that would rot. This keeps the specs
(`ts-migration`, `ts-engine`, `repo-layout`, per-game) the single source of
truth for *what* is required, so a guide can only ever go stale (a broken
link or an outdated exemplar pointer, caught by review), never silently
contradict a requirement.

The initial guides are `docs/porting/game-port-playbook.md` (the ordered
game-port procedure) and `docs/porting/hint-authoring.md` (the procedure for
adding an explained `hint()` to a ported game).

#### Scenario: A guide states a normative rule

- **WHEN** a `docs/` guide mentions a rule that a spec owns (e.g. the
  parity-gated registration rule, or the hint quality bar)
- **THEN** the guide states it briefly and links to the owning spec
  requirement
- **AND** the guide does not contain the authoritative wording such that the
  two could diverge

#### Scenario: A guide shows a code pattern

- **WHEN** a `docs/` guide describes an implementation pattern (e.g. the
  `Int32Array` packed-bits render cache key)
- **THEN** it points at an exemplar file that demonstrates the pattern
- **AND** it does not paste a code snippet that would drift from the source
