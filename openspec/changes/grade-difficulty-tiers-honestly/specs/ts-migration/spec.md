# ts-migration Specification Delta — grade-difficulty-tiers-honestly

## ADDED Requirements

### Requirement: A difficulty tier binds the board it generates

A game offering more than one difficulty SHALL NOT generate, at any tier above
the easiest, a board that its own solver can complete at the tier below. The
acceptance gate SHALL therefore test both directions — solvable at the requested
tier, and not solvable one tier down — rather than only the first.

Upstream generators commonly test only the upper bound, so a port that reproduces
one faithfully inherits a setting that does not bind. That is a player-visible
defect rather than a difficulty curve: the player chose the tier.

Where correcting the gate changes which boards a game generates, the game's
byte-match differential SHOULD be preserved by keeping the original acceptance
check reachable from the differential alone. Where that is not possible, the
differential SHALL be re-founded on the property that every generated board is
uniquely solvable at exactly its stated difficulty, and the loss recorded.

The cost of the extra solver run and of the rejections it causes SHALL be
measured by the worst case over repeated seeds, not the median.

#### Scenario: A board generated above the easiest tier needs that tier

- **WHEN** a board generated at a tier above the easiest is solved at the tier
  below it
- **THEN** the solver does not reach a solution
- **AND** solving it at its own tier does

#### Scenario: A game that cannot grade says so

- **WHEN** a game's tiers are not a strict hierarchy of deductions, so "solvable
  one tier down" is not a meaningful test
- **THEN** that is recorded in the game's specification with its reason, rather
  than left as an unbinding setting
