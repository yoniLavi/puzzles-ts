# repo-layout Specification Delta — retire-the-upstream-help-tree

## MODIFIED Requirements

### Requirement: Every help page the app serves lives under `help/`

Every help page the app serves to players SHALL live under `help/`, and SHALL be
this project's own page, maintained by this project. There SHALL be **one help
source directory in one format**: `help/*.md` for the site-level pages and
`help/games/<puzzleId>.md` for the per-puzzle ones, rendered to
`/help/<puzzleId>.html`.

There SHALL NOT be an `upstream/` subdirectory under `help/`. The earlier split
kept upstream-authored served pages read-only, which is the right rule for a
*reference* and the wrong one for a page the app serves: this fork changes its
games deliberately and repeatedly, so the page describing a game must be
correctable by the change that alters it. Words adopted from upstream keep their
words; what changes is who may fix them, and that is a licensing question MIT
already answers, discharged by `licences/sgt-puzzles-LICENCE` and the layered
notice in `LICENSE.md`.

**No page the app serves SHALL document a platform this app is not.** The
long-form halibut manual was written for upstream's desktop builds and, while
served here, told players of this PWA that "the games in this collection
deliberately do not ever save information on to the computer they run on: they
have no high score tables and no saved preferences" — in an app with IndexedDB
saved games, a quick-save slot and a preferences dialog — alongside Windows
printing, Mac OS X menu placement, Load/Save to disk, and two sections of Unix
command-line options. It is deleted rather than corrected: correcting it means
owning 143 KB of someone else's first-person prose about a different program, and
it covered only 40 of the 57 games this app ships.

Every catalogued `puzzleId` SHALL have a help page, and every help page SHALL
name a catalogued game — asserted automatically **in both directions**, in the
style of `catalog-registry.test.ts` and `asset-integrity.test.ts`. The invariant
is required because its absence hid a real gap: cross-referencing the catalog
against the two help sources on 2026-08-02 found `separate` with no help page at
all, in either.

Relocating or adopting a help page SHALL change neither its content nor its
attribution, and SHALL NOT change the URL any page is served at.

A help **source directory SHALL NOT shadow a URL directory the build emits pages
into.** Sources whose pages render to the top level (`/help/<puzzleId>.html`) are
unaffected, which is why `help/games/` is free to be named for what it holds.

These pages introduce the puzzle — its rules, its provenance, its controls and
its parameters. They SHALL NOT carry development status, known-issue lists or
roadmap notes: a player reading the help for a game is not the audience for a
statement about its implementation, and such a statement goes stale silently the
moment the issue is addressed.

#### Scenario: Every catalogued puzzle has a help page

- **WHEN** the help coverage is checked
- **THEN** every `puzzleId` in the catalog has a `help/games/<puzzleId>.md`
- **AND** every `help/games/*.md` names a catalogued game
- **AND** both directions are asserted, so a page orphaned by a rename is caught
  as well as a game with no page

#### Scenario: A help page is served from one place in one format

- **WHEN** the help sources are located
- **THEN** every served page is markdown under `help/`
- **AND** no served page is read from a directory that forbids editing it

#### Scenario: Adoption changes no URL and no words

- **WHEN** an upstream-authored help page is adopted into `help/games/`
- **THEN** it is served at the same URL as before
- **AND** its words and the project's attribution are unchanged

#### Scenario: A served page does not describe a different platform

- **WHEN** a help page describes how to save, print, or configure the game
- **THEN** it describes what this app does
- **AND** it does not document menus, file dialogs, printing or command-line
  options that belong to upstream's desktop builds

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
declarations (`.gitignore`, `.gitattributes`, `.husky/`, `.nvmrc`),
top-level documentation (`README.md`, `LICENSE.md`,
`CREDITS.md`, `AGENTS.md`, `CLAUDE.md`), and entry-point directories
(`src/`, `public/`, `help/`, `licences/`, `scripts/`, `openspec/`,
`templates/`, `vite-plugins/`, `docs/`, `metrics/`).

`Brewfile` is no longer among them, because there is no longer a native tool to
declare. It was reduced to a single `brew "halibut"` entry once
`retire-c-engine` removed Emscripten, cmake and jq, and halibut existed only to
build the in-app manual; the manual's deletion takes the file with it. A
manifest listing no dependency is not a lighter manifest, it is an instruction
to run `brew bundle install` for nothing.

`metrics/` SHALL hold only **live instruments** — generated output that something
still reads, currently `mutation/report.json` (read by `docs/test-strength.md`)
and `colour-inventory.md` (regenerated by `npm run diff`). A finished round's
dated snapshot is not a live instrument; `build-pipeline` governs where it goes.
It was omitted from this list until `refile-misplaced-artefacts`, while holding
three such snapshots — the directory existed, so nothing noticed that the spec
did not admit it.

