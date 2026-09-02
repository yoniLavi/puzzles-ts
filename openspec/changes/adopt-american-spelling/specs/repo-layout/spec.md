# repo-layout Specification Delta — adopt-american-spelling

## ADDED Requirements

### Requirement: Source, documentation and specs use American English spelling

Every word this project writes SHALL use American English spelling — in
TypeScript identifiers, in file and directory names, in comments, in `docs/`,
in the root markdown, in `scripts/`, in `openspec/specs/`, and in pending
changes under `openspec/changes/`. `color`, `center`, `gray`, `neighbor`,
`behavior`, `initialize`, `serialize`, `normalize`, `license`, `catalog`,
`analyze`, `artifact`, and the rest of the stem table in
`scripts/checks/spelling-table.mjs`, which is the convention's one copy: the
guard scans for every stem in it, and `scripts/checks/spelling-fold.mjs`
applies it to stdin, which is how a respelling diff is proved to be nothing
else (every removed line equals its added line once both are folded).

Three kinds of text are exempt, because they are not this project's words or
are its record:

- **The archive and the postmortems** — `openspec/changes/archive/` and
  `openspec/postmortems/`. A change archived under a British name keeps it;
  rewriting the record would describe a tree that never existed at the time.
  A live document MAY cite an archived change by its id.
- **Other people's words.** The files under `licenses/` are renamed by this
  project and their bytes are not touched; the upstream C kept as a reading
  reference under a change's `reference/` is not rewritten; the lockfile is
  npm's.
- **A name this project does not own** — `game_colours`, `midend_colours`,
  `frontend_default_colour` and their kin, named in a comment as the C function
  a port implements, and a third-party API member such as `@sentry/browser`'s
  `behaviour` option. A quotation respelled is a pointer falsified; an API
  member respelled does not compile. The table carries an explicit allowance
  for each, scoped to the file it is expected in.

The spelling of the platform is not a counter-example: CSS `color`,
`prefers-color-scheme`, `text-align: center` and the Web Awesome `--wa-color-*`
tokens are American, which is the reason only this spelling can be made
consistent across the tree.

The convention is enforced by the gate, not by review. `scripts/checks/spelling.mjs`
SHALL scan every tracked file outside the exemptions for every stem in the
table, as a substring and case-insensitively — so `ncolours` and
`colourToOKLCH` are found, not only the whole word — SHALL report file and line
for each hit outside an allowance, and SHALL assert the number of files it
scanned exceeds a floor, so a broken listing cannot report health over nothing.
It SHALL run in the gate's fast prefix, ahead of the documentation-only
shortcut, and not as a vitest file: a test may not read `docs/` or `openspec/`
(the shortcut's safety rests on that), and those are the directories a British
spelling most easily re-enters.

Generated output is checked at its source, not its product: `metrics/` and the
render snapshots under `__snapshots__/` are excluded because their generators
are scanned.

#### Scenario: A British spelling enters a swept area

- **WHEN** a file under `src/`, `docs/`, `scripts/` or `openspec/specs/` gains
  an identifier, path or word spelled the British way
- **THEN** `scripts/checks/spelling.mjs` fails, naming the file and line
- **AND** the pre-commit gate blocks the commit, whether or not the commit
  touches source

#### Scenario: A quotation of an upstream symbol is allowed where it is expected

- **WHEN** a comment names `game_colours` in the file the allowance lists
- **THEN** the guard accepts it
- **AND** the same token in a file the allowance does not list is reported

#### Scenario: The archive is left in its own words

- **WHEN** the guard runs
- **THEN** nothing under `openspec/changes/archive/` or `openspec/postmortems/`
  is scanned or rewritten
- **AND** an archived change named `consolidate-colour-palette` keeps that name,
  and a live document citing it by that name is not reported

#### Scenario: The guard counts what it looked at

- **WHEN** the guard's file listing yields fewer files than its floor
- **THEN** it fails on the count before asserting anything about spelling
