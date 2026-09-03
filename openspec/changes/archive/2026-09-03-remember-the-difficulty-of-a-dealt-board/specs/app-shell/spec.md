# app-shell — delta for remember-the-difficulty-of-a-dealt-board

## MODIFIED Requirements

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

**The recorded game ID SHALL carry the full params encoding**, difficulty
included, and SHALL NOT be the id offered for sharing. Those are different jobs:
a shared `params:desc` id deliberately omits difficulty (upstream
`midend_get_game_id`), because the desc already fixes the board and a link should
not over-constrain the recipient's next game — while re-dealing a remembered
board must restore the tier the player chose, since loading a game ID sets the
params from its prefix. Recording the sharing id here reset a tiered puzzle to
its default difficulty on every reopen, and the settings write that followed
made the reset permanent.

A recorded game ID that this build can no longer deal SHALL be discarded and
replaced by a new game, without interrupting the player — they did not ask for
that board, so its loss is not a decision to put in front of them. A game ID
supplied in the URL is unaffected by this and continues to report its failure.

#### Scenario: An untouched board survives a reload

- **WHEN** a puzzle is opened, no move is made, and the page is reloaded
- **THEN** the same board is shown, and no autosave record exists for that puzzle

#### Scenario: A reopened board keeps the difficulty it was dealt at

- **WHEN** a tiered puzzle is dealt at a non-default difficulty, no move is made,
  and the page is reloaded
- **THEN** the same board is shown **and** the puzzle still reports that
  difficulty, so the next new game is dealt at it
- **AND** the type control names that difficulty rather than the default one

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

## ADDED Requirements

### Requirement: The params a puzzle reports are the full params of the board on screen

The params a puzzle reports for display SHALL be the **full** encoding of the
board currently on screen, difficulty included — the same encoding a restore
uses, never the lossy sharing form. They label the type control, describe the
type in the share dialog, and key the keypad and view re-renders, and every one
of those is wrong if the difficulty is missing.

Deriving them from the random seed and falling back to the descriptive game ID
SHALL NOT be done: the preference exists only because the seed carries full
params and the game ID does not, so the fallback mislabels precisely those boards
that have no seed — which is every board restored from a descriptive ID, i.e.
every reopened puzzle. Unruly at 10x10 Normal reopened as "10x10 Trivial", a type
its preset menu does not offer.

#### Scenario: A board with no seed still reports its difficulty

- **WHEN** a board is restored from a descriptive game ID, so no random seed
  exists for it
- **THEN** the params it reports carry the difficulty the board was dealt at

#### Scenario: The reported params follow a re-deal

- **WHEN** a new board is dealt at a different difficulty
- **THEN** the params reported change with it rather than keeping the first
  value seen
