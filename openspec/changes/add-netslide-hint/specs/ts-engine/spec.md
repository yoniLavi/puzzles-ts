# ts-engine Specification

## ADDED Requirements

### Requirement: Sliding-permutation games share one slide planner

The engine SHALL provide a shared toroidal slide planner
(`src/native/engine/slide-planner.ts`) that every sliding-permutation game's
`hint` uses, rather than each game carrying its own copy of the search.

The planner SHALL own the parts that are hard and game-independent: a
heuristic forward search over slide moves; a **no-progress gate** that engages
the expensive exact search only when the forward search is at a strict local
minimum; an exact bidirectional search as the fallback for the local-minimum
endgames a heuristic cannot see past; and a **partial-plan** result when the
search improves on the starting board without reaching the goal (the plan runs
out, the player is closer, and the next request recomputes).

The planner SHALL be parameterised on what genuinely differs between games — the
grid, which lines may be slid, the legal move set (including whether a slide may
cover more than one step), each piece's home cell, the goal test, and the
heuristic's scaling — and SHALL contain no game-specific narration or rendering.

Sixteen SHALL be refactored onto it with **no change in behaviour**, and the
refactor SHALL be guarded by Sixteen's existing hint tests and the diagnostic
that asserts the no-progress gate still gates.

#### Scenario: A second sliding game reuses the planner

- **WHEN** a sliding-permutation game other than Sixteen implements `hint`
- **THEN** it supplies its own legal moves, home assignment, goal test and
  narration, and reuses the shared search rather than re-implementing it

#### Scenario: The expensive search stays gated

- **WHEN** the forward search makes progress on a board
- **THEN** the exact fallback search is not engaged

#### Scenario: A search that cannot reach the goal still helps

- **WHEN** the forward search improves on the starting board but exhausts its
  budget before reaching the goal
- **THEN** the planner returns the partial plan to its best board, rather than
  failing
