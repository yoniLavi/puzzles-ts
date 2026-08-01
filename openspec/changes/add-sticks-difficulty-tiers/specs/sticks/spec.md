# sticks Specification Delta — add-sticks-difficulty-tiers

## ADDED Requirements

### Requirement: Sticks offers difficulty tiers backed by real deductions

Sticks SHALL offer a difficulty parameter of at least two tiers, each backed by a
distinct deductive technique rather than by a search depth or a time budget. Its
solver ships one technique — tentative placement refuted by contradiction — so at
least one further named technique SHALL be established before the parameter is
offered.

A board generated at a tier above the easiest SHALL NOT be soluble at the tier
below it. If no second technique is found that both decides boards the first
cannot and can be stated to a player, the parameter SHALL NOT be offered, and the
finding SHALL be recorded rather than a tier shipped that the generator can seldom
fill.

Because solver strength decides which boards the generator produces, the
description no longer matches the C reference byte for byte; assurance SHALL rest
on every generated board being uniquely solvable at exactly its stated tier.

#### Scenario: A harder board needs the harder technique

- **WHEN** a board generated above the easiest tier is solved with only the
  easier tier's techniques
- **THEN** the solver does not reach a solution

#### Scenario: No rung is found

- **WHEN** no second technique is established that decides boards the first cannot
- **THEN** no difficulty parameter is offered, and the reason is recorded
