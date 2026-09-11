## ADDED Requirements

### Requirement: A constant is hoisted into a shared module on a measurement, not on a duplication count
Moving a constant that a hot loop reads into a shared module SHALL be justified by
a paired measurement in both the test environment and a production build, and the
measurement SHALL be recorded with the change that makes the move.

Duplication alone is not the argument. A table read inside a tight loop may cost
more as an imported binding than as a module-local one, and the cost can differ
between the test transform and the bundled build, which is what decides whether
it is a fact about the suite or about the game. A refactor that removes six
copies and makes generation measurably slower is not an improvement, and the only
way to know which one happened is to measure before committing to it.

#### Scenario: a shared table is proposed for a hot loop

- **WHEN** a constant read inside a solver or generator loop is proposed for a
  shared module
- **THEN** the same loop is timed with the constant local and imported, paired and
  interleaved, under vitest and in a production build
- **AND** the move is made only if neither measurement shows a slowdown beyond the
  control's spread

#### Scenario: the cost exists only under the test transform

- **WHEN** the imported form is slower under vitest but not in the build
- **THEN** the finding is recorded as a property of the test environment
- **AND** it does not by itself forbid the shared constant
