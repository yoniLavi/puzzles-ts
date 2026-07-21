# crossing Specification Delta — add-crossing-ts-port

## ADDED Requirements

### Requirement: Crossing game implements the Game interface

The engine SHALL provide `src/native/games/crossing/` implementing the `Game`
interface for Crossing (Nansuke / Number Skeleton), registered so the puzzle is
served by the TypeScript engine.

Parameters SHALL be a width, a height, and a symmetric-walls flag. Validation
SHALL require both dimensions at least 2 and at least one dimension at least 4,
matching upstream. A game ID SHALL encode the width, height and symmetry and
round-trip through decode, with a square board when the height is omitted.

Because Crossing has a unique, purely-deducible solution, it SHALL implement
`findMistakes`, so that Check & Save can hard-block a save while a wrong digit or
note is present. It SHALL restore the on-screen digit keypad and support pencil
marks.

#### Scenario: Every preset produces a uniquely-solvable board

- **WHEN** a new game is generated for any preset or legal size
- **THEN** a board is produced whose walls and number list admit exactly one
  solution reachable by the deductive solver

#### Scenario: A game ID round-trips through the parameters

- **WHEN** a parameter set is encoded to a game ID and decoded
- **THEN** the same width, height and symmetric-walls flag are recovered, and a
  game ID omitting the height is read as a square board

#### Scenario: A dimension below the minimum is rejected

- **WHEN** parameters are validated with both width and height below 4, or with
  either dimension below 2
- **THEN** validation fails with the corresponding upstream message

### Requirement: Crossing descriptions use the upstream run-length encoding

A Crossing description SHALL encode the walls in row-major order as alternating
runs — a decimal count for a run of open cells and a letter `a`–`z` for a run of
1 to 26 wall cells — followed by a comma and the list of clue numbers as decimal
digits separated by commas. The clue numbers SHALL be stored sorted by length and
then lexicographically, matching the order the description emits.

Validation SHALL reject a description containing an unknown wall character, a
description that supplies more cell data than the board holds, a clue number
longer than the maximum row length, and a duplicate clue number. Validation SHALL
reproduce upstream's behaviour, including its deliberately absent checks (it does
not reject an over-short description or an invalid digit character).

#### Scenario: A generated description round-trips

- **WHEN** a description is generated and then decoded into a board and re-encoded
- **THEN** the resulting description is identical

#### Scenario: A description with an unknown wall character is rejected

- **WHEN** a description whose wall section contains a character outside the
  digit and `a`–`z` runs is validated
- **THEN** it is rejected as containing an invalid character

#### Scenario: A description with a duplicate clue number is rejected

- **WHEN** a description whose clue list repeats a number is validated
- **THEN** it is rejected as containing a duplicate number

### Requirement: Crossing ports the deductive solver and solver-gated generator

Crossing SHALL provide a solver that determines the unique solution, or reports
that the board is not fully determined or is contradictory. The solver SHALL work
by constraint propagation over the grid's maximal horizontal and vertical runs of
length at least 2: for each run it SHALL intersect each open cell's candidate
digits with the digits some still-fitting clue number places there, then confirm
any cell whose candidates collapse to a single digit, iterating to a fixpoint. It
SHALL report a board valid only when every run matches exactly one clue number and
each clue number is used exactly once.

The generator SHALL use the solver to keep every board uniquely solvable: it SHALL
grow open cells from a single shuffled pass until no 2×2 block is fully closed and
all open cells are connected, fill a candidate solution with random digits, read
the runs into the clue list, and accept the board only when the solver reports it
valid — retrying otherwise. Generation from a given seed SHALL be reproducible.

#### Scenario: The solver finds the unique solution

- **WHEN** a generated board is solved
- **THEN** the solver fills every open cell so that each clue number appears
  exactly once across the runs, and reports the board valid

#### Scenario: Generation is reproducible from a seed

- **WHEN** the same seed and parameters are used twice to generate a game
- **THEN** both runs produce the identical description

### Requirement: Crossing input, marking, mistakes and completion

Crossing SHALL be played by selecting an open cell and entering a digit, with a
separate pencil-mark mode for candidate notes. A left click SHALL select a cell
for digit entry and a right click for pencil marking; the arrow keys SHALL move a
keyboard cursor and Enter SHALL toggle between digit and pencil entry; a digit key
SHALL place a digit or toggle a note, and Backspace, Space or `0` SHALL clear.
Walls SHALL not be editable, and a move that changes nothing SHALL produce no
history entry.

Crossing SHALL flag a completed run that matches no clue number with a live error
highlight, independently of `findMistakes`. `findMistakes` SHALL re-solve to the
unique solution and flag every placed digit that contradicts it and every empty
cell whose pencil notes have crossed out its solution digit, returning nothing
when the board is not yet uniquely determined. The game SHALL be reported complete
when every run matches exactly one clue number and each clue number is used once,
and SHALL flash on that completion. Rendering SHALL draw walls and placed digits as
bevelled tiles with per-digit colours, pencil marks, the run-error highlights, and
a number-list panel below the grid coloured by how many times each clue is placed.

#### Scenario: Entering the wrong digit is caught by Check & Save

- **WHEN** the player places a digit that contradicts the unique solution and
  invokes Check & Save
- **THEN** the cell is flagged as a mistake and the save is refused

#### Scenario: A no-op entry makes no move

- **WHEN** the player enters into a cell the digit it already holds, or edits a
  wall cell
- **THEN** no move is made and the history is unchanged

#### Scenario: Placing every clue exactly once wins

- **WHEN** a move fills the grid so every run matches exactly one clue number and
  each clue number is used once
- **THEN** the game is reported solved and flashes
