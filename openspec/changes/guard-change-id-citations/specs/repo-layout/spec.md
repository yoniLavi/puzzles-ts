# repo-layout — deltas for guard-change-id-citations

## ADDED Requirements

### Requirement: A change id cited outside the archive SHALL resolve

A change id written in `docs/` or `AGENTS.md` SHALL resolve to an open change
directory, an archive entry — cited with or without its date prefix — or a
postmortem. A guard in the gate's fast prefix SHALL assert this, and the tokens
that are not change ids SHALL be held in a ledger asserted to be **exactly** the
unresolved set, so an entry cannot silently absorb a real dead citation.

`openspec/changes/archive/` is deliberately out of scope. An archived change is
history: its citations were true when written, and forcing them to track later
renames falsifies the record. This is the same asymmetry as "A change that moves
or deletes a path updates the unarchived changes that name it", for the same
reason.

**Why this is guarded rather than left to care.** A prose citation cannot survive
the one mutation this workflow performs most often — a change being renamed or
withdrawn — and nothing else in the tree notices. Measured: the guard was
considered on 2026-09-04 and declined on the finding that no dead citation
existed, and one was created **46 minutes later** by the rename of
`census-the-hintless-logic-games` to `characterize-the-hint-assessment-corpus`,
in the same commit that wrote the replacement sentence. It stood for five days.

**The resolver SHALL know all three homes, and the scan SHALL carry a vacuity
number.** A resolver that checks only dated archive entries reported eleven false
positives out of twelve on its first run — blind to citations written with the
date already in them and to withdrawn changes, whose directories are gone by
design. A guard whose first run is 92% false positives gets switched off, which
is worse than no guard. Separately, the file glob and the token count SHALL be
floored: a docs restructure that stops the scan matching must fail loud rather
than pass over nothing and report health.

#### Scenario: A change is renamed

- **WHEN** a change directory is renamed or withdrawn while prose still names the
  old id
- **THEN** the gate fails on that id, naming the file and line, before the commit
  lands

#### Scenario: A token is not a change id

- **WHEN** the docs cite a CSS feature, git tag, script name or DOM event whose
  shape matches a change id
- **THEN** it is carried in the ledger, and the ledger is asserted to be exactly
  the unresolved set, so it fails if the token later starts resolving or if a
  genuinely dead citation is added to it

#### Scenario: The scan matches nothing

- **WHEN** a docs restructure moves the files out from under the scan's glob
- **THEN** the floors on files scanned and tokens found fail, rather than every
  downstream assertion passing over an empty set
