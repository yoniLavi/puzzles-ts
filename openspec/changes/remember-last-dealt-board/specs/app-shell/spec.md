# app-shell Specification Delta — remember-last-dealt-board

## ADDED Requirements

### Requirement: A puzzle page reopens on the board it was last showing

Opening a puzzle SHALL show the board that puzzle last dealt, rather than
generating a new one, whenever nothing more specific applies. The order of
preference SHALL be: a game ID supplied in the URL, then the most recent autosave,
then the last board this puzzle dealt, then a new game.

The last dealt board SHALL be recorded as a game ID in the puzzle's settings
record, and SHALL NOT be recorded as an autosave. The autosave table is what the
home screen reads to badge a puzzle as having a game in progress, so a row written
for a board the player has not touched would make that badge true for every puzzle
they have merely opened.

A recorded game ID that this build can no longer deal SHALL be discarded and
replaced by a new game, without interrupting the player — they did not ask for
that board, so its loss is not a decision to put in front of them. A game ID
supplied in the URL is unaffected by this and continues to report its failure.

#### Scenario: An untouched board survives a reload

- **WHEN** a puzzle is opened, no move is made, and the page is reloaded
- **THEN** the same board is shown, and no autosave record exists for that puzzle

#### Scenario: A started game still restores from its autosave

- **WHEN** a puzzle is opened, moves are made, and the page is reloaded
- **THEN** the board and the moves are restored from the autosave, not re-dealt
  from the recorded game ID

#### Scenario: Browsing puzzles does not badge them as in progress

- **WHEN** a puzzle is opened and left without a move
- **THEN** the home screen does not show that puzzle as having a game in progress

#### Scenario: A remembered board this build cannot deal is dropped quietly

- **WHEN** a puzzle is opened whose recorded game ID no longer validates
- **THEN** a new game is dealt, the recorded ID is cleared, and no alert is shown
