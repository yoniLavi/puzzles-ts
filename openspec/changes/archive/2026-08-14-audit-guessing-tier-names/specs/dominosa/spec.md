# dominosa Specification Delta — audit-guessing-tier-names

Dominosa's top **difficulty** tier is renamed `Extreme` → `Unreasonable`. Its
`deduceForcingChain` rung takes a closure over all placements — a **Search** under
design D9 — and it has no tier above it, so the tier takes the name (§2b, §4).
`Ambiguous` still sits after it in the list: that is not a harder rung but a
different promise (its generator skips uniqueness altogether), so the rule lands
on the last tier that is a *difficulty*. The encoded difficulty character `e` is
unchanged, so game IDs, saved games and shared links are unaffected, and no board
moves.

## MODIFIED Requirements

### Requirement: Dominosa game implements the Game interface

The engine SHALL provide a registered `dominosa` game implementing
`Game<DominosaParams, DominosaState, DominosaMove, DominosaUi, DominosaDrawState, DominosaMistake>`:
partition an `(n+2) × (n+1)` grid of numbers (each `0…n`) into 2×1 dominoes so
that the placed dominoes are exactly the `DCOUNT(n) = (n+1)(n+2)/2` distinct
number-pairs `0-0 … n-n`, one of each, with every domino's two numbers matching
the underlying clues. Params SHALL be `n` (maximum face number, default 6) and
`diff` (Trivial / Basic / Hard / `Unreasonable` / Ambiguous), encoded `"{n}"` with
a full-form `"d{t|b|h|e|a}"` difficulty suffix; a legacy bare `"a"` suffix SHALL
decode to Ambiguous. The fourth tier is named `Unreasonable` rather than
upstream's `Extreme` because its forcing-chain deduction is a search over a
closure of all placements, and it is the last tier that is a difficulty —
`Ambiguous` follows it in the list but relaxes the puzzle's promise rather than
deepening its ladder. All 12 upstream presets SHALL be offered. `validateParams`
SHALL enforce `n ≥ 1`, a valid difficulty, and the upstream overflow bound. The
game SHALL report `canSolve = true`, `canFormatAsText = true` (for `n < 1000`),
and `needsRightButton = true` (upstream `REQUIRE_RBUTTON`).

#### Scenario: Params round-trip

- **WHEN** params `{ n: 6, diff: HARD }` are encoded in full
- **THEN** the result is `"6dh"` and decoding it round-trips the params

#### Scenario: The renamed tier keeps its difficulty character

- **WHEN** params at the fourth tier are encoded in full
- **THEN** the suffix is still `"de"`, so a game ID written before the rename
  names the same board

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is given `n = 0`
- **THEN** it returns a non-null error string

### Requirement: Dominosa ports the graded solver faithfully

The port SHALL implement upstream `run_solver` with its exact deductive power at
each difficulty, returning the impossible / unique / ambiguous (0 / 1 / 2)
verdict identical to the C solver on every board. Trivial SHALL perform the
domino-single-placement and square-single-placement deductions. Basic SHALL
additionally perform square-single-domino, domino-must-overlap, the two
local-duplicate deductions, and the parity deduction (a domino whose placement
would split the unfilled area into two odd-sized regions is ruled out, detected
by bridge-finding over the placement graph). Hard SHALL additionally perform set
analysis without doubles; `Unreasonable` SHALL additionally perform set analysis
with doubles and the forcing-chain deduction (parity-linked chains of forced
placements, using a flip DSF). The solver SHALL track the maximum difficulty
level actually used.

The forcing-chain deduction SHALL remain in the solver, so the generator grades
on it and every description is unchanged; it SHALL NOT be recorded by the hint's
deduction pass, because a closure over all placements is a search and no hint
narrates a search on any tier.

#### Scenario: A generated board is uniquely solvable at its difficulty

- **WHEN** a board generated at difficulty `d` is solved from empty
- **THEN** the solver returns unique (1) and reports `max_diff_used == d`, and —
  for a board above Trivial — fails to reach a unique solution (returns 2) when
  capped at the difficulty one level below `d`
