# ts-engine Specification

## ADDED Requirements

### Requirement: Sliding-permutation games share one slide planner

The engine SHALL provide a shared toroidal slide planner
(`src/native/engine/slide-planner.ts`) that every sliding-permutation game's
`hint` uses, rather than each game carrying its own copy of the search.

The planner SHALL own the parts that are hard and game-independent: a heuristic
forward search over slide moves; an exact bidirectional search that returns a
**shortest** path; a **no-progress gate** so the exact search is not spent on
boards the heuristic can already move; and a **partial-plan** result when the
search improves on the starting board without reaching the goal (the plan runs
out, the player is closer, and the next request recomputes).

The planner SHALL work on **the board as the player sees it** — one integer per
cell, whose meaning is the game's — and SHALL NOT distinguish two boards that
look alike. A game whose pieces are not all distinct (Netslide's wire masks)
otherwise has the planner chasing arrangements no sequence of slides can produce:
on an odd-width torus every slide is an even permutation, so a target that
distinguishes identical pieces may sit in an unreachable coset while the finished
picture is a move away.

The planner SHALL be parameterised on what genuinely differs between games — the
grid, the legal move set (including whether a slide may cover more than one
step), the finished board, the goal test, and **how far from finished a board
is** — and SHALL contain no game-specific narration or rendering.

A game SHALL choose when the exact search runs: as a **last resort** when the
heuristic search is at a strict local minimum, or **first**, before the heuristic
runs at all. The second exists because a shortest plan is what makes a recomputed
plan converge — its first move provably shortens the distance to the goal — and
SHALL be available for that purpose.

Sixteen SHALL be refactored onto the planner with **no change in behaviour**, and
the refactor SHALL be guarded by Sixteen's existing hint tests and the diagnostic
that asserts the no-progress gate still gates.

#### Scenario: A second sliding game reuses the planner

- **WHEN** a sliding-permutation game other than Sixteen implements `hint`
- **THEN** it supplies its own legal moves, distance measure, goal test and
  narration, and reuses the shared search rather than re-implementing it

#### Scenario: The expensive search stays gated

- **WHEN** a game asks for the exact search only as a last resort, and the
  forward search makes progress on a board
- **THEN** the exact search is not engaged

#### Scenario: A search that cannot reach the goal still helps

- **WHEN** the forward search improves on the starting board but exhausts its
  budget before reaching the goal
- **THEN** the planner returns the partial plan to its best board, rather than
  failing

#### Scenario: The exact search returns a shortest plan

- **WHEN** the exact search reaches the goal
- **THEN** the plan it returns is a shortest sequence of moves to it, so that
  playing its first move leaves the board strictly nearer the goal
