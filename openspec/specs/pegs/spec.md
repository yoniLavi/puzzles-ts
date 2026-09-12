# pegs Specification

## Purpose
Pegs (peg solitaire), the puzzle of jumping pegs over one another, removing each
peg jumped, until one remains. This capability specifies its port to the TS
engine, including a palette derived through the shared highlight helper and a
drag or armed jump that is discarded when the board changes beneath it.

## Requirements

### Requirement: Pegs game implements the Game interface

The engine SHALL provide a registered `pegs` game implementing `Game<PegsParams, PegsState, PegsMove, PegsUi, PegsDrawState>` with three board types (Cross, Octagon, Random), drag-to-jump input, keyboard cursor with jump-select, per-tile render cache, blitter-based drag sprite, and win flash.

#### Scenario: Cross board generation and play

- **WHEN** a new Cross game is created at 7×7
- **THEN** the board has a cross-shaped layout with a central hole and pegs elsewhere inside the cross
- **AND** a valid jump move (drag peg over adjacent peg into hole) removes the jumped peg and places the jumping peg at the target
- **AND** when exactly one peg remains, `status` returns completed

#### Scenario: Random board generation

- **WHEN** a new Random game is created
- **THEN** the generator builds the board by reverse-moves from a single peg
- **AND** the resulting board touches all four edges of the grid
- **AND** the board is guaranteed soluble (every move is reversible)

#### Scenario: Drag input

- **WHEN** the player presses LEFT_BUTTON on a peg
- **THEN** the drag starts and the peg is visually lifted from its source cell
- **WHEN** the player drags (LEFT_DRAG)
- **THEN** the peg follows the mouse position
- **WHEN** the player releases (LEFT_RELEASE) on a valid jump target
- **THEN** the jump move is executed
- **WHEN** the player releases on an invalid target
- **THEN** the drag is canceled with no move

#### Scenario: Keyboard cursor with jump-select

- **WHEN** the cursor is on a peg and the player presses CURSOR_SELECT
- **THEN** the cursor enters jumping mode
- **WHEN** an arrow key is pressed while in jumping mode
- **THEN** if the direction has a peg then a hole, the jump is executed and the cursor moves to the target
- **WHEN** CURSOR_SELECT is pressed again while jumping
- **THEN** jumping mode is canceled

### Requirement: Pegs derives its palette via the shared mkhighlight helper

The Pegs `colors()` method SHALL derive its background, highlight, and lowlight colors from the shared `mkhighlight` helper in `src/engine/color/color-mkhighlight.ts`, with no local copy of the derivation.

#### Scenario: Pegs colors on a near-white host

- **WHEN** the host background is near-white
- **THEN** the shared helper shifts the background away from pure white
- **AND** the Pegs palette's COL_HIGHLIGHT is visibly brighter than COL_BACKGROUND

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
