# repo-layout Specification Delta — audit-author-known-issues

## ADDED Requirements

### Requirement: Per-puzzle help pages this project maintains live under `help/`

The help pages for puzzles that have no upstream halibut manual SHALL live in
`help/games/<puzzleId>.md` and SHALL be maintained by this project. They are
adapted from the documentation shipped with the third-party sources, and they are
rendered to `/help/<puzzleId>.html`.

They SHALL NOT live inside `puzzles/`. That tree is an upstream reference this
project does not track and eventually removes, so a page served to players cannot
depend on it; and a page this project edits is no longer reference material.

These pages SHALL introduce the puzzle — its rules, its provenance, its controls
and its parameters. They SHALL NOT carry development status, known-issue lists or
roadmap notes: a player reading the help for a game is not the audience for a
statement about its implementation, and such a statement goes stale silently the
moment the issue is addressed.

#### Scenario: A puzzle without an upstream manual has a help page

- **WHEN** the help page for such a puzzle is requested
- **THEN** it is served from `help/games/<puzzleId>.md`, and describes how to
  play rather than the state of the implementation
