# repo-layout Specification Delta — adopt-american-spelling

## ADDED Requirements

### Requirement: Source, documentation and specs use American English spelling

Every word this project writes SHALL use American English spelling — in
TypeScript identifiers, in file and directory names, in comments, in `docs/`,
in the root markdown, in `scripts/`, in `openspec/specs/`, and in pending
changes under `openspec/changes/`. `color`, `center`, `gray`, `neighbor`,
`behavior`, `initialize`, `serialize`, `normalize`, `license`, `catalog`,
`analyze`, `artifact`, and the rest of the stem table the guard reads.

Three kinds of text are exempt, because they are not this project's words or
are its record:

- **The archive and the postmortems** — `openspec/changes/archive/` and
  `openspec/postmortems/`. A change archived under a British name keeps it;
  rewriting the record would describe a tree that never existed at the time.
- **Upstream notices' contents.** The files under `licenses/` are renamed by
  this project and their bytes are not touched.
- **Quotations of an upstream symbol** — `game_colours`, `midend_colours`,
  `frontend_default_colour` and their kin, named in a comment as the C function
  a port implements. A quotation respelled is a pointer falsified. The guard
  carries an explicit allowance for each, scoped to the file it is expected in.

The spelling of the platform is not a counter-example: CSS `color`,
`prefers-color-scheme`, `text-align: center` and the Web Awesome `--wa-color-*`
tokens are American, which is the reason only this spelling can be made
consistent across the tree.

The convention is enforced by a gate test, not by review. `src/spelling.test.ts`
SHALL scan the swept areas for every stem in the table, as a substring and
case-insensitively — so `ncolours` and `colourToOKLCH` are found, not only the
whole word — SHALL report file and line for each hit outside an allowance, and
SHALL assert the number of files it scanned exceeds a floor, so an unmatched
glob cannot report health over nothing.

#### Scenario: A British spelling enters a swept area

- **WHEN** a file under `src/`, `docs/`, `scripts/` or `openspec/specs/` gains
  an identifier, path or word spelled the British way
- **THEN** `src/spelling.test.ts` fails, naming the file and line
- **AND** the pre-commit gate blocks the commit

#### Scenario: A quotation of an upstream symbol is allowed where it is expected

- **WHEN** a comment names `game_colours` in the file the allowance lists
- **THEN** the guard accepts it
- **AND** the same token in a file the allowance does not list is reported

#### Scenario: The archive is left in its own words

- **WHEN** the guard runs
- **THEN** nothing under `openspec/changes/archive/` or `openspec/postmortems/`
  is scanned or rewritten
- **AND** an archived change named `consolidate-colour-palette` keeps that name

#### Scenario: The guard counts what it looked at

- **WHEN** the guard's file glob matches fewer files than its floor
- **THEN** it fails on the count before asserting anything about spelling
