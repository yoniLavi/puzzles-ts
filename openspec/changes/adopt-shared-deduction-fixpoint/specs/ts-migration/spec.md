# ts-migration — delta

## ADDED Requirements

### Requirement: A logic game adopts the shared deduction-fixpoint runner or records why it cannot

A logic game whose solver is an ordered ladder of deduction techniques SHALL run
that ladder through the shared runner (`engine/deduction-fixpoint.ts`) rather
than hand-rolling the loop. The runner owns the loop, the difficulty cap, the
recorder-gated step budget and the grade bookkeeping; **the techniques stay
per-game** and SHALL NOT be contorted to resemble another game's.

A game that does not fit SHALL have its rejection recorded with the reason,
in the change that examined it. Loopy is the established no-go — its
`(thresholdDiff, thresholdIndex)` bookkeeping is not the runner's grade
bookkeeping and decides which puzzles exist — and it was asserted to fit by two
separate handoffs before anyone checked. A solver's loop resembling the shared
one is not evidence that it is the shared one.

The shared runner's module documentation SHALL describe its actual adoption
accurately. A module that documents itself as the loop *every* logic game
hand-rolled, while fitting a minority of them, misleads the next reader in the
direction that already caused two wrong handoffs.

#### Scenario: A solver is converted to the shared runner

- **WHEN** a logic game's hand-rolled deduction ladder is moved onto the shared
  runner
- **THEN** its differential fixture passes unmodified, because a solver reaching
  the same verdicts generates the same boards
- **AND** if the fixture moves, the change stops to determine whether the
  adoption or the original hand-rolled loop was wrong — and does not re-record
  the fixture to match

#### Scenario: A game's ladder does not fit

- **WHEN** a solver's cap or grade bookkeeping is entangled with generation in a
  way the shared runner does not express
- **THEN** the game keeps its own loop
- **AND** the reason is written down, so a later handoff cannot re-assert that it
  fits

### Requirement: A difficulty-capped solver is monotone in its cap

A solver that accepts a difficulty cap SHALL be monotone in it: a board solvable
with the ladder capped at difficulty `d` SHALL be solvable at every cap above
`d`. Each such game SHALL carry a property test asserting this.

Non-monotonicity is not a theoretical concern. Boats shipped with a solver that
solved boards at a *lower* cap which it failed at a higher one, which silently
broke Check & Save on Easy boards — because "solvable at Easy" and "solvable at
Hard" were both true statements about different code paths, and no test compared
them.

This property is also part of what replaces the retired byte-match oracle: it is
a statement about what a difficulty tier means that the byte-match never checked.

#### Scenario: A capped run succeeds where an uncapped run fails

- **WHEN** a game's solver solves a board with its ladder capped at Easy but
  fails the same board with the ladder uncapped
- **THEN** the monotonicity property test fails
- **AND** the solver is fixed, because a difficulty cap that changes the verdict
  in that direction makes every consumer of the verdict — generation, grading,
  and mistake-checking — unreliable

#### Scenario: A new tiered game ships the property

- **WHEN** a game with difficulty tiers is added or its tiers are changed
- **THEN** it ships the cap-monotonicity property test alongside its differential
