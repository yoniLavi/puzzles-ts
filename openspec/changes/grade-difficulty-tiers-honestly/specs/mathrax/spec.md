# mathrax Specification Delta — grade-difficulty-tiers-honestly

## ADDED Requirements

### Requirement: Mathrax grades its difficulty tiers honestly

A Mathrax board generated at a difficulty above the easiest SHALL NOT be soluble at
the tier below it.

This diverges from upstream, whose generator strips clues while the board still
solves at the target tier and publishes the result, never asking whether an easier
tier would also have done. Upstream generates exactly once; the corrected
generator retries until a candidate binds, and that loop SHALL be bounded.

Because generation is solver-gated at every removal, the correction changes every
board above the easiest tier; the byte-for-byte differential SHALL retain a way to
run upstream's original gate, used by that differential alone. This is the second
divergence in this generator — the first requires removals to keep the board
*uniquely* solvable — and with the original gate selected the loop SHALL return on
its first pass, so the random-number draw order is unchanged.

#### Scenario: A Tricky board genuinely needs the Tricky tier

- **WHEN** a board generated at Tricky is solved at Normal
- **THEN** the solver does not reach a unique solution
- **AND** solving the same board at Tricky does

### Requirement: Mathrax offers only the difficulties a size can support

Mathrax SHALL refuse to *generate* a size-3 board at Normal or at Recursive;
`validateParams` SHALL reject those combinations when asked for a full
(generation-capable) parameter set, while continuing to accept them otherwise so a
saved game or a game ID carrying its own description still loads.

A 3×3 grid has only four intersections, which is not enough structure to separate
those tiers from their neighbours: no board needing Normal, and none needing
Recursive, was found in 3,000 candidates each. Size 3 *Tricky* is unaffected, and
every tier at size 4 and above is reachable at ordinary cost.

#### Scenario: An unsupported size and tier are refused

- **WHEN** a full parameter set requesting size 3 at Normal or Recursive is
  validated
- **THEN** it is rejected with a message naming the size
- **AND** the same parameters validate successfully when a description is supplied
  rather than generated
