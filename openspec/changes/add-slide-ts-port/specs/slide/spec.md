# slide Specification Delta — add-slide-ts-port

## ADDED Requirements

### Requirement: Slide game implements the Game interface

The engine SHALL provide `src/native/games/slide/` implementing the `Game`
interface for Slide (Klotski), registered so the puzzle is served by the
TypeScript engine.

Parameters SHALL be a width, a height, and a solution-length limit (`maxmoves`,
where a negative value means no limit). Validation SHALL require width at least 5
and at most 251, and height at least 4, matching upstream; the solution-length
limit SHALL NOT be otherwise constrained. A game ID SHALL encode the width,
height and limit and round-trip through decode.

Slide SHALL be played by mouse or touch drag only — it has no keyboard cursor —
and SHALL declare no `findMistakes` hook, because every reachable board is a
legal state and the puzzle has no notion of a wrong-but-legal position.

#### Scenario: Every preset produces a soluble board

- **WHEN** a new game is generated for any preset or legal size
- **THEN** a board is produced whose main block can be slid to the target within
  the recorded minimum number of moves

#### Scenario: A game ID round-trips through the parameters

- **WHEN** a parameter set is encoded to a game ID and decoded
- **THEN** the same width, height and solution-length limit are recovered

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
slide of one block counts as a single move. A stored solution SHALL be
step-through-able: after Solve, pressing the step key SHALL make the next move
along the stored path, and straying from or completing the path SHALL discard it.

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
</content>
