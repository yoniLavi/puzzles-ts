# slide Specification Delta — add-slide-keyboard-control

## MODIFIED Requirements

### Requirement: Slide game implements the Game interface

The engine SHALL provide `src/games/slide/` implementing the `Game`
interface for Slide (Klotski), registered so the puzzle is served by the
TypeScript engine.

Parameters SHALL be a width, a height, and a solution-length limit (`maxmoves`,
where a negative value means no limit). Validation SHALL require width at least 5
and at most 251, and height at least 4, matching upstream. A game ID SHALL encode
the width, height and limit and round-trip through decode.

Validation SHALL additionally reject two parameter sets upstream accepts, each
because the generator provably cannot satisfy it:

- a board whose **cell count exceeds a documented bound**, because generation
  runs an exhaustive breadth-first search whose memory grows explosively with
  board area and, past the bound, exhausts the heap rather than merely running
  slowly. The bound SHALL be at least as large as the largest shipped preset, and
  the measurements that set it SHALL be recorded with it.
- a solution-length limit of **zero**, which asks for a board that starts
  finished.

Slide SHALL declare no `findMistakes` hook, because every reachable board is a
legal state and the puzzle has no notion of a wrong-but-legal position.

#### Scenario: Every preset produces a soluble board

- **WHEN** a new game is generated for any preset or legal size
- **THEN** a board is produced whose main block can be slid to the target within
  the recorded minimum number of moves

#### Scenario: A game ID round-trips through the parameters

- **WHEN** a parameter set is encoded to a game ID and decoded
- **THEN** the same width, height and solution-length limit are recovered

#### Scenario: A board too large to generate is rejected with a reason

- **WHEN** parameters whose cell count exceeds the documented bound are validated
- **THEN** they are rejected with a message the custom-parameters dialog can show,
  rather than being accepted and then exhausting memory during generation

## ADDED Requirements

### Requirement: Slide is playable by keyboard

Slide SHALL be playable by keyboard as well as by pointer, both driving the same
move machinery.

A cell cursor SHALL move over the board with the cursor keys, clamped to the
grid, hidden until the first cursor key and hidden again by any pointer press.
Selecting on a cell belonging to a block SHALL grab that block, computing the
**same** reachable set the pointer grab computes. While a block is grabbed, the
cursor keys SHALL move it **one cell per press** within that reachable set and
SHALL refuse a step that would leave it; selecting again SHALL commit the move,
and cancelling SHALL restore the block to where it started.

One cell per press, rather than sliding as far as the reachable set allows, is
required rather than preferred: a slide-to-the-end cursor cannot stop *inside* a
corridor, so it could not reach every cell the drag can reach, and a keyboard
that cannot express a legal move is the defect this requirement exists to remove.

A keyboard journey of several cells SHALL produce **one** move, identical to the
move the equivalent drag produces — the keyboard is a second way to drive the
existing move construction, not a second movement model. There SHALL be one grab
implementation, reached from both the pointer press and the keyboard select.

The move count SHALL behave identically for a keyboard move and a drag: moving
the same block again SHALL NOT increment it, and returning a block to where it
started SHALL decrement it, so that a multi-step keyboard journey counts as a
single move exactly as the equivalent drag does.

A pointer press SHALL take the board over: it hides the cursor, and where it
grabs no block it SHALL also put down anything the keyboard was holding, so a
grab cannot survive under a pointer and be flung at it by the next drag.

A grab SHALL be dropped whenever the board changes underneath it, however it was
made, because its reachable set was computed against the board being replaced.
The cursor SHALL survive that, being a position on a grid whose size has not
changed; losing it would read as a dropped keypress.

While a Solve route is installed, the select key SHALL continue to step that
route rather than grab a block, so a shipped behaviour is not broken by the new
one. The player regains keyboard selection by making any move of their own,
which already discards the route.

Rendering SHALL show the keyboard cursor and the grabbed block, in both colour
schemes and at the smallest shipped tile size. The grabbed block SHALL be drawn
exactly as the pointer drag draws it — there is one grab, and rendering it two
ways would assert a distinction the game does not make. The cursor SHALL be the
mark that distinguishes keyboard play, SHALL ride the grabbed block on the
square it was picked up by, and SHALL sit beside the board's content rather than
over it.

The cursor's colour SHALL be chosen against the span of materials it can land
on, not against one of them: the board's own contrast ladder runs from the key
block to the exit area, and that ladder **inverts** between colour schemes, so a
colour prominent in one scheme is not thereby prominent in the other.

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
- **AND** the cursor returns with it, to the square the block was picked up by

#### Scenario: A pointer press puts down what the keyboard was holding

- **WHEN** a block is grabbed from the keyboard and the player then presses a
  pointer on a cell holding no block
- **THEN** the grab is dropped and the cursor is hidden, so the next pointer drag
  moves nothing

#### Scenario: A grab dropped by an undo leaves the cursor in place

- **WHEN** the board changes under a keyboard grab
- **THEN** the grab is dropped, because its reachable set is stale
- **AND** the cursor stays where the player left it

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
