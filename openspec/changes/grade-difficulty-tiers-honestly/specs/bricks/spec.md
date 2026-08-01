# bricks Specification Delta — grade-difficulty-tiers-honestly

## ADDED Requirements

### Requirement: Bricks grades its difficulty tiers honestly

A Bricks board generated at a difficulty above the easiest SHALL NOT be soluble at
the tier below it.

This diverges from upstream, whose min-difficulty gate rejects only puzzles the
*Easy* solver completes and therefore never guarantees the chosen tier is
required — which its own documentation admits ("selecting Tricky difficulty may
generate a puzzle at Normal difficulty instead"). Because generation is
solver-gated, the correction changes every board above the easiest tier; the
byte-for-byte differential SHALL retain a way to run upstream's original gate,
used by that differential alone.

#### Scenario: A Tricky board genuinely needs the Tricky tier

- **WHEN** a board generated at Tricky is solved at Normal
- **THEN** the solver does not reach a solution
- **AND** solving the same board at Tricky does
