## ADDED Requirements

### Requirement: A change id cited in source resolves, or the scan is not widened
A change id written in a comment under `src/` SHALL resolve to an open change, an
archive entry or a postmortem, on the same terms as one written in `docs/` — but
the scan SHALL be widened to source only on a measurement showing that source
comments cite change ids, and not on the assumption that they do.

The existing requirement on citations excluded `openspec/specs/` on a measured
finding, not a principle, and set the test for widening: a scan is widened only
where the same measurement comes back the other way. This requirement holds
source to that same test rather than exempting it.

What is already known: a tidy pass removed change ids from source comments across
57 games and the engine by hand, and 23 unresolvable `design D<n>` and numeric
section tags survived it. Those are a different shape from a change id and may
need their own pattern.

#### Scenario: the measurement decides the scope

- **WHEN** the kebab-token measurement is taken over `src/**/*.ts`
- **THEN** the scan is widened to source if the tokens found are predominantly
  change ids
- **AND** if they are predominantly product vocabulary, the scan is not widened
  and the measurement is recorded as the reason

#### Scenario: a dead citation is added to a source comment

- **WHEN** the scan covers source and a comment cites a change that is renamed or
  withdrawn
- **THEN** the gate fails, naming the file and line, before the commit lands

#### Scenario: a tag cites a heading that does not exist

- **WHEN** a source comment cites a numbered section or a design tag that
  resolves nowhere
- **THEN** it is removed or repointed at a heading that exists
- **AND** no test title is changed in doing so, because renaming a test orphans
  its snapshot key
