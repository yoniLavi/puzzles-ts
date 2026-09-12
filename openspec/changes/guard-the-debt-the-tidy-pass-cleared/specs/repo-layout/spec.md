## ADDED Requirements

### Requirement: A change id cited in source resolves, on the same terms as one in docs
A change id written in a comment, a test title or an error string under `src/`
SHALL resolve to an open change, an archive entry or a postmortem, on the same
terms as one written in `docs/` — the scan having been widened to source on the
measurement the existing citation requirement demands before widening, and not
on the assumption that source cites changes.

**The measurement, 2026-09-12**: `src/**/*.ts` carries **63 distinct kebab
tokens across 57 files, 53 of them resolving and 9 not**. That is a ratio in
`docs/`'s league (6 unresolved of 85) and nothing like `openspec/specs/`'s (15 of
31, not one of them a change id), which is the finding that excluded the specs.
Source comments do cite changes here, mostly in test-file headers naming the
change that wrote the file.

A numbered section reference is a **different shape** and needs its own answer.
`docs/games/` has no numbered headings at all, so a `§<number>` pointing into a
guide is dead by construction — a survivor of `docs/porting/`'s numbering, which
`rewrite-game-dev-docs` deleted. Six stood in `src/`. The two places a numbered
section still resolves are `docs/test-strength.md` and an archived change's own
document, and a citation SHALL say which: a bare `§9.1` names no file, and a
bare `design D5` in one game's tests names one of two archived changes whose D5s
say different things.

#### Scenario: a dead citation is added to a source comment

- **WHEN** a comment, test title or error string under `src/` cites a change that
  is renamed or withdrawn
- **THEN** the gate fails, naming the file and line, before the commit lands

#### Scenario: a token matching the key is not a change id

- **WHEN** the scan's key catches a preference key, a command id, a solver rung
  name or a params string
- **THEN** it is carried in the ledger with the reason it is there
- **AND** the ledger is asserted exactly equal to the unresolved set, so an entry
  that starts resolving fails as loudly as a new dead citation

#### Scenario: a design tag names no document

- **WHEN** a source comment or test title carries a `D<n>` or `§<n>` tag
- **THEN** it names the change or the file whose numbering it means, so it
  resolves through the citation scan rather than needing a scan of its own
- **AND** where the tag appears in test titles, the change is named once in the
  file's header comment, so no test title changes and no snapshot key is orphaned
