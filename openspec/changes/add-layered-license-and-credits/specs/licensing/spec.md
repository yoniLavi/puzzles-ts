## ADDED Requirements

### Requirement: Layered top-level LICENSE.md

The top-level `LICENSE.md` file SHALL credit, in chronological order, the three layers of contribution to this codebase under a single MIT license body:

1. Simon Tatham and upstream Portable Puzzle Collection contributors (deferring to `puzzles/LICENCE` for the full contributor list).
2. Mike Edmunds, for the puzzles-web PWA shell this project forks from.
3. Yoni Lavi, for the TypeScript port work in this project (year range `2025-`, open-ended).

The MIT permission grant, conditions, and warranty disclaimer SHALL appear once below the layered copyright lines and apply to all three layers.

#### Scenario: All three lineage layers credited

- **WHEN** a reader opens the top-level `LICENSE.md`
- **THEN** the file contains a copyright line for Simon Tatham + upstream contributors
- **AND** a copyright line for Mike Edmunds
- **AND** a copyright line for Yoni Lavi
- **AND** a single MIT permission/conditions/warranty body that covers all three

#### Scenario: Upstream contributor list not duplicated

- **WHEN** `LICENSE.md` references upstream contributors
- **THEN** it directs the reader to `puzzles/LICENCE` rather than enumerating contributors inline
- **AND** `puzzles/LICENCE` is left byte-identical to upstream

### Requirement: CREDITS.md file thanking lineage

The repository SHALL contain a top-level `CREDITS.md` file that thanks upstream Simon Tatham + contributors and the medmunds/puzzles-web project, with links to both source repositories.

#### Scenario: CREDITS.md links to both upstream sources

- **WHEN** a reader opens `CREDITS.md`
- **THEN** the file thanks Simon Tatham + upstream puzzles contributors and links to the upstream repository
- **AND** it thanks Mike Edmunds and links to puzzles-web
