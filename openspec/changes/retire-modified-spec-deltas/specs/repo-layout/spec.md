# repo-layout Specification Delta — retire-modified-spec-deltas

## ADDED Requirements

### Requirement: A change's spec deltas only add; edits to an existing requirement are made in place

A change's delta files under `openspec/changes/<id>/specs/` SHALL use only
`## ADDED Requirements`. A change that needs to alter or remove an existing
requirement SHALL state that intent in prose in its `proposal.md`, and SHALL
make the alteration directly in `openspec/specs/<capability>/spec.md` as part of
archiving, reading the live text at the moment it edits it.

The retired mechanism replaced a live requirement with a copy of it taken when
the change was scaffolded and applied when the change was archived — an
arbitrary interval during which another change could edit the same requirement,
whose work the copy then silently deleted. That is not a hazard the author can
be careful about: the loss leaves a valid-looking delta, so schema validation
cannot detect it, and a scenario-survival check cannot see prose removed from
inside a requirement, nor a delta that edits a *different* requirement from the
one it claims to.

The prohibition SHALL cover every verb that acts on an existing requirement, not
only the copying one. Removal and renaming carry no copy and so cannot delete
content silently, but admitting them re-opens "is this one safe?" at every use,
where one verb is a rule with nothing to remember and a check that cannot be
subtly wrong. The reason for a removal, which the retired form carried as
`**Reason**` and `**Migration**` prose, SHALL be stated in the change's
`proposal.md` instead.

The rule SHALL be enforced mechanically against open changes, and SHALL NOT be
applied to `openspec/changes/archive/`, whose contents were authored under the
previous scheme and are history.

#### Scenario: A delta that edits rather than adds is refused

- **WHEN** a delta file under an open change declares a requirements section
  under any verb that acts on an existing requirement — modifying, removing or
  renaming it
- **THEN** the commit gate fails, naming the file and the line
- **AND** a delta carrying ordinary prose sections alongside its additions is
  unaffected

#### Scenario: Archived changes keep their original deltas

- **WHEN** the check runs over a repository whose archive contains changes using
  the retired verb
- **THEN** those are not reported, because rewriting them would risk the very
  loss the rule prevents

#### Scenario: Editing a requirement is visible in the spec's own history

- **WHEN** a change alters an existing requirement
- **THEN** the alteration appears as an ordinary diff to
  `openspec/specs/<capability>/spec.md` in the archiving commit
