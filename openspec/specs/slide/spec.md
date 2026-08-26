# slide Specification

## Purpose
TBD - created by archiving change add-slide-ts-port. Update Purpose after archive.

## Requirements

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

### Requirement: Slide descriptions use the upstream run-length block encoding

A Slide description SHALL encode the board in canonical left-to-right,
top-to-bottom order: each square is an anchor, the main anchor, a
distance-back-link to the previous square of the same block, an empty square, or
a wall; a forcefield square SHALL carry a prefix marker. Runs of identical
squares MAY be abbreviated with a count. The description SHALL end with the
target coordinates and, optionally, the minimum move count.

Validation SHALL reject a description that carries more or fewer squares than the
board holds (distinguishing which), that names other than exactly one main piece,
that contains an out-of-range or dangling distance back-reference, that uses an
unknown character, or that omits the target coordinates.

#### Scenario: A generated description round-trips

- **WHEN** a description is generated and then decoded into a board
- **THEN** re-encoding that board yields the identical description

#### Scenario: A description with the wrong number of squares is rejected

- **WHEN** a description carrying more or fewer squares than the board has cells
  is validated
- **THEN** it is rejected with a message distinguishing too much from too little

### Requirement: Slide ports the shortest-path solver faithfully

Slide SHALL provide a solver that finds the minimum number of moves to bring the
main block to the target, or reports that no solution exists. The solver SHALL be
a breadth-first search over canonical board layouts, deduplicating already-seen
layouts by exact board equality and expanding them in first-in-first-out order,
so that the first path found to the target is a shortest one. The solver SHALL
respect a move limit by abandoning the search once every remaining candidate
exceeds it.

The solver SHALL NOT depend on the ordered-collection semantics of upstream's
`tree234`; its result SHALL depend only on the breadth-first order and on exact
layout deduplication.

The generator SHALL use the solver to keep every board soluble: it SHALL remove
singleton blocks until the board becomes soluble, then attempt to merge adjacent
blocks in a randomised order, keeping a merge only while the board stays soluble.
Generation from a given seed SHALL be reproducible.

The generator SHALL test solubility **after** its final singleton removal as well
as before each one. Upstream tests only before, so a board that becomes soluble
only once its last singleton goes falls through its loop into an abort — which is
every board at the smallest legal size. The added check draws no randomness and is
unreachable on any board upstream generates successfully, so it SHALL NOT change
any description upstream produces.

#### Scenario: The solver returns the shortest solution

- **WHEN** a soluble board is solved
- **THEN** the reported move count equals the length of a shortest sequence that
  brings the main block to the target, and the returned moves realise it

#### Scenario: Generation is reproducible from a seed

- **WHEN** the same seed is used twice for the same parameters
- **THEN** both runs produce the identical board description and minimum move
  count

### Requirement: Slide input, movement and completion

Slide SHALL be played by grabbing a block, dragging it, and releasing it. On a
grab, the game SHALL compute the set of cells the block can reach; during the
drag, it SHALL snap the block to the nearest reachable cell to the pointer; on
release, it SHALL move the block there, or do nothing if the block did not move.
Only the main block SHALL be permitted to pass a forcefield cell.

Moving the same block again SHALL NOT increment the displayed move count, and
returning a block to where it started SHALL decrement it, so that a multi-step
slide of one block counts as a single move.

Solve SHALL install a shortest route **from the current position**, for the player
to walk one step at a time, rather than filling the board in — the route is the
feature. Pressing the step key SHALL make the next move along the stored route;
straying from the route or finishing it SHALL discard it. The step key SHALL be
one the frontend actually delivers: upstream binds the space *character*, which
this frontend never sends (it maps Space and Enter to the cursor-select buttons),
so a literal transcription would leave an installed route unwalkable.

A drag left in progress across a state change (an undo made while the pointer is
still down) SHALL be cancelled, so no frame is ever asked to preview a block
against a board it no longer fits.

Rendering SHALL draw each block with bevelled highlights, SHALL show the dragged
block following the pointer with a landing shadow at its snapped destination,
SHALL highlight the next block to move while a stored solution is active, and
SHALL flash on completion. There SHALL be no interpolated sliding animation.

#### Scenario: Dragging a block to a reachable space moves it

- **WHEN** a block is grabbed and released over a cell it can reach
- **THEN** the block moves to that cell and, unless it is the same block moved
  again, the move count increases by one

#### Scenario: Bringing the main block to the target wins

- **WHEN** the main block is slid onto the target position
- **THEN** the game is reported solved and flashes

#### Scenario: Releasing a block where it started does nothing

- **WHEN** a block is grabbed and released without having moved
- **THEN** the board and the move count are unchanged

### Requirement: Slide's board reads by colour, not only by bevel

The floor, the walls, the ordinary blocks and the main block SHALL be
distinguishable from one another by fill, not solely by their bevels, in both the
light and the dark presentation. Upstream derives all four from the single host
background, which its own author records as "wishy-washy"; this project's display
code is free to correct that.

Each SHALL be a function of the host background rather than an authored colour,
so that one inversion rule maps all four and their **ordering** survives the
scheme flip by construction. Only the two the help page names to the player —
the blue key block and the green exit — SHALL carry a hue; the others stay
neutral so they cannot compete with them.

The target marker SHALL remain the most prominent thing on the board, since it
names the goal. "Pale" is scheme-relative and is not the testable part: a tint
that is lighter than the board under a light scheme is *darker* than it under a
dark one, which is the relationship being preserved rather than a defect.

The exit marking SHALL be legible at the smallest shipped tile size, and SHALL
mark the gate's **boundary** rather than filling its squares, because the gate
usually lies on top of the exit area and two fills cannot both be seen.

The solver's next-piece indication SHALL read as an ordering cue rather than as
the brightest element of the frame, and SHALL leave the piece's own fill intact
so that it is not mistaken for a change of state.

Every colour SHALL come from the shared palette, and SHALL be checked in both
schemes — a fill that reads as contrast against a light background must not read
as a bright patch against a dark one.

#### Scenario: The pieces are told apart without relying on bevels

- **WHEN** the board is rendered in either colour scheme
- **THEN** floor, wall, ordinary block and main block each read as a distinct
  fill, and the target marker remains the most prominent

#### Scenario: The ladder inverts as a whole

- **WHEN** the board is rendered under the opposite colour scheme
- **THEN** the four fills keep their order relative to one another, reversed
  along with the board itself, rather than any one of them changing its place

#### Scenario: The exit gate is marked without hiding the exit

- **WHEN** a gate square also lies inside the exit area
- **THEN** the exit's tint is still drawn across that square, and the gate is
  marked only along the edges where it meets something that is not the gate

#### Scenario: The next-piece cue does not dominate the frame

- **WHEN** the solver indicates the next piece to move
- **THEN** that piece is marked without being the brightest element on the board,
  and keeps the fill it had before it was marked

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
