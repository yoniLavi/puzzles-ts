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
