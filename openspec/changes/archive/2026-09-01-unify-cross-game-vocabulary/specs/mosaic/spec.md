# mosaic Specification Delta — unify-cross-game-vocabulary

## MODIFIED Requirements

### Requirement: Mosaic solves and checks mistakes against the deduced solution

The Solve command SHALL run the deductive solver on the clue board and apply
the full solution (cells flagged solved, `cheated` set, status bar reading
`Auto solved`), failing with an error when deduction cannot complete the
board. `findMistakes` SHALL return every cell the player has determined
whose mark contradicts the deduced solution, rendered as an error-coloured
outline overlay, and SHALL return no mistakes when deduction stalls or the
marks are consistent.

Mosaic keeps its own `flashLength` rather than the shared `winFlash`, and the
reason is a real one rather than a spelling: its completion is
`notCompletedClues === 0`, a counter it maintains for its own rendering, not a
separate flag.

#### Scenario: Solve completes the board

- **WHEN** the Solve command runs on a generated board
- **THEN** every cell is determined, `status` returns `"solved"`, and the
  status bar reads `Auto solved`

#### Scenario: findMistakes flags a wrong mark

- **WHEN** the player marks black a cell that is white in the solution and
  Check & Save runs
- **THEN** `findMistakes` returns that cell
- **AND** a correctly-marked board returns no mistakes
