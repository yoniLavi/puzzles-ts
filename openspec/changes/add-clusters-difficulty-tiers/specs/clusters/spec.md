# clusters Specification Delta — add-clusters-difficulty-tiers

## ADDED Requirements

### Requirement: Clusters offers difficulty tiers over its two deduction levels

Clusters SHALL offer a difficulty parameter with at least two tiers, corresponding
to the two deduction levels its solver already implements: the single-cell proof
by contradiction, and the same reasoning applied one hypothetical level deep.

A board generated at the harder tier SHALL require that second level — it SHALL
NOT be soluble by the single-cell reasoning alone. A board generated at the easier
tier SHALL be soluble by it.

The difficulty SHALL be encoded in the game ID, and an ID that carries no
difficulty SHALL decode to the tier that reproduces the behaviour Clusters shipped
before this parameter existed, so that previously shared links continue to resolve
to an equivalent board.

#### Scenario: The harder tier needs the deeper reasoning

- **WHEN** a board generated at the harder tier is solved using only the
  single-cell contradiction rule
- **THEN** the solver does not reach a solution

#### Scenario: An older game ID still resolves

- **WHEN** a game ID generated before the difficulty parameter existed is opened
- **THEN** it loads and is playable
