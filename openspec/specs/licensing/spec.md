# licensing Specification

## Purpose
How this project meets the MIT obligations of the code it builds on and credits
the people behind it: the layered `LICENSE.md`, `CREDITS.md`, the byte-identical
upstream notices in `licenses/`, and an About dialog that shows those notices
and names every bundled third-party package with its license.

## Requirements

### Requirement: Layered top-level LICENSE.md

The top-level `LICENSE.md` file SHALL credit, in chronological order, the layers
of contribution to this codebase under a single MIT license body:

1. Simon Tatham and upstream Portable Puzzle Collection contributors (deferring
   to `licenses/sgt-puzzles-LICENSE` for the full contributor list).
2. Lennard Sprong (x-sheep), for the `puzzles-unreleased` puzzles that thirteen
   of the games here are ported from (deferring to
   `licenses/puzzles-unreleased-LICENSE`).
3. Mike Edmunds, for the puzzles-web PWA shell this project forks from.
4. Yoni Lavi, for the TypeScript port work in this project (year range `2025-`,
   open-ended).

The MIT permission grant, conditions, and warranty disclaimer SHALL appear once
below the layered copyright lines and apply to every layer.

Upstream notices SHALL live in `licenses/`, one file per upstream project, each
byte-identical to what that project ships, with a README recording what each one
covers. The directory and file names are this project's and follow its spelling
convention; the contents are the upstream projects' words and SHALL NOT be
edited, which a rename does not do. They SHALL NOT live inside a subdirectory of
the source tree they once accompanied: after the migration what they cover is
the whole of `src/engine/` and `src/games/` and the served help sources, and
`puzzles/` — the tree that held them — no longer exists.

The notices SHALL remain reachable from the app: the About dialog `?raw`-imports
each one and shows it to players, so they are live build inputs and moving one
without repointing that import breaks the production build.

#### Scenario: Every lineage layer credited

- **WHEN** a reader opens the top-level `LICENSE.md`
- **THEN** the file contains a copyright line for Simon Tatham + upstream
  contributors
- **AND** a copyright line for Lennard Sprong covering the `puzzles-unreleased`
  games
- **AND** a copyright line for Mike Edmunds
- **AND** a copyright line for Yoni Lavi
- **AND** a single MIT permission/conditions/warranty body that covers them all

#### Scenario: Upstream contributor list not duplicated

- **WHEN** `LICENSE.md` references upstream contributors
- **THEN** it directs the reader to `licenses/sgt-puzzles-LICENSE` rather than
  enumerating contributors inline
- **AND** that file is left byte-identical to upstream

#### Scenario: The notices are shown in the app

- **WHEN** a player opens the About dialog
- **THEN** the upstream notices are rendered from the files in `licenses/`

#### Scenario: Renaming a notice file leaves its bytes alone

- **WHEN** a notice file or the directory holding it is renamed
- **THEN** the file's content hash before and after the rename is identical
- **AND** the About dialog's `?raw` imports are repointed in the same commit

### Requirement: CREDITS.md file thanking lineage

The repository SHALL contain a top-level `CREDITS.md` file that thanks upstream Simon Tatham + contributors and the medmunds/puzzles-web project, with links to both source repositories.

#### Scenario: CREDITS.md links to both upstream sources

- **WHEN** a reader opens `CREDITS.md`
- **THEN** the file thanks Simon Tatham + upstream puzzles contributors and links to the upstream repository
- **AND** it thanks Mike Edmunds and links to puzzles-web

### Requirement: The About box credits every bundled package, and never a template

The third-party section of the About dialog SHALL name, for each package the
app bundles, who publishes it and under what license, and SHALL reproduce that
package's own notice. **No entry may contain an unfilled license template.**

Apache-2.0's text ends with an appendix headed "How to apply the Apache License
to your work" — a template *for authors*, containing the line
`Copyright [yyyy] [name of copyright owner]`. Where a package fills it in it is
the closest thing that package has to a NOTICE and SHALL be used as one. Where a
package ships it **unfilled**, it names nobody, and the appendix SHALL be
removed rather than reproduced: it is not part of the license grant, and the
alternative is telling players `Copyright [yyyy] [name of copyright owner]`,
which reads as this project's own unfinished work.

Attribution SHALL be **derived from each package's own metadata** — its `author`,
else its `contributors`, else the repository it is published from — and SHALL
NOT be written down in this repository, which would be a list to maintain per
dependency and a claim about someone else's code.

It SHALL be presented as *who publishes the package*, never as a copyright
notice this project asserts on their behalf. Where a package states a copyright
holder, that statement is in the notice text below it and speaks for itself.

A package's own `NOTICE` file SHALL take precedence over everything else, which
Apache-2.0 §4(d) requires.

#### Scenario: A package ships the Apache appendix unfilled

- **WHEN** a bundled package's license text contains the appendix with its
  copyright line left as the template
- **THEN** the appendix is not reproduced, in the extracted form or within the
  license text it would otherwise fall back to
- **AND** the entry still reproduces the license grant itself

#### Scenario: A package fills the appendix in

- **WHEN** a bundled package's appendix names a real copyright holder
- **THEN** that line is used as the package's notice

#### Scenario: A package names nobody

- **WHEN** a package declares no author, no contributors and no repository
- **AND** its notice contains no copyright line
- **THEN** the build fails, rather than shipping an uncredited package

#### Scenario: The check cannot pass over an empty list

- **WHEN** the bundled-package listing is implausibly short
- **THEN** the build fails on the count rather than reporting that every entry
  is fine
