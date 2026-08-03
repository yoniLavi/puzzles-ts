# slide Specification Delta — add-slide-keyboard-control

## MODIFIED Requirements

### Requirement: Slide input, movement and completion

Slide SHALL be playable by **pointer and by keyboard**, both driving the same
move machinery.

By pointer, Slide SHALL be played by grabbing a block, dragging it, and releasing
it. On a grab, the game SHALL compute the set of cells the block can reach;
during the drag, it SHALL snap the block to the nearest reachable cell to the
pointer; on release, it SHALL move the block there, or do nothing if the block
did not move. Only the main block SHALL be permitted to pass a forcefield cell.

By keyboard, a cell cursor SHALL move over the board with the cursor keys,
clamped to the grid. Selecting on a cell belonging to a block SHALL grab that
block, computing the **same** reachable set the pointer grab computes. While a
block is selected, the cursor keys SHALL move it within that reachable set and
SHALL refuse a move that would leave it; selecting again SHALL commit the move,
and cancelling SHALL restore the block to where it started. A keyboard journey of
several cells SHALL produce **one** move, identical to the move the equivalent
drag produces — the keyboard is a second way to drive the existing move
construction, not a second movement model.

The previous requirement stated that Slide "SHALL be played by mouse or touch
drag only — it has no keyboard cursor". That made a keyboard player's exclusion
normative rather than incidental, and it is the sentence this change exists to
remove: the collection's bar is parity between mouse, touch and keyboard.

Moving the same block again SHALL NOT increment the displayed move count, and
returning a block to where it started SHALL decrement it, so that a multi-step
slide of one block counts as a single move. This SHALL hold identically for a
keyboard move and a drag.

Solve SHALL install a shortest route **from the current position**, for the player
to walk one step at a time, rather than filling the board in — the route is the
feature. Pressing the step key SHALL make the next move along the stored route;
straying from the route or finishing it SHALL discard it. The step key SHALL be
one the frontend actually delivers: upstream binds the space *character*, which
this frontend never sends (it maps Space and Enter to the cursor-select buttons),
so a literal transcription would leave an installed route unwalkable.

While a Solve route is installed, the select key SHALL continue to step that
route rather than grab a block, so a shipped behaviour is not broken by the new
one. The player regains keyboard selection by making any move of their own, which
already discards the route.

A drag left in progress across a state change (an undo made while the pointer is
still down) SHALL be cancelled, so no frame is ever asked to preview a block
against a board it no longer fits.

Rendering SHALL draw each block with bevelled highlights, SHALL show the dragged
block following the pointer with a landing shadow at its snapped destination,
SHALL highlight the next block to move while a stored solution is active, and
SHALL flash on completion. There SHALL be no interpolated sliding animation.
Rendering SHALL additionally show the keyboard cursor and the selected block,
legibly distinct from the drag preview and its landing shadow, in both colour
schemes and at the smallest shipped tile size.

#### Scenario: Dragging a block to a reachable space moves it

- **WHEN** a block is grabbed and released over a cell it can reach
- **THEN** the block moves to that cell and, unless it is the same block moved
  again, the move count increases by one

#### Scenario: A keyboard journey and the equivalent drag produce the same move

- **WHEN** a player selects a block with the keyboard, walks it several cells
  within its reachable set, and commits
- **THEN** the resulting board state and move count are identical to those
  produced by dragging the same block to the same cell

#### Scenario: A keyboard move out of the reachable set is refused

- **WHEN** a block is selected and a cursor key would move it to a cell outside
  its reachable set
- **THEN** nothing moves, no move is recorded, and the selection is retained

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
