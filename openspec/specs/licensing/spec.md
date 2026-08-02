# licensing Specification

## Purpose
TBD - created by archiving change add-layered-license-and-credits. Update Purpose after archive.
## Requirements
### Requirement: Layered top-level LICENSE.md

The top-level `LICENSE.md` file SHALL credit, in chronological order, the layers
of contribution to this codebase under a single MIT license body:

1. Simon Tatham and upstream Portable Puzzle Collection contributors (deferring
   to `licences/sgt-puzzles-LICENCE` for the full contributor list).
2. Lennard Sprong (x-sheep), for the `puzzles-unreleased` puzzles that thirteen
   of the games here are ported from (deferring to
   `licences/puzzles-unreleased-LICENCE`).
3. Mike Edmunds, for the puzzles-web PWA shell this project forks from.
4. Yoni Lavi, for the TypeScript port work in this project (year range `2025-`,
   open-ended).

The MIT permission grant, conditions, and warranty disclaimer SHALL appear once
below the layered copyright lines and apply to every layer.

Upstream notices SHALL live in `licences/`, one file per upstream project, each
byte-identical to what that project ships, with a README recording what each one
covers. They SHALL NOT live inside a subdirectory of the source tree they once
accompanied: after the migration what they cover is the whole of `src/engine/` and `src/games/`
and the served help sources, and `puzzles/` — the tree that held them — no longer
exists.

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
- **THEN** it directs the reader to `licences/sgt-puzzles-LICENCE` rather than
  enumerating contributors inline
- **AND** that file is left byte-identical to upstream

#### Scenario: The notices are shown in the app

- **WHEN** a player opens the About dialog
- **THEN** the upstream notices are rendered from the files in `licences/`

### Requirement: CREDITS.md file thanking lineage

The repository SHALL contain a top-level `CREDITS.md` file that thanks upstream Simon Tatham + contributors and the medmunds/puzzles-web project, with links to both source repositories.

#### Scenario: CREDITS.md links to both upstream sources

- **WHEN** a reader opens `CREDITS.md`
- **THEN** the file thanks Simon Tatham + upstream puzzles contributors and links to the upstream repository
- **AND** it thanks Mike Edmunds and links to puzzles-web

