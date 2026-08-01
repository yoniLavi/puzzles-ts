# ts-migration — delta

## MODIFIED Requirements

### Requirement: A difficulty-capped solver is monotone in its cap

A solver that accepts a difficulty cap SHALL be monotone in it: a board solvable
with the ladder capped at difficulty `d` SHALL be solvable at every cap above
`d`. This SHALL be asserted for **every** game declaring a difficulty contract,
by a single cross-game guard, rather than per game by hand.

Non-monotonicity is not theoretical. Boats shipped with a solver that solved
boards at a *lower* cap which it failed at a higher one — its second-tier
disjoint-set check can report a contradiction a board does not have — and that
silently broke Check & Save on Easy boards, because "solvable at Easy" and
"solvable at Tricky" were both true statements about different code paths and
nothing compared them.

A game whose solver is genuinely non-monotone SHALL declare itself so in its
difficulty contract. The guard then asserts the **workaround** that game's spec
promises — that solving at each tier in turn and taking the first success always
succeeds — rather than skipping the game. A skipped game is an untested game
wearing a comment, and the exemption must itself be under test so that fixing the
underlying defect is visible.

The same cross-game guard SHALL also assert that every declared tier is
reachable (generation at it succeeds) and that a game's declared tier list
matches its own difficulty constants, so a game that gains a tier cannot ship a
stale declaration.

This property is part of what replaces the retired byte-match oracle: it is a
statement about what a difficulty tier *means* that the byte-match never checked.

#### Scenario: A capped run succeeds where an uncapped run fails

- **WHEN** a game's solver solves a board with its ladder capped at the easiest
  tier but fails the same board with the ladder uncapped
- **THEN** the cross-game monotonicity guard fails, naming the game and seed
- **AND** the solver is fixed, or the non-monotonicity is declared in the game's
  difficulty contract together with the workaround its consumers must apply

#### Scenario: A game declares itself non-monotone

- **WHEN** a game's contract declares `nonMonotone`
- **THEN** the guard asserts that solving at each tier in turn and taking the
  first success always succeeds
- **AND** the game is never silently skipped

#### Scenario: A solver is converted to the shared deduction runner

- **WHEN** a game's hand-rolled deduction ladder is moved onto the shared runner
- **THEN** its differential fixture passes unmodified, because a solver reaching
  the same verdicts generates the same boards
- **AND** the cross-game monotonicity guard already covers it, with no bespoke
  per-game test to add or later delete
