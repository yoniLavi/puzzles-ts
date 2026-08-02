# repo-layout Specification Delta — refile-misplaced-artefacts

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

The initial guides are `docs/porting/game-port-playbook.md` (the ordered
game-port procedure) and `docs/porting/hint-authoring.md` (the procedure for
adding an explained `hint()` to a ported game).

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
