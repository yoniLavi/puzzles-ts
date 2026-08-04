# bricks Specification Delta — grade-difficulty-tiers-honestly

## ADDED Requirements

### Requirement: Bricks offers only difficulties that exist

Bricks SHALL offer Easy and Normal, and SHALL refuse to *generate* a board at
Tricky; `validateParams` SHALL reject that combination when asked for a full
(generation-capable) parameter set, while continuing to accept it otherwise so a
saved game or a game ID carrying its own description still loads.

Bricks' tiers are lookahead depth — Easy assumes nothing, Normal assumes a cell
and looks for an Easy-level contradiction, Tricky lets that sub-solve recurse in
turn — and depth 2 decides nothing depth 1 has not already decided. Upstream
conceded the symptom in its own documentation ("selecting Tricky difficulty may
generate a puzzle at Normal difficulty instead") and this port preserved it as an
intended quirk; measurement retired the quirk, because *may* is always. The
`DIFF_TRICKY` rung SHALL remain available to the **solver**, where hints, Solve
and mistake-checking use it as "try as hard as you can" at no cost.

#### Scenario: Tricky is not generated

- **WHEN** a full parameter set requesting Tricky is validated
- **THEN** it is rejected with a message naming the difficulty
- **AND** the same parameters validate successfully when a description is
  supplied rather than generated

#### Scenario: The generator refuses rather than exhausts its retries

- **WHEN** the generator is called at Tricky anyway
- **THEN** it fails immediately, rather than rejecting candidates until its retry
  budget is spent

### Requirement: Bricks grades the tiers it does offer

A Bricks board generated at a difficulty above the easiest SHALL NOT be soluble at
the tier below it. The acceptance gate SHALL probe the tier immediately below the
one requested; upstream probes at Easy whatever tier was requested, which is
correct for Normal only by coincidence.

Because generation is solver-gated at every clue removal, the byte-for-byte
differential SHALL retain a way to run upstream's original gate, used by that
differential alone.

#### Scenario: A Normal board genuinely needs the Normal tier

- **WHEN** a board generated at Normal is solved at Easy
- **THEN** the solver does not reach a solution
- **AND** solving the same board at Normal does
