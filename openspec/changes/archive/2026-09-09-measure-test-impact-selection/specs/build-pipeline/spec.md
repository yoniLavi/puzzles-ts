# build-pipeline — delta

## ADDED Requirements

### Requirement: Import-graph test selection is measured unsound here, and is not adopted

Selecting which tests a commit runs by walking the **static import graph**
(`vitest related`, `vitest --changed`, or any equivalent) SHALL NOT be adopted.
The demonstration the gate requirement asks for has been run, and it fails.

Measured 2026-09-09 with the installed `vitest related`:

- **A game source change** (`src/games/sixteen/index.ts`) selects 33 of 301 test
  files, and omits every cross-game guard that reads game source as *text*
  through `import.meta.glob` while importing nothing from `games/` — among them
  the two palette guards, `palette-override-claims`, `hint-refusal` and
  `note-vocabulary`.
- **A help page change** (`help/games/sixteen.md`) selects **nothing at all**,
  while three guards exist to check those files — including
  `help-coverage.test.ts`, which holds the help directory and the catalog to
  each other in both directions.

The cause is structural rather than incidental, and it follows from a rule this
project holds deliberately: a cross-game guard finds its population by reading
**what a game is**, including its own source text, never a manifest. 26 test
files therefore reach their subjects through `import.meta.glob(..., "?raw")`,
and a file read as text forms no import edge. The design that makes these guards
impossible to forget is the same design that makes them invisible to import-graph
selection.

A future scheme MAY be adopted if it selects on what a test **actually read at
runtime** rather than on what it statically imports. Such a scheme SHALL be
accepted only against the two experiments above, and SHALL treat an
unclassifiable change as "run everything" rather than "run nothing".

This requirement bounds *test selection* only. It does not restrict the gate's
existing role-scoping — biome staged-versus-whole-tree, and the
documentation-only shortcut — which are permitted because their safety is
asserted rather than assumed.

#### Scenario: A test-impact selector is proposed

- **WHEN** a change proposes to run only the tests downstream of a commit
- **THEN** it is run against a game source change and a `help/` change, and
  adopted only if it selects the glob-based guards for both
- **BECAUSE** the guards this project most relies on are exactly the ones a
  static graph cannot see, and switching them off is silent

#### Scenario: A commit touches only help pages

- **WHEN** a selector reports no tests for a change under `help/`
- **THEN** the selector is rejected rather than the guards skipped
- **BECAUSE** `help/` is a build input and `help-coverage.test.ts`'s subject,
  which is why it is already excluded from the documentation-only shortcut
