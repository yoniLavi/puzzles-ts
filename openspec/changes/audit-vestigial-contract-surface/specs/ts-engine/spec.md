# ts-engine Specification Delta — audit-vestigial-contract-surface

## ADDED Requirements

### Requirement: The Game contract carries no capability without a consumer

Every optional member of the `Game` interface SHALL have at least one game
implementing it and at least one engine call site invoking it. Every parameter
on an engine-facing contract SHALL be passed more than one distinct value across
its production call sites, or SHALL be removed.

A capability with no consumer is worse than absent: game code written against
the documented contract reads as protection while doing nothing, and the gap is
invisible until the day the capability is first genuinely needed.
`validateParams`'s `full` flag was passed a literal `true` by all four
production call sites while sixteen games gated a bound on it, three of them
with comments describing the behaviour that was not happening — and it silently
refused game IDs a game had deliberately kept loadable.

The two counts SHALL be checked separately, because they fail differently: no
implementer means dead weight in the interface, while no caller means every
implementer wrote code that never runs.

#### Scenario: An optional hook nothing invokes is reported

- **WHEN** a member of the `Game` interface is implemented by one or more games
  but invoked from no engine call site
- **THEN** the check reports it, naming the implementers whose code cannot run

#### Scenario: An optional hook no game implements is reported

- **WHEN** an optional member of the `Game` interface has no implementer
- **THEN** the check reports it as surface to remove

#### Scenario: The check states how much it inspected

- **WHEN** the check runs
- **THEN** it asserts the number of interface members it examined, so a sweep
  that silently matched nothing cannot report success
