# slide Specification Delta — add-slide-keyboard-control

## ADDED Requirements

### Requirement: Slide is playable by keyboard

Slide SHALL be playable by keyboard as well as by pointer, both driving the same
move machinery.

A cell cursor SHALL move over the board with the cursor keys, clamped to the
grid. Selecting on a cell belonging to a block SHALL grab that block, computing
the **same** reachable set the pointer grab computes. While a block is selected,
the cursor keys SHALL move it within that reachable set and SHALL refuse a move
that would leave it; selecting again SHALL commit the move, and cancelling SHALL
restore the block to where it started. A keyboard journey of several cells SHALL
produce **one** move, identical to the move the equivalent drag produces — the
keyboard is a second way to drive the existing move construction, not a second
movement model.

The move count SHALL behave identically for a keyboard move and a drag: moving
the same block again SHALL NOT increment it, and returning a block to where it
started SHALL decrement it, so that a multi-step keyboard journey counts as a
single move exactly as the equivalent drag does.

While a Solve route is installed, the select key SHALL continue to step that
route rather than grab a block, so a shipped behaviour is not broken by the new
one. The player regains keyboard selection by making any move of their own,
which already discards the route.

Rendering SHALL show the keyboard cursor and the selected block, legibly distinct
from the drag preview and its landing shadow, in both colour schemes and at the
smallest shipped tile size.

#### Scenario: A keyboard journey and the equivalent drag produce the same move

- **WHEN** a player selects a block with the keyboard, walks it several cells
  within its reachable set, and commits
- **THEN** the resulting board state and move count are identical to those
  produced by dragging the same block to the same cell

#### Scenario: A keyboard move out of the reachable set is refused

- **WHEN** a block is selected and a cursor key would move it to a cell outside
  its reachable set
- **THEN** nothing moves, no move is recorded, and the selection is retained

#### Scenario: Cancelling a selection restores the block

- **WHEN** a block has been walked several cells and the player cancels instead
  of committing
- **THEN** the block returns to where it started and no move is recorded

#### Scenario: An installed Solve route keeps the select key

- **WHEN** a Solve route is installed and the player presses the select key
- **THEN** the next move along the route is made, rather than a block being
  grabbed
- **AND** after the player makes a move of their own, which discards the route,
  the select key grabs blocks again

#### Scenario: A board can be completed without a pointer

- **WHEN** a player uses only the keyboard from a fresh board
- **THEN** every move the pointer can make is reachable, and the board can be
  driven to completion
