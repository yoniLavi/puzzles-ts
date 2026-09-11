## ADDED Requirements

### Requirement: The gate fails when an export loses its last importer
The gate SHALL assert that `src/` carries no unused export or exported type, and
the assertion SHALL carry a vacuity floor so that a scan matching nothing fails
rather than reporting health.

An unused export is invisible to the typechecker, to biome and to every test,
because nothing that runs reads it. It is found only by asking which module
imports it, and a tidy pass found dead accessors, dead re-exports and dead
constants across the games by hand. The tool for this is a devDependency
already; what is missing is a step that runs it.

#### Scenario: an export loses its last importer

- **WHEN** the only import of an exported symbol is deleted
- **THEN** the gate fails, naming the symbol and its file
- **AND** deleting the export, or importing it again, makes the gate pass

#### Scenario: the scan matches nothing

- **WHEN** a configuration or path change stops the scan reaching `src/`
- **THEN** the floor on files scanned fails, rather than the step passing over an
  empty set

### Requirement: A complexity ceiling is set from the tree's own distribution
The cognitive-complexity ceiling SHALL be a number taken from the measured
distribution of this repository, recorded with that measurement, and SHALL NOT be
left at a value no function in the tree can reach.

A rule configured never to fire is indistinguishable from a rule that is off,
except that it reads as enforced. Measured 2026-09-12: at 25 the rule reports 467
diagnostics, at 50 it reports 20 sites of which 14 are outside tests, and at 100
it reports 26. The ceiling in force at that date was 150, and biome's own default
is 15, so neither end of the range was a usable answer.

Test files SHALL be outside the rule. A table-driven `describe` scores high and
reads fine, so including tests would make the rule mostly a comment on test
style.

#### Scenario: a new function exceeds the ceiling

- **WHEN** a function is added whose cognitive complexity is above the ceiling
- **THEN** the gate fails, and the author either simplifies it or records at the
  site why the shape is inherent

#### Scenario: an existing site is accepted rather than simplified

- **WHEN** a site named by the rule is geometry or a solver whose branching is
  inherent
- **THEN** it may stay, with a comment stating the reason it is that shape
- **AND** the comment states the constraint, not the history of the decision
