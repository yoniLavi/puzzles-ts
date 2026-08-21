# ts-engine Specification Delta — audit-vestigial-contract-surface

## ADDED Requirements

### Requirement: The Game contract carries no capability without a consumer

Every optional member of the `Game` interface SHALL have at least one game
implementing it and at least one consumer reading it, and the two SHALL be
checked separately, because they fail differently: no implementer means dead
weight in the interface, while no consumer means every implementer wrote code
that never runs.

A capability with no consumer is worse than absent: game code written against
the documented contract reads as protection while doing nothing, and the gap is
invisible until the day the capability is first genuinely needed.
`validateParams`'s `full` flag was passed a literal `true` by all four
production call sites while sixteen games gated a bound on it, three of them
with comments describing the behaviour that was not happening — and it silently
refused game IDs a game had deliberately kept loadable.

A member whose only consumer is a cross-game guard is permitted, since such a
guard is a real reader — `Game.difficulty` exists precisely so a property about
difficulty tiers can be asserted for every tiered game at once — but SHALL be
recorded as such with its argument. A member with **no** consumer SHALL be
recorded with the change that owns the decision to wire it up or remove it; an
entry with no owning change is the accumulation this requirement exists to
prevent.

Consumers SHALL be derived from the source's syntax tree rather than by matching
text, because a comment is not a consumer: `needsRightButton`'s only mention
outside the games is a commented-out line proposing to read it. A value copied
into a field of the same name SHALL NOT count as a consumer, since relaying is
not reading.

#### Scenario: An optional hook nothing invokes is reported

- **WHEN** a member of the `Game` interface is implemented by one or more games
  but read by no engine or app-shell call site
- **THEN** the check reports it, naming the number of implementers whose code
  cannot run

#### Scenario: An optional hook no game implements is reported

- **WHEN** an optional member of the `Game` interface has no implementer
- **THEN** the check reports it as surface to remove

#### Scenario: A recorded exception that has stopped being true is reported

- **WHEN** a member recorded as having no consumer acquires one
- **THEN** the check fails, so the record is corrected rather than left
  describing a finding that no longer exists

#### Scenario: The check states how much it inspected

- **WHEN** the check runs
- **THEN** it asserts the number of interface members it examined, the number of
  modules it scanned for consumers, and the size of the registry it read
  implementers from, so a sweep that silently matched nothing cannot report
  success

### Requirement: A game is handed a draw state, never the absence of one

`Game.newDrawState` and `Game.redraw` SHALL be required members, and the draw
state passed to `Game.redraw` and `Game.interpretMove` SHALL be non-null and
SHALL already have the current tile size applied.

The midend SHALL create the draw state and apply `setTileSize` in a single
operation, so that no caller can produce a drawstate whose tile size is still at
its initial value, and SHALL decline to redraw or to interpret input when no
game has been set up.

This exists because the alternative was measured: while `newDrawState` was
optional, fifty-five games opened `redraw` with a guard against a null the
engine could not produce, and fifty-seven mapped pointer coordinates through a
`ds?.tilesize ?? PREFERRED_TILE_SIZE` fallback — not inert, but a silent wrong
answer waiting for a null that would have sent every click to the wrong cell.

#### Scenario: A game reads the tile size it is actually drawn at

- **WHEN** a game's `interpretMove` maps a pointer coordinate to a cell
- **THEN** it reads the tile size from the draw state it was passed, with no
  fallback, because the midend guarantees that value is set

#### Scenario: No board, no paint

- **WHEN** `redraw` or `processInput` is called before a game has been set up
- **THEN** the midend returns without calling into the game

### Requirement: No game ships an empty custom-params dialog

The app offers "Custom type…" for every game, so every registered game SHALL
declare a non-empty `paramConfig`, and a check SHALL assert it across the
registry.

Sokoban shipped without one from its port until this was asserted, so choosing
"Custom type…" opened a dialog with no fields in it. Two silent skips hid it: the
sweep over `paramConfig` began by skipping any game that had none, and the menu
entry was gated on a `canConfigure` flag the midend answered `true`
unconditionally. A genuinely preset-only game is a decision about what its menu
should say, to be taken deliberately rather than by omission.

#### Scenario: A game with no custom-params form is reported

- **WHEN** a registered game declares no `paramConfig`, or an empty one
- **THEN** the check reports it by name, rather than skipping it
