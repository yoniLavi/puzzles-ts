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

The re-validation SHALL use an optional `Game.refreshHintStep(step, state)`
hook: given a stored step and the current state, the game returns the step with
no-longer-actionable parts dropped (rebuilding its highlights to match, or the
same reference when nothing changed), or `null` when the step is now fully
resolved. The `Midend` SHALL call this before (re-)displaying the plan's current
step — on `midend.hint()` re-show, after a kept manual move advances or shrinks
the plan, and after an executed-hint step settles — advancing past any step the
hook reports fully resolved and recomputing a fresh plan if the whole stored
plan drains. A game that does not implement the hook has its stored steps shown
as-is (correct for games whose move types cannot be partially resolved by a
sibling move's side effects).

This preserves the existing semantics that an exact-follow move keeps the plan
and a conflicting move (`"off"`) drops it; it only adds the freshness guarantee
on top.

The `Midend` SHALL classify a player move with `hintKeepTrack(move, step,
state)` against the **pre-move** state (the state the move is about to be
applied to), so a game MAY itself apply the move to reason about its result
(e.g. a slide puzzle computing the landing cell), and a game classifying a
candidate toggle SHALL test liveness against that pre-move state (a toggle
*clears* a candidate iff it is present before the move; toggling an absent
candidate re-adds it and is off-plan).

#### Scenario: A displayed step is re-validated before showing

- **WHEN** the midend is about to (re-)display the current step of a stored plan
- **THEN** it calls the game's `refreshHintStep` (when provided) and shows the
  refreshed step, advancing past any step reported fully resolved and
  recomputing a fresh plan if every stored step has been resolved

### Requirement: Requesting a hint never mutates the board

Computing or (re-)displaying a hint SHALL NOT change the game state. A hint
*displays* a plan (via highlights the game's `redraw` paints); the player applies
a step only by following it or by an explicit apply action. `Game.hint` SHALL be
pure on its `state` argument, and the act of showing a hint SHALL leave every
board value — including pencil notes — untouched. A displayed highlight that
acts on a board element (e.g. a struck candidate) SHALL be drawn legibly against
its cell, never in the same colour as the cell's own background fill, so the
element it references remains visible rather than appearing already-resolved.

#### Scenario: Showing a hint leaves the board unchanged

- **WHEN** the player requests a hint (the show, not an apply)
- **THEN** the game state is byte-for-byte unchanged — only highlighting is added
- **AND** a struck/acted-on candidate remains visible (its highlight contrasts
  with the cell background), not hidden behind a same-colour fill

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
