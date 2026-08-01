# repo-layout Specification Delta — rehome-upstream-help-sources

## MODIFIED Requirements

### Requirement: Per-puzzle help pages this project maintains live under `help/`

Every help page the app serves to players SHALL live under `help/` — both the
per-puzzle pages this project authors (`help/games/<puzzleId>.md`) and the
upstream-authored material the app renders: the per-puzzle overview fragments
and the halibut source for the in-app manual.

None of them SHALL live inside `puzzles/`. The distinction that matters is not
who wrote the page but whether the app serves it: a served page is an input to
this project's build, and its location should say so.

Upstream-authored pages SHALL keep their content and their attribution
unchanged by the move — relocating them is not licence to edit them — and the
URLs they are served at SHALL be unaffected.

These pages introduce the puzzle and how it is played. They SHALL NOT describe
the state of its implementation.

#### Scenario: Every served help page lives under `help/`

- **WHEN** the help sources are located
- **THEN** the project-authored pages, the overview fragments and the manual
  source are all under `help/`
- **AND** no page the app serves is read from `puzzles/`

#### Scenario: Relocation changes no URL and no words

- **WHEN** the upstream-authored help sources are moved
- **THEN** each page is served at the same URL as before
- **AND** its content and attribution are unchanged
