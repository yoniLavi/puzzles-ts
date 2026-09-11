## ADDED Requirements

### Requirement: A game's render test records through the shared recording drawing
A test asserting what a game draws SHALL drive the engine's shared recording
drawing rather than a double of its own, so that the record it asserts against
contains every primitive the game emitted.

A hand-rolled double records only the calls its author anticipated. A game that
begins drawing something new, or stops drawing something, leaves such a test
green, and the test reads as coverage while being a filter. Measured 2026-09-12:
18 game test files carried their own double against 37 using the shared one, and
96 of the repository's 109 `as unknown as` casts were in test files, most of them
making those doubles typecheck.

#### Scenario: a game changes what it draws

- **WHEN** a game's renderer emits a primitive it did not emit before
- **THEN** the recording contains it, whether or not the test asserts on it
- **AND** a test asserting the frame as a whole shows it as a reviewable diff

#### Scenario: a migrated test still catches its own defect

- **WHEN** a test moves from a local double to the shared recorder
- **THEN** the defect named in the test's title is planted, seen red, and restored
- **AND** a test that cannot be made red is reported as the finding it is