The build output directory is `dist/`, and it is gitignored. `build/` is not
among the entry-point directories: it was the partition for the Emscripten and
native-harness outputs, `retire-c-engine` emptied it, and it was retained "for
whatever comes next" — which is a slot with no occupant. Listing it while
omitting `dist/` had the spec naming the empty directory and not the real one.

#### Scenario: A new tooling artifact is added

- **WHEN** a contributor adds a build script, harness, or generated artifact
- **THEN** it goes in `scripts/`, `vite-plugins/`, or another role directory
- **AND** the repo root gains no new file unless it is product-level config

#### Scenario: The repository declares no native tool

- **WHEN** a contributor sets the project up from a clean checkout
- **THEN** `npm install` is the entire setup
- **AND** the root holds no `Brewfile` or other native-package manifest

### Requirement: A comment stating a procedure is executable, or is marked as history

A comment that tells a reader **to do something** SHALL be executable as written,
or SHALL say plainly that it is a record of something that can no longer be done.
A comment that merely records **where something came from**, or **why something is
absent**, is not a procedure and is kept as-is.

The distinction is the actionable one, and applying "delete every mention of the
retired C engine" instead would lose real information in both directions:

- **Provenance is kept.** `random/index.ts`'s *"TypeScript port of
  `puzzles/random.c`"*, `sha1.ts`'s byte-equivalence claim, and `drawing.ts`'s
  *"copied from upstream's emcclib.js"* name the upstream source a behaviour was
  derived from. Upstream still exists, the derivation is still true, and in the
  last case the comment is the only account of an otherwise arbitrary pixel rule.
  With no C build left to interrogate, a comment recording where a behaviour came
  from is the **only** remaining answer.
- **Absence guards are kept.** The notes recording that `wasmIntegration()` was
  removed from Sentry, that the About dialog's `dependencies.json` fetch is gone,
  and that the Brewfile no longer provisions a wasm toolchain exist to stop the
  machinery being re-added. `retire-c-engine`'s own review recorded that *deleting
  the mechanism is the easy half; the guards are what convey the false picture.*
  An absence guard nonetheless lives only as long as the file that hosts it: the
  Brewfile's went when `retire-the-upstream-help-tree` deleted the Brewfile
  itself, halibut having been its last entry. That is not a loss — a guard exists
  to stop a *live* file re-acquiring what was removed, and a deleted file cannot.
  What it was protecting moves up a level, to the requirement stating that the
  repository declares no native tool at all.
- **Dead instructions go.** A command block naming a binary, a source tree, a
  build flag or an output directory that no longer exists.
- **False present-tense statements go.** "Production is the unchanged all-WASM
  path"; "Public API to the remote WASM puzzle module".

A partially-repointed procedure SHALL NOT be produced. Where several lines of a
procedure are dead, correcting only the one a path sweep can see is **worse than
leaving it visibly stale**, because it produces something that looks maintained
and fails on its first line.

A file marked "generated — do not edit by hand" SHALL name a generator that
exists. Where the generator has been removed, the file becomes ordinary committed
source and its header SHALL say so, since the alternative leaves a contributor no
legal way to change it at all.

#### Scenario: A change removes the machinery a comment describes

- **WHEN** a toolchain, build or harness is deleted
- **THEN** every comment instructing a reader to invoke it is rewritten as
  history or removed
- **AND** comments recording provenance, or explaining why the machinery is
  absent, are kept

#### Scenario: A dead recipe is repointed rather than retired

- **WHEN** a path sweep would update one path inside a procedure whose other
  steps are also dead
- **THEN** the whole procedure is retired instead
- **BECAUSE** thirty-seven differential headers named an output under
  `src/native/games/`, which a later change moved; rewriting just that segment
  would have left a `cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0` recipe
  looking maintained, against a source tree, a build system and a flag that no
  longer exist

#### Scenario: A generated file outlives its generator

- **WHEN** a file's generator is deleted
- **THEN** the file's header stops claiming it is generated and stops forbidding
  hand edits
- **AND** any invariant the generator used to assert on its output is confirmed
  to be asserted somewhere that still runs
- **BECAUSE** `spectre-tables.ts` read "GENERATED FILE — do not edit by hand"
  over a three-line recipe of which every line was dead, including a
  `scripts/gen-spectre-tables.mjs` that no longer exists — a file nothing could
  regenerate and nobody was permitted to edit. Its three structural invariants
  turned out to be asserted directly by `spectre.test.ts`, so a hand edit that
  breaks one still fails the suite; had they not been, that would have been the
  real finding.

#### Scenario: A comment-only sweep is verified by count, not by green

- **WHEN** a change edits comments across many test files
- **THEN** the test and assertion counts are compared before and after, not
  merely observed to be green
- **BECAUSE** a comment edit that swallowed a `describe` leaves a passing suite
  with fewer tests in it — the same silent-shrink shape the probe's
  discovered-test-file floor guards against
