## ADDED Requirements

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
- **THEN** the drag is cancelled with no move

#### Scenario: Keyboard cursor with jump-select

- **WHEN** the cursor is on a peg and the player presses CURSOR_SELECT
- **THEN** the cursor enters jumping mode
- **WHEN** an arrow key is pressed while in jumping mode
- **THEN** if the direction has a peg then a hole, the jump is executed and the cursor moves to the target
- **WHEN** CURSOR_SELECT is pressed again while jumping
- **THEN** jumping mode is cancelled

### Requirement: Pegs uses shared mkhighlightBackground

The Pegs `colours()` method SHALL import and call `mkhighlightBackground` from `src/native/engine/colour-mkhighlight.ts` to derive its background colour, making it the second consumer of the shared helper.

#### Scenario: Pegs colours on a near-white host

- **WHEN** the host background is near-white
- **THEN** `mkhighlightBackground` shifts it away from pure white
- **AND** the Pegs palette's COL_HIGHLIGHT is visibly brighter than COL_BACKGROUND
