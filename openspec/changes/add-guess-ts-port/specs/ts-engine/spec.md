## ADDED Requirements

### Requirement: The midend reconciles persisted Ui across state transitions

The `Game` interface SHALL provide an optional
`changedState(ui, oldState, newState)` hook — the idiomatic rendering of
upstream's `game_changed_state` — by which a game derives any persisted Ui that
tracks the current state (e.g. a working-input row reconstructed from the latest
move). The midend SHALL invoke it, mutating the live `ui` in place, after every
**real** state transition it processes — a move, undo, redo, solve, and restart —
and once at new-game setup with `oldState = null`, and SHALL invoke it **before**
computing animation/flash durations and before the post-transition repaint so the
reconciled Ui is what the frame and the next input see. The midend SHALL NOT
invoke it on a bare `UI_UPDATE` (no state changed; the user is mid-edit). A game
that omits the hook SHALL behave exactly as before (the midend treats the absent
hook as a no-op).

#### Scenario: The hook fires on a move and reconciles the Ui

- **WHEN** the midend applies a move that produces a new state
- **THEN** it calls `changedState(ui, prevState, newState)` before the repaint,
  and the mutated `ui` is the one passed to `redraw`

#### Scenario: The hook fires on undo and redo

- **WHEN** the midend processes an undo or a redo
- **THEN** it calls `changedState(ui, prevState, restoredState)` so a Ui that
  tracks state is reconstructed for the restored position

#### Scenario: The hook does not fire on a UI-only update

- **WHEN** `interpretMove` returns `UI_UPDATE`
- **THEN** the midend repaints without calling `changedState` (the persisted Ui
  is left exactly as `interpretMove` mutated it)
