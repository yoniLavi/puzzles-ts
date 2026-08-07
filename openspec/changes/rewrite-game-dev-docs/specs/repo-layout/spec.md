## MODIFIED Requirements

### Requirement: Developer guides live under docs/ and link to specs

Developer guides under `docs/` SHALL describe procedure (the followable
*how*) and SHALL NOT restate normative requirements. A guide MUST link to
the authoritative spec requirement rather than paraphrase it, and MUST name
exemplar files rather than copy code that would rot. This keeps the specs
(`ts-migration`, `ts-engine`, `repo-layout`, per-game) the single source of
truth for *what* is required, so a guide can only ever go stale (a broken
link or an outdated exemplar pointer, caught by review), never silently
contradict a requirement.

The guides are the `docs/games/` set, organised by concern: `README.md` (the
map, the game lifecycle and the definition of done), `mechanics.md`,
`input.md`, `rendering.md`, `solver-and-generator.md`, `hints.md`,
`testing.md` and `engine-catalog.md`, plus the repo-wide
`docs/test-strength.md`. Guide sections SHALL be citable by **named heading**
(`<file> § "Heading"`), and headings that are cited from code or specs SHALL
be kept short, distinctive and grep-stable; positional section numbers SHALL
NOT be used as citation targets, because they shift on insertion and silently
strand every citation.

**`docs/` holds this project's own guides.** Everything under it carries the
standing obligation stated in `AGENTS.md` — *"treat these as a live wiki… every
time you hit something the guide didn't tell you, update the guide in the same
change; that is part of done"* — so material this project may not edit does not
belong there. A directory holding both kinds issues both instructions, and one of
them is wrong for whatever the reader opened.

**A third-party explanation SHALL be carried as a link to its maintained source,
not as a copy in this repository.** A local copy is a fork of someone else's
document that nobody will notice diverging, and it competes with the link the
code already carries. `docs/tilings/` was 564 KB of upstream's hat and spectre
construction diagrams; `hat.ts`'s own header already told the reader to read
upstream's live write-up *before* the file and linked it, so the copy was
referenced by nothing but one bullet in `AGENTS.md`. It is deleted, and the link
is what is maintained.

Where a linked explanation is genuinely load-bearing for a module, the **module**
SHALL carry the pointer, in the file a reader would already have open — not a
line in `AGENTS.md`, which is where a reference goes to be filed rather than
found.

`docs/` is developer-facing and SHALL NOT hold anything the app serves; a page
the app serves is a build input and lives under `help/`.

#### Scenario: A guide states a normative rule

- **WHEN** a `docs/` guide mentions a rule that a spec owns (e.g. the
  parity-gated registration rule, or the hint quality bar)
- **THEN** the guide states it briefly and links to the owning spec
  requirement
- **AND** the guide does not contain the authoritative wording such that the
  two could diverge

#### Scenario: A guide shows a code pattern

- **WHEN** a `docs/` guide describes an implementation pattern (e.g. the
  `Int32Array` packed-bits render cache key)
- **THEN** it points at an exemplar file that demonstrates the pattern
- **AND** it does not paste a code snippet that would drift from the source

#### Scenario: A third-party explanation is needed by a module

- **WHEN** a module implements an algorithm explained by a third-party document
- **THEN** the module's own header links that document at its maintained source
- **AND** the repository does not carry a copy of it under `docs/`

#### Scenario: Deleting a copy does not delete the explanation

- **WHEN** a copied third-party reference is removed
- **THEN** the link that replaces it is confirmed present in the implementing
  modules first
- **AND** anything the linked source does not cover is moved into the code as a
  comment where a reader of that code would look

#### Scenario: A guide section is cited from code

- **WHEN** a source comment or spec cites a guide section
- **THEN** the citation names the guide file and the section's heading text
- **AND** renaming that heading repoints every citation in the same change

### Requirement: A scaffolding script stamps out a new game-port skeleton

The repository SHALL provide `scripts/new-game-port.sh <gameId>` that creates the
mechanical skeleton of a new game: `src/games/<gameId>/` containing typed
`Game<…>` stub modules (the `index`/`state`/`solver`/`generator`/`render`
file shape the game guides prescribe), an empty `__fixtures__/`
placeholder, AND starter test scaffolding — a `<gameId>.test.ts` (a
serialise/deserialise round-trip skeleton plus a `renderScenario` smoke skeleton
importing from `src/engine/testing/`) and a `<gameId>-generation.test.ts`
stub for the generation invariants that stand in for the retired byte-match
oracle. The script SHALL refuse to overwrite an existing game directory.

It SHALL print — but SHALL NOT itself perform — the manual-edit checklist that
requires judgement: registering the game in `src/games/index.ts`, adding
its catalog entry to `src/puzzle/catalog-data.ts`, stating what the generation
test asserts, and adding the two committed icon PNGs.
`docs/games/README.md` SHALL reference the script as the copy-from-exemplar
entry point.

The scaffold SHALL NOT emit a C-differential stub or instruct a contributor to
write a `<gameId>-trace.c` harness: `retire-c-engine` deleted the C build, so a
new game has no upstream oracle to record a fixture against. The existing frozen
fixtures belong to games ported while that build existed and are unaffected.

#### Scenario: Scaffolding a new game

- **WHEN** a contributor runs `scripts/new-game-port.sh singles`
- **THEN** `src/games/singles/` is created with the typed stub modules, an
  empty `__fixtures__/`, a starter `singles.test.ts`, and a
  `singles-generation.test.ts` stub
- **AND** the emitted files type-check and lint clean
- **AND** the script prints the manual-edit checklist (the two registration
  points, the generation invariants, the icon PNGs) without editing those files

#### Scenario: The scaffold does not promise an oracle that no longer exists

- **WHEN** the scaffold is generated
- **THEN** it contains no C-differential stub and no trace-harness instruction
- **AND** the generation-test stub states that the game's assurance is
  behavioural

## ADDED Requirements

### Requirement: Design-fiction docs are labelled and quarantined

Design-fiction documents SHALL be labelled and quarantined: documents that
describe a designed-but-unimplemented architecture (readme-driven
development artefacts) SHALL live under a directory whose name marks them as
vision material (`docs/framework-rdd/`), and every file in it SHALL open with a
status banner stating that it describes a system that does not exist yet and
naming the change or session that authored it. A design-fiction doc SHALL NOT be
cited from code, specs, or the current-architecture guides as if it described
shipped behaviour; the current-architecture guides MAY link to it explicitly as
future direction. When part of the fiction ships, the shipped part moves into
the real guides/specs in the shipping change, and the fiction is updated or
retired rather than left claiming the present tense.

#### Scenario: A reader opens a vision doc

- **WHEN** any file under `docs/framework-rdd/` is opened
- **THEN** its first visible block states it is design fiction, not a
  description of the current system

#### Scenario: Fiction ships

- **WHEN** a change implements a mechanism the fiction describes
- **THEN** that change moves the now-true material into the real guides or
  specs and updates the fiction so no file claims unshipped behaviour in the
  present tense
