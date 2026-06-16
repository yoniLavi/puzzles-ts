## ADDED Requirements

### Requirement: Hint explanation surfaces independent of the status bar

The active hint step's explanation SHALL be surfaced to the UI (the hint
banner) whenever a hint is displayed, **regardless of whether the game
requests a status bar** (`wantsStatusbar`). The explanation rides on the
`status-bar-change` notification together with the status-bar text; the
`Midend` SHALL emit that notification for a game that has either a status bar
or a `hint` capability, so a hint-carrying game with no status bar (e.g.
Range) still shows and clears the banner. The status-bar DOM remains gated on
`wantsStatusbar` independently, so the empty status-bar text emitted for a
no-status-bar game is inert.

#### Scenario: A no-status-bar game shows and clears the hint banner

- **WHEN** a game with `wantsStatusbar = false` and a `hint` method is sent a
  hint request, and then the player makes a move
- **THEN** the midend emits the hint explanation while the hint is displayed
- **AND** the explanation is cleared (emitted empty) once a move hides the hint
