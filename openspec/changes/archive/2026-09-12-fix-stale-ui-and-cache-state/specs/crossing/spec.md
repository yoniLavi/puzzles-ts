## ADDED Requirements

### Requirement: Crossing's clue panel repaints when the held clue changes
Crossing SHALL treat the held clue as an input to its clue-panel cache, so that
picking a clue up marks it on the next frame and putting it back unmarks it,
whether or not the draw state has painted before.

#### Scenario: picking a clue up on a draw state that has already painted

- **GIVEN** a board whose draw state has painted one frame with nothing held
- **WHEN** the player picks up a clue and the game redraws on that same draw
  state
- **THEN** the panel marks that clue as held
- **AND** putting the clue back removes the mark on the following frame
