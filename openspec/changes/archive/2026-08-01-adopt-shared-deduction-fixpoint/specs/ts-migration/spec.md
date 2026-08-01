# ts-migration — delta

## ADDED Requirements

### Requirement: A shared abstraction states its actual scope, not an aspirational one

A shared module's documentation SHALL describe the scope it actually has. A
module that documents itself as universal while fitting a minority of its
candidates SHALL be corrected, and its known non-fits SHALL be named in the
module itself with the reason each does not fit.

This is not a documentation nicety. `engine/deduction-fixpoint.ts` described
itself as *"the one ordered-rung loop every logic game's solver/hint hand-rolled
before this"* while fitting five call sites out of forty-odd solvers. The
overclaim converts the question "does this game fit?" into "why has this game not
been adopted yet?", and it produced **two separate handoffs asserting that Loopy
fits when it does not** — Loopy's `(thresholdDiff, thresholdIndex)` bookkeeping
decides which puzzles exist.

An abstraction's stated scope is part of its API. Fitting a minority of callers
is not a defect; claiming otherwise is.

#### Scenario: A game is considered for a shared abstraction

- **WHEN** a contributor evaluates whether a game's solver fits the shared
  deduction runner
- **THEN** the module names the known non-fits and why, so the evaluation starts
  from evidence rather than from an implied obligation
- **AND** a solver whose loop merely *resembles* the shared one is not treated as
  fitting until its differential says so

#### Scenario: An audit finds the majority do not fit

- **WHEN** an audit of candidates for a shared abstraction finds most do not fit
- **THEN** the correct outcome is a short adoption list, a recorded no-go list,
  and a corrected module header — not a widened abstraction
- **AND** candidates that were not individually examined are recorded as
  **unaudited**, never counted as no-gos

### Requirement: A difficulty-capped solver is monotone in its cap

A solver that accepts a difficulty cap SHALL be monotone in it: a board solvable
with the ladder capped at difficulty `d` SHALL be solvable at every cap above
`d`. A game whose solver is converted, or whose difficulty tiers are added or
changed, SHALL ship a property test asserting this.

Non-monotonicity is not theoretical. Boats shipped with a solver that solved
boards at a *lower* cap which it failed at a higher one — its second-tier
disjoint-set check can report a contradiction a board does not have — and that
silently broke Check & Save on Easy boards, because "solvable at Easy" and
"solvable at Tricky" were both true statements about different code paths and
nothing compared them.

Where a game's solver is genuinely non-monotone, that SHALL be recorded as a
property of the game together with the workaround every consumer must apply
(Boats: solve at each tier and take the first that succeeds), rather than left
for a caller to rediscover.

This property is also part of what replaces the retired byte-match oracle: it is
a statement about what a difficulty tier *means* that the byte-match never
checked.

#### Scenario: A capped run succeeds where an uncapped run fails

- **WHEN** a game's solver solves a board with its ladder capped at the easiest
  tier but fails the same board with the ladder uncapped
- **THEN** the monotonicity property test fails
- **AND** the solver is fixed, or the non-monotonicity is recorded as a property
  of that game with the workaround its consumers must apply

#### Scenario: A solver is converted to the shared runner

- **WHEN** a game's hand-rolled deduction ladder is moved onto the shared runner
- **THEN** its differential fixture passes unmodified, because a solver reaching
  the same verdicts generates the same boards
- **AND** it gains a cap-monotonicity property test
- **AND** if the fixture moves, the change stops to determine whether the
  adoption or the original hand-rolled loop was wrong, rather than re-recording
