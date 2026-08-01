# mathrax Specification Delta — grade-difficulty-tiers-honestly

## ADDED Requirements

### Requirement: Mathrax grades its difficulty tiers honestly

A Mathrax board generated at a difficulty above the easiest SHALL NOT be soluble at
the tier below it.

This diverges from upstream, whose generator gates only at `maxdiff` with maximal
stripping and never rejects a puzzle that turns out solvable at a lower
difficulty than requested. Because generation is
solver-gated, the correction changes every board above the easiest tier; the
byte-for-byte differential SHALL retain a way to run upstream's original gate,
used by that differential alone.

#### Scenario: A Hard board genuinely needs the Hard tier

- **WHEN** a board generated at Hard is solved at Tricky
- **THEN** the solver does not reach a solution
- **AND** solving the same board at Hard does
