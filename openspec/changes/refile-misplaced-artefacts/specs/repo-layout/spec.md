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

**`docs/` is split by authorship, on the same rule as `help/`.** Material this
project did not write and may not edit SHALL live under `docs/upstream/`, with a
README recording its provenance and pointing at the licence that covers it;
everything else under `docs/` is ours. Currently `docs/upstream/tilings/` holds
upstream's hat and spectre construction diagrams, which document live TypeScript
in the engine's `tilings/`.

The boundary exists because the two kinds carry **opposite obligations**. Our
guides are a live wiki — a session that finds a gap is expected to close it *in
the same change*, as part of "done". Upstream material is read-only: revising it
is not maintenance but misattribution, since the words stay under someone else's
name. A directory holding both tells the next reader to do both, and one of the
two instructions is wrong for whatever they opened.

Reference material under `docs/upstream/` SHALL be reachable from the code it
documents — a pointer comment in the implementing module — and not only from a
line in `AGENTS.md`. Material nobody can find from the thing it explains is
filed, not available.

`docs/` is developer-facing and SHALL NOT hold anything the app serves; a page
the app serves is a build input and lives under `help/`, whoever wrote it.

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

#### Scenario: Upstream reference material is added to docs/

- **WHEN** third-party material is kept as a developer reference (diagrams,
  tables, an explanation of a construction the project ports)
- **THEN** it lands under `docs/upstream/`, unmodified, with its provenance and
  licence recorded
- **AND** it is NOT filed beside this project's guides, where the standing
  instruction is to keep the contents current

#### Scenario: A reference is reachable from the code it explains

- **WHEN** a module implements something explained by material under
  `docs/upstream/`
- **THEN** the module carries a pointer comment to it
- **AND** the reference is not discoverable only from `AGENTS.md`
