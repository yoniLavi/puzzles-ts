# repo-layout Specification Delta — rehome-upstream-help-sources

## RENAMED Requirements

- FROM: `### Requirement: Per-puzzle help pages this project maintains live under `help/``
- TO: `### Requirement: Every help page the app serves lives under `help/``

## MODIFIED Requirements

### Requirement: Every help page the app serves lives under `help/`

Every help page the app serves to players SHALL live under `help/`, whoever
wrote it. The distinction that matters is not authorship but whether the app
serves it: a served page is an input to this project's build, and its location
should say so.

The tree SHALL separate what this project writes from what it merely renders:

- `help/*.md` and `help/games/<puzzleId>.md` are **this project's own pages**.
  The per-puzzle ones cover the puzzles that have no upstream halibut manual;
  they are adapted from the documentation shipped with the third-party sources,
  are maintained by this project, and are rendered to `/help/<puzzleId>.html`.
- `help/upstream/` holds **upstream-authored material rendered verbatim** — the
  per-puzzle overview fragments (`help/upstream/overviews/`) and the halibut
  source for the in-app manual (`help/upstream/manual/`). It SHALL carry a
  README stating that the words are upstream's and are not to be edited, and
  pointing at the MIT notice that covers them.

`help/upstream/` SHALL be excluded from the formatter/linter. Verbatim means
verbatim: a formatter run over it would rewrite upstream's markup, which is the
same edit the requirement forbids a human from making, performed automatically
and invisibly. (The overview fragments are also not well-formed documents —
upstream's format is a bare title line followed by a body — so a formatter both
may not and cannot process them.)

No page the app serves SHALL be read from an upstream reference tree: a page
this project edits is no longer reference material, and a page it merely renders
is still a build input.

Relocating upstream-authored pages SHALL change neither their content nor their
attribution — moving them is not licence to edit them — and SHALL NOT change the
URL any page is served at.

A help **source directory SHALL NOT shadow a URL directory the build emits pages
into.** The manual is served under `/help/manual/`, so its source cannot sit at
`help/manual/`: a real directory of that name occupies the path the generated
pages are emitted at, and the production build fails outright with `EISDIR`.
Sources whose pages render to the top level (`/help/<puzzleId>.html`) are
unaffected, which is why `help/games/` and `help/upstream/overviews/` are free to
be named for what they hold.

These pages introduce the puzzle — its rules, its provenance, its controls and
its parameters. They SHALL NOT carry development status, known-issue lists or
roadmap notes: a player reading the help for a game is not the audience for a
statement about its implementation, and such a statement goes stale silently the
moment the issue is addressed.

#### Scenario: A puzzle without an upstream manual has a help page

- **WHEN** the help page for such a puzzle is requested
- **THEN** it is served from `help/games/<puzzleId>.md`, and describes how to
  play rather than the state of the implementation

#### Scenario: Every served help page lives under `help/`

- **WHEN** the help sources are located
- **THEN** the project-authored pages, the overview fragments and the manual
  source are all under `help/`
- **AND** the upstream-authored ones are under `help/upstream/`, with a README
  recording that they are upstream's words and where their licence is
- **AND** no page the app serves is read from an upstream reference tree

#### Scenario: Relocation changes no URL and no words

- **WHEN** the upstream-authored help sources are moved
- **THEN** each page is served at the same URL as before
- **AND** its content and attribution are unchanged
- **AND** the built `dist/help/` holds the same pages as before the move

#### Scenario: The formatter does not rewrite upstream's words

- **WHEN** `biome check` runs over the repository
- **THEN** `help/upstream/` is excluded from it
- **AND** the upstream help sources are byte-identical to what upstream ships

#### Scenario: A help source directory does not shadow a served URL directory

- **WHEN** a help source is placed under `help/`
- **THEN** its directory name does not collide with a URL subdirectory the build
  emits pages into
- **AND** the production build succeeds

### Requirement: Repo root holds product-level config only

The repository root SHALL hold only files that conventionally belong at
the top level of a Node/TypeScript project: package manifests
(`package.json`, `package-lock.json`), language config (`tsconfig.json`,
`vitest.config.ts`, `vite.config.ts`, `biome.json`), runtime/system
declarations (`.gitignore`, `.gitattributes`, `.husky/`, `Brewfile`),
top-level documentation (`README.md`, `LICENSE.md`, `CREDITS.md`,
`AGENTS.md`, `CLAUDE.md`), and entry-point directories (`src/`,
`public/`, `help/`, `licences/`, `scripts/`, `openspec/`, `templates/`,
`vite-plugins/`, `build/`, `docs/`).

`puzzles/` is no longer among them. It was the frozen subtree of upstream's C
collection; `retire-c-engine` deleted the C, `rehome-upstream-help-sources`
moved the help sources it was left holding to `help/upstream/` and the MIT
notices to `licences/`, and the directory went with them. A directory named for
a source tree that no longer exists is a false signal, not a neutral one.

Upstream licence notices SHALL live in `licences/`, one file per upstream
project, byte-identical to what that project ships, with a README recording what
each one covers. They are kept verbatim to honour MIT's "included in all copies"
condition, and they are **live build inputs** — the About dialog `?raw`-imports
them and shows them to players — so they are not archive material and SHALL NOT
be filed as such.

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

#### Scenario: `puzzles/` is not at the root

- **WHEN** the repository is inspected after the help sources are rehomed
- **THEN** `git ls-files puzzles/` returns no rows
- **AND** the upstream MIT notices are readable under `licences/`
