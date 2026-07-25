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

### Requirement: Crossing advances the selection along the number being filled

Entering a digit SHALL move the selection to the next cell of the run being
filled, so that a complete number can be typed without selecting each cell — the
enhancement the game's own documentation asks for. The behaviour SHALL be
available as a preference, enabled by default.

The direction SHALL be remembered between entries, and SHALL be set by: the
arrow key last used; selecting a cell that belongs to only one run (which snaps
it to that run, there being no alternative); and clicking an already-selected
cell that belongs to both a horizontal and a vertical run, which toggles it.
Where a repeat click has no direction to toggle, it SHALL deselect the cell as
before. The selection SHALL NOT advance after clearing a cell or after a pencil
mark.

#### Scenario: A whole number is typed after one selection

- **WHEN** a cell at the start of a run is selected and digits are typed
- **THEN** each digit fills the next cell of that run in turn, and the selection
  remains visible throughout

#### Scenario: The selection stops at the end of the run

- **WHEN** a digit is entered in the last cell of a run
- **THEN** the selection stays on that cell rather than leaving the run

#### Scenario: Clicking a crossing cell again changes direction

- **WHEN** the already-selected cell lies in both a horizontal and a vertical run
  and is clicked again
- **THEN** the fill direction changes between across and down and the cell stays
  selected

### Requirement: Crossing rejects board sizes it cannot generate

Parameter validation SHALL reject, when validating for generation, any board
larger than the measured generable maximum, giving a reason — rather than
retrying indefinitely as upstream does. Generation retries until every run reads
as a distinct listed number, so the chance of success falls to zero as the board
grows. Validation SHALL NOT apply the ceiling when a description is already
supplied, so an existing puzzle of any size remains playable.

#### Scenario: An ungenerable size is refused with a reason

- **WHEN** parameters larger than the generable maximum are validated for
  generation
- **THEN** validation fails with a message naming the maximum

#### Scenario: An existing large description still loads

- **WHEN** parameters larger than the generable maximum accompany a supplied
  description
- **THEN** validation succeeds

### Requirement: Crossing generates no cell that a clue cannot reach

Generation SHALL reject a candidate board containing an open cell that belongs
to no run, since no clue number can reach it: it would stay blank on a finished
board, and — the completion check inspecting only runs — would accept any digit
the player put there. Upstream produces such boards and records the fault as a
generator TODO.

Reproducing upstream's descriptions byte-for-byte SHALL remain possible through
an explicit generator option, so that the C-reference differential keeps
validating the generator, solver and codec together.

#### Scenario: Every open cell of a generated board lies in a run

- **WHEN** a board is generated for any preset or legal size
- **THEN** every cell that is not a wall belongs to at least one horizontal or
  vertical run

#### Scenario: Upstream's boards remain reproducible on request

- **WHEN** the generator is asked for upstream's isolated-cell behaviour on a
  seed where upstream produces such a board
- **THEN** it reproduces that board, and the shipped default produces a
  different one in which every cell is reachable

### Requirement: Crossing places whole clue numbers from the list

The clue list SHALL be interactive. Clicking a clue SHALL pick it up, previewing
it in every run that can still take it; clicking such a run SHALL write the whole
clue in as a single move. With a cell already selected, clicking a clue that can
go in its run SHALL place it immediately. Selecting a cell SHALL indicate which
clues can still go in its run.

A clue can go in a run when it is the run's length, agrees with every digit
already entered there, and is not already written into another run. Availability
SHALL be decided from the player's own entries alone, and SHALL NOT take the
solution or the satisfiability of crossing runs into account, so that the aid
does not perform the puzzle's deduction. The aid SHALL be available as a
preference, enabled by default.

#### Scenario: A clue is placed into the selected cell's run

- **WHEN** a cell is selected and a clue that can go in its run is clicked
- **THEN** the whole clue is written into that run as one move

The preview SHALL distinguish what it knows from what it is guessing: every run
that could take the clue SHALL be indicated, but the clue's digits SHALL be shown
in place only when exactly one such run remains. A clue already written into the
board SHALL indicate the run it occupies.

#### Scenario: A picked-up clue shows every run it could go in

- **WHEN** a clue is clicked with no cell selected
- **THEN** it is shown as held, and every run that could still take it is
  indicated, without its digits being written into any of them

#### Scenario: A clue with one remaining run is previewed in place

- **WHEN** only one run can still take the held clue
- **THEN** its digits are previewed in that run's empty cells

#### Scenario: A clue already on the board shows where it is

- **WHEN** a clue that has been written into a run is clicked
- **THEN** the run it occupies is indicated

#### Scenario: A clue used elsewhere is not offered again

- **WHEN** a clue has been written into one run
- **THEN** no other run offers or accepts it
