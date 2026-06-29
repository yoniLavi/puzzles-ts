# towers Specification (delta)

## MODIFIED Requirements

### Requirement: Towers auto-pencils row/column eliminations on placement

The game SHALL provide an **auto-pencil** preference, **off by default**: when it is
on and the player places a tower height, the game SHALL strike that height from the
pencil marks of every other cell in the same row and column. The decision SHALL be
fixed at move-creation time (recorded on the move) so that replaying a saved game is
deterministic regardless of the preference's later value. When the preference is off
(the default), a placement SHALL leave other cells' pencil marks untouched (upstream
behaviour) and note cleanup is manual — the player removes obvious candidates via the
mark-all control or a hint. The preference SHALL also govern the hint: with it on, the
hint folds the implied row/column eliminations into the placement; with it off, the
hint teaches them as explicit strikes.

#### Scenario: Placing a tower clears matching notes in its line

- **WHEN** auto-pencil is on and the player places height `n` in a cell
- **THEN** every other empty cell in that cell's row and column loses candidate `n`
  from its pencil marks
- **AND** cells sharing neither the row nor the column keep candidate `n`

#### Scenario: Auto-pencil off leaves notes untouched

- **WHEN** auto-pencil is off and the player places a height
- **THEN** no other cell's pencil marks change
