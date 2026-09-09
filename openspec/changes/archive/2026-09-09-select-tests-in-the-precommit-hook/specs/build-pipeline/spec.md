# build-pipeline — delta

## RENAMED Requirements

- FROM: `### Requirement: Import-graph test selection is measured unsound here, and is not adopted`
- TO: `### Requirement: Import-graph selection alone is unsound here, and is used only in a union`

## MODIFIED Requirements

### Requirement: Import-graph selection alone is unsound here, and is used only in a union

Selecting which tests a commit runs by walking the **static import graph**
alone (`vitest related`, `vitest --changed`, or any equivalent) SHALL NOT be
adopted. The demonstration the gate requirement asks for has been run and it
fails.

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

**What has changed is that the missing channel turned out to be derivable.**
Every `import.meta.glob` call in the tree takes a literal pattern — a string, or
an array of strings — so the couplings the graph cannot see can be enumerated
statically. The graph is therefore permitted **as one term of a union** with a
glob-reach channel, never on its own; the union is specified in "The pre-commit
hook may run a selected subset of the suite".

A scheme that selects on what a test **actually read at runtime** remains
acceptable too. Any such scheme SHALL be accepted only against the two
experiments above, and SHALL treat an unclassifiable change as "run everything"
rather than "run nothing".

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

## ADDED Requirements

### Requirement: The pre-commit hook may run a selected subset of the suite

The **automatic per-commit hook** MAY run only the test files a commit can have
broken. CI and a manual `npm run gate` SHALL continue to run the whole suite, so
the guarantee on `main` is unchanged — the same backstop argument that already
scopes biome to staged files in the hook and to the whole tree in CI.

The selection SHALL be the **union of two channels**, because neither is
sufficient alone:

1. the static import graph, via `vitest list --changed`;
2. every test whose `import.meta.glob` pattern reaches a staged path.

The glob channel SHALL match by the pattern's **literal base directory** — the
prefix before its first wildcard — rather than by evaluating the pattern. A
matcher for Vite's glob syntax is a component that can be subtly wrong, and
being subtly wrong here means silently not running a guard; matching by base
directory can only ever select *more* tests.

The selector SHALL **fail closed**, resolving to the whole suite whenever: a
staged path lies outside the directories it models, the union is empty, or
anything at all goes wrong.

A test SHALL NOT reach its subject through a channel the selector cannot model.
A guard SHALL assert this by reading the tree — failing on a computed
`import.meta.glob` pattern, or on a direct filesystem read from a test inside the
gate's `include` — and SHALL be shown to fail before it is trusted.

#### Scenario: A commit changes a help page

- **WHEN** only files under `help/` are staged
- **THEN** the guards that glob `help/` are selected and run
- **BECAUSE** the import graph alone selects nothing for such a change, which is
  the defect that made graph-only selection unusable

#### Scenario: A commit touches a file the selector does not model

- **WHEN** a staged path lies outside the modeled directories — a config file, a
  template, a script
- **THEN** the whole suite runs
- **BECAUSE** a wrong "everything" costs minutes and a wrong subset costs a guard

#### Scenario: A test acquires an unmodeled read channel

- **WHEN** a test is written with a computed glob pattern, or reads the
  filesystem directly
- **THEN** the guard fails the build and names the file
- **BECAUSE** the coupling would otherwise be invisible to the selector, and the
  commit that broke it would pass without ever running it
