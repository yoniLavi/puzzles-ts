# ts-engine Specification

## ADDED Requirements

### Requirement: The engine serialises Ui state a move-log replay cannot reconstruct

The engine SHALL support optional `encodeUi(ui): string` / `decodeUi(ui, encoded): void`
`Game` hooks (upstream `encode_ui`/`decode_ui`). The midend SHALL write `encodeUi(ui)` into
the save envelope's `ui` field when the hook is present, and — after rebuilding state 0 and
replaying the move log on load — SHALL restore it via `decodeUi`. A game without the hooks
SHALL save no `ui` field, and its `Ui` SHALL be reconstructed from `newUi` plus the replay
alone (every game before Mines).

This exists because a `Ui` field that lives **outside** the undo history and is set by
`interpretMove` cannot be recovered by replaying the move log: replay goes through
`executeMove`, never `interpretMove`. Mines' persistent death counter is exactly such a
field — dying and then undoing removes the death from the move log — so without ui
serialisation the count would reset on every save/restore.

#### Scenario: A persistent Ui counter survives a save

- **WHEN** a game with `encodeUi`/`decodeUi` accumulates ui-only state (Mines' death count),
  is saved, and reloaded
- **THEN** the reloaded game shows the same ui-only state, even though the move log alone does
  not contain it

### Requirement: The midend displays a timed game's elapsed clock in the status bar

For a game with `isTimed = true` and `wantsStatusbar = true`, the midend SHALL prefix the
game's status-bar text with the elapsed time as `[M:SS] ` (upstream
`midend_rewrite_statusbar`). The prefix is the midend's responsibility, not the game's —
`statusbarText` returns only the game-specific text. A non-timed game's status bar SHALL be
unaffected.

#### Scenario: A timed game shows the clock

- **WHEN** a timed game's status bar is emitted with 75 seconds elapsed
- **THEN** the status-bar text begins with `[1:15] `, followed by the game's own status text
