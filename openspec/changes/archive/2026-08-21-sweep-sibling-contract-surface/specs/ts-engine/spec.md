# ts-engine Specification Delta — sweep-sibling-contract-surface

## ADDED Requirements

### Requirement: The static-attributes relay carries no field the app does not read

Every field of `PuzzleStaticAttributes` SHALL be read by the app shell, and a
check SHALL assert it. A field with no app reader SHALL be removed, or recorded
with the change that owns the decision to give it one.

This is the sibling of the rule that the `Game` contract carries no capability
without a consumer, and it needs stating separately because the two contracts
fail independently: every field here is produced by `Midend.getStaticProperties`
and relayed under the same name into a `Puzzle` field, so the chain is easy to
extend and its far end is easy to forget. Two of the original nine fields turned
out to have no reader — `canConfigure`, which the midend answered with a literal
`true` while it gated the type menu's "Custom type…" entry, and `displayName`,
which `Puzzle` overrode from the catalog on every reachable path.

The check SHALL count only reads from outside the engine, because the two
contracts share field names: `canSolve` is also a `Game` member, so an engine
read of `game.canSolve` would otherwise vouch for an app field nothing touches.

#### Scenario: A relayed field the app never reads is reported

- **WHEN** a `PuzzleStaticAttributes` field has no app-shell reader
- **THEN** the check reports it by name, so the midend stops computing and
  shipping a value for nobody

#### Scenario: The check states how much it inspected

- **WHEN** the check runs
- **THEN** it asserts the number of fields it examined and the number of
  app-shell modules it scanned, so a sweep that silently matched nothing cannot
  report success
