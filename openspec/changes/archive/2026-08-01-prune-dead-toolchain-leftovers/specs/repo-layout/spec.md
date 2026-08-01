# repo-layout Specification Delta — prune-dead-toolchain-leftovers

## MODIFIED Requirements

### Requirement: Repo root holds product-level config only

The repository root SHALL hold only files that conventionally belong at
the top level of a Node/TypeScript project: package manifests
(`package.json`, `package-lock.json`), language config (`tsconfig.json`,
`vitest.config.ts`, `vite.config.ts`, `biome.json`), runtime/system
declarations (`.gitignore`, `.gitattributes`, `.husky/`, `Brewfile`,
`.nvmrc`), top-level documentation (`README.md`, `LICENSE.md`,
`CREDITS.md`, `AGENTS.md`, `CLAUDE.md`), and entry-point directories
(`src/`, `public/`, `help/`, `licences/`, `scripts/`, `openspec/`,
`templates/`, `vite-plugins/`, `docs/`).

The build output directory is `dist/`, and it is gitignored. `build/` is not
among the entry-point directories: it was the partition for the Emscripten and
native-harness outputs, `retire-c-engine` emptied it, and it was retained "for
whatever comes next" — which is a slot with no occupant. Listing it while
omitting `dist/` had the spec naming the empty directory and not the real one.

**Configuration for a removed toolchain SHALL be removed with it.** A formatter
config, an ignore rule, an editor setting or a generated index that exists only
to serve a deleted build is not neutral once that build is gone: nothing fails,
and every one of them tells the next reader the toolchain is still here. This
covers, concretely, that the repository holds no C/C++ formatter configuration
(`.clang-format`), no ignore entries for `build/` or the clangd `.cache/` index,
and no editor setting pointing at a source tree that no longer exists.

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

#### Scenario: No configuration outlives the toolchain it configured

- **WHEN** a toolchain is removed from the repository
- **THEN** its formatter configuration, ignore entries, editor settings and
  generated indexes are removed in the same change
- **AND** `git ls-files .clang-format` returns no rows, there being no C or C++
  in the tree

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
