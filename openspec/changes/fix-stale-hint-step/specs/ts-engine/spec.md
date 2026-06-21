# ts-engine spec delta

## ADDED Requirements

### Requirement: A displayed hint step never references already-resolved state

The `Midend` SHALL guarantee that whenever a hint step is on display, every
element the step asks the player to act on is still actionable in the current
state — in particular, a candidate-elimination step SHALL NOT name a candidate
that has already been removed from its cell. A stored plan that is kept across a
player's exact-follow moves (the `hintKeepTrack` `"completed"`/`"onTrack"`
path) SHALL be re-validated against the current state before (re-)display, so a
move's side effects (e.g. auto-pencil eliminations) can never leave a later
displayed step referring to a candidate the player has already cleared.

This preserves the existing semantics that an exact-follow move keeps the plan
and a conflicting move (`"off"`) drops it; it only adds the freshness guarantee
on top.

#### Scenario: A kept plan never shows an already-removed candidate

- **WHEN** a hint plan is kept across the player's exact-follow moves, and one
  of those moves (or its auto-pencil side effects) removes a candidate that a
  later stored step would have struck
- **THEN** that later step is not displayed as striking the already-removed
  candidate — the midend drops the dead mark (advancing or recomputing the plan
  as needed) so every displayed elimination is still live

#### Scenario: Exact-follow still keeps the plan; a conflict still regenerates

- **WHEN** the player makes a move that exactly follows the displayed hint
- **THEN** the plan is kept (advanced), not dropped
- **AND WHEN** the player instead makes a conflicting move
- **THEN** the plan is dropped and the next hint recomputes from the new state
