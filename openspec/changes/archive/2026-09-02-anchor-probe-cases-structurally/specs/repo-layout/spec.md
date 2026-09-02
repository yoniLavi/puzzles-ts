# repo-layout Specification Delta — anchor-probe-cases-structurally

## ADDED Requirements

### Requirement: A local-feedback probe case is anchored within a named function

Each case in the local-feedback probe corpus SHALL identify the function or
method whose behaviour it perturbs, and its search text SHALL be required to
match exactly once **within that function**, rather than once within the whole
module.

The anchor check SHALL keep aborting the run — and failing the commit gate — on
a missing or ambiguous anchor, because an edit that does not apply reports
`SURVIVED`, which is indistinguishable from a finding.

Anchoring to a whole file makes a case breakable by any unrelated edit that adds
a similar-looking line elsewhere in the module, so the corpus's maintenance cost
rises with the amount of refactoring done — the opposite of what this project
now asks for. A case's stated meaning is already a claim about one function; the
anchor SHALL be scoped the same way.

#### Scenario: An unrelated duplicate elsewhere in the module does not break a case

- **WHEN** a module gains a line matching a case's search text, outside the
  function that case names
- **THEN** the case still resolves, and the anchor check passes

#### Scenario: An ambiguous anchor inside the named function still aborts

- **WHEN** a case's search text matches more than once within the function it
  names
- **THEN** the run aborts rather than choosing one

#### Scenario: Migration preserves every measurement

- **WHEN** the corpus is re-anchored
- **THEN** a full probe run reports the same cases, the same catches and the
  same per-module rate as before the change
