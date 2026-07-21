# spokes Specification Delta — add-spokes-ts-port

## ADDED Requirements

### Requirement: Spokes game implements the Game interface

The engine SHALL provide `src/native/games/spokes/` implementing the `Game`
interface for Spokes, registered so the puzzle is served by the TypeScript engine.

Parameters SHALL be a width, a height, and a difficulty (Easy, Tricky or Hard).
Validation SHALL require width and height each at least 2, matching upstream, with
no upper bound. A game ID SHALL encode the width, height and difficulty and
round-trip through decode.

Spokes SHALL be a uniquely-solvable line-drawing puzzle and SHALL declare a
`findMistakes` hook, so that Check & Save flags a wrong board rather than saving it
silently.

#### Scenario: Every preset produces a soluble board

- **WHEN** a new game is generated for any preset or legal size
- **THEN** a board is produced whose hubs can be connected into one satisfied,
  fully connected group, deducible at the requested difficulty

#### Scenario: A game ID round-trips through the parameters

- **WHEN** a parameter set is encoded to a game ID and decoded
- **THEN** the same width, height and difficulty are recovered

### Requirement: Spokes descriptions use one clue character per cell

A Spokes description SHALL encode the board as exactly width times height
characters in row-major order: each character is a clue digit from `0` to `8` (the
number of lines that hub must carry, where `0` marks a cell that holds no hub), or a
marker for a hand-authored hole. The description SHALL NOT use run-length
abbreviation.

Validation SHALL reject a description that carries fewer characters than the board
has cells, that carries more, or that contains a character that is neither a clue
digit nor the hole marker, distinguishing a too-short description from a too-long
one.

#### Scenario: A generated description round-trips

- **WHEN** a description is generated and then decoded into a board
- **THEN** re-encoding that board yields the identical description

#### Scenario: A description with the wrong number of characters is rejected

- **WHEN** a description carrying more or fewer characters than the board has cells
  is validated
- **THEN** it is rejected with a message distinguishing too short from too long

### Requirement: Spokes ports the tiered deductive solver and solver-gated generator

Spokes SHALL provide a solver that draws the forced lines and marks for a board, or
reports the board invalid or incomplete, at a requested difficulty of Easy, Tricky
or Hard. The solver SHALL apply hub saturation and exhaustion, diagonal-crossing
marks, and the two-ones rule; the Tricky and Hard tiers SHALL additionally apply
bounded contradiction look-ahead. The solver SHALL determine board validity by
connectivity, treating a set of hubs that can draw no further line to the rest of
the board as invalid and a fully connected, fully satisfied board as solved.

The contradiction look-ahead SHALL be deterministic and exhaustive, not a guessing
tier: a value is committed only when the opposite value provably leads to an invalid
board.

The generator SHALL use the solver to keep every board uniquely soluble: it SHALL
start from every horizontal and vertical line plus a random diagonal per cell, then
remove lines in a randomised order, keeping a removal only while every hub retains at
least one line and the board stays uniquely soluble at the target difficulty and no
easier. Generation from a given seed SHALL be reproducible.

#### Scenario: The solver deduces the unique solution

- **WHEN** a generated board is solved at its difficulty
- **THEN** the solver reaches a single fully connected, fully satisfied
  configuration of lines and marks

#### Scenario: Generation is reproducible from a seed

- **WHEN** the same seed is used twice for the same parameters
- **THEN** both runs produce the identical board description

### Requirement: Spokes input, movement and completion

Spokes SHALL be played by dragging between two adjacent hubs, or with a keyboard
cursor. A left drag SHALL toggle a line between the hubs, and a right drag SHALL
toggle a ruled-out mark; a keyboard cursor on the half-grid SHALL draw a line on
select and place a mark on the alternate select. A line SHALL NOT be drawable along a
diagonal that would cross an existing diagonal line. A drag or key that resolves to no
valid change SHALL leave the board unchanged.

Rendering SHALL draw each hub as a circle carrying its available spokes and clue,
SHALL draw lines between connected hubs, SHALL highlight the hub being dragged from,
SHALL colour an over-filled or isolated hub as an error, and SHALL flash on
completion. There SHALL be no interpolated line-drawing animation.

`findMistakes` SHALL flag every line the player has drawn that the unique solution
forbids, and every mark the player has placed where the solution requires a line; a
line the solution requires but the player has not yet drawn SHALL NOT be flagged.

#### Scenario: Dragging between two hubs draws a line

- **WHEN** the player left-drags from one hub to an adjacent hub with a free spoke
- **THEN** a line is drawn between them, or removed if one was already present

#### Scenario: A crossing diagonal line is refused

- **WHEN** the player tries to draw a diagonal line whose crossing diagonal already
  carries a line
- **THEN** no line is drawn and the board is unchanged

#### Scenario: Completing the connected, satisfied board wins

- **WHEN** every hub carries exactly its clue's lines and all hubs form one connected
  group with no crossing lines
- **THEN** the game is reported solved and flashes

#### Scenario: A wrongly drawn line is flagged as a mistake

- **WHEN** the player has drawn a line the unique solution does not contain and asks
  to check the board
- **THEN** that line is reported as a mistake, while lines merely not yet drawn are
  not
