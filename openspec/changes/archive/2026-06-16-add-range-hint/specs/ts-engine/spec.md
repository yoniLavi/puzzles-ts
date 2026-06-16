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

### Requirement: A refused hint surfaces the board's mistakes

The `Midend` SHALL invoke `findMistakes()` whenever a hint is refused (the
game's `hint()` returns an unsuccessful result), so the offending cells are
surfaced in the same overlay Check & Save uses. A hint is typically refused
precisely because the board has mistakes ("fix the highlighted mistakes
first"), and the refusal message alone highlights nothing; routing the refusal
through `findMistakes()` makes that promise literally true. A refusal with no
mistakes (already solved, nothing deducible) finds zero and highlights nothing;
a game without a `findMistakes` hook is unaffected. This applies to every
refusal path — the manual Hint request and Auto-Hint both flow through the
single plan-computation chokepoint.

#### Scenario: Asking for a hint on a board with a mistake highlights it

- **WHEN** the board has a mistake and the game's `hint()` refuses
- **THEN** the midend computes and displays the mistake overlay (the same one
  Check & Save populates) so the offending cells render in the mistake colour
- **AND** the refusal message is still returned to the caller

#### Scenario: A refusal unrelated to mistakes highlights nothing

- **WHEN** a hint is refused on a board with no mistakes (e.g. already solved)
- **THEN** the mistake overlay stays empty and no cell is highlighted
