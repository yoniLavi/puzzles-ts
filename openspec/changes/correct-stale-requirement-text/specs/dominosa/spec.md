## MODIFIED Requirements

### Requirement: Dominosa game implements the Game interface

The engine SHALL provide a registered `dominosa` game implementing
`Game<DominosaParams, DominosaState, DominosaMove, DominosaUi, DominosaDrawState, DominosaMistake>`:
partition an `(n+2) × (n+1)` grid of numbers (each `0…n`) into 2×1 dominoes so
that the placed dominoes are exactly the `DCOUNT(n) = (n+1)(n+2)/2` distinct
number-pairs `0-0 … n-n`, one of each, with every domino's two numbers matching
the underlying clues. Params SHALL be `n` (maximum face number, default 6) and
`diff` (Easy / Normal / Tricky / `Unreasonable` / Ambiguous), encoded `"{n}"` with
a full-form `"d{t|b|h|e|a}"` difficulty suffix; a legacy bare `"a"` suffix SHALL
decode to Ambiguous. The fourth tier is named `Unreasonable` rather than
upstream's `Extreme` because its forcing-chain deduction is a search over a
closure of all placements, and it is the last tier that is a difficulty —
`Ambiguous` follows it in the list but relaxes the puzzle's promise rather than
deepening its ladder. All 12 upstream presets SHALL be offered. `validateParams`
SHALL enforce `n ≥ 1`, a valid difficulty, and the upstream overflow bound. The
game SHALL report `canSolve = true` and `canFormatAsText = true` (for `n < 1000`).

#### Scenario: Params round-trip

- **WHEN** params `{ n: 6, diff: DIFF_HARD }` (the Tricky tier) are encoded in full
- **THEN** the result is `"6dh"` and decoding it round-trips the params

#### Scenario: The renamed tier keeps its difficulty character

- **WHEN** params at the fourth tier are encoded in full
- **THEN** the suffix is still `"de"`, so a game ID written before the rename
  names the same board

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is given `n = 0`
- **THEN** it returns a non-null error string
