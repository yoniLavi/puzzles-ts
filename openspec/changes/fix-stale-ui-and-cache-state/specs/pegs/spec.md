## ADDED Requirements

### Requirement: Pegs discards a drag or an armed jump when the board changes under it
Pegs SHALL clear its dragged peg and its armed keyboard jump whenever the midend
replaces the game state, so that a pointer drag or a selected jump cannot act on
a board that no longer holds the peg it was aimed at.

#### Scenario: an undo disarms a selected jump

- **GIVEN** a keyboard jump armed on a peg with the cursor over it
- **WHEN** the player undoes the move that placed that peg, and then presses an
  arrow key
- **THEN** the press starts no jump and moves the cursor as usual
- **AND** no error reaches the player
