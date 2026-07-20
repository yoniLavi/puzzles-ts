# group Specification Delta — add-group-ts-port

## ADDED Requirements

### Requirement: Group game implements the Game interface

The engine SHALL provide `src/native/games/group/` implementing the `Game`
interface for Group — a Latin-square puzzle whose completed grid must be a valid
group Cayley table (Latin **and** associative) — registered so the puzzle is
served by the TypeScript engine.

Group SHALL accept a grid size (group order) between 3 and 26, a difficulty of
Trivial, Normal, Hard, Extreme or Unreasonable, and a "show identity" flag. It
SHALL reject an identity-hidden Trivial puzzle and an identity-hidden 3×3 puzzle,
because such puzzles cannot be made: identity-hidden puzzles leave two rows and
columns blank, and only a non-Trivial deduction can distinguish them.

The element-numbering used for display and keyboard input SHALL depend on the
"show identity" flag — with identity shown, the identity element is presented
first — and this SHALL affect the solution encoding and on-screen labels but
SHALL NOT affect the grid description.

#### Scenario: A generated board is a solvable group table

- **WHEN** a new game is generated for a legal size and difficulty in either
  identity mode
- **THEN** its clues admit exactly one completion, that completion is a valid
  group table, and the solver grades it at the requested difficulty

#### Scenario: Impossible identity-hidden parameters are rejected

- **WHEN** parameters request an identity-hidden Trivial puzzle, or an
  identity-hidden 3×3 puzzle
- **THEN** validation rejects them with a reason

### Requirement: Group descriptions use the upstream run-length encoding

A Group description SHALL encode the grid in reading order: each clue as a
decimal number in the range 1 to the grid size, each run of 1–26 blank cells as a
single letter `a`–`z` (runs longer than 26 split across letters), and an
underscore separator where a number would otherwise abut adjacent data. The
solution SHALL be encoded separately using the identity-dependent element letters
rather than decimal numbers.

Validation SHALL reject a description whose cell count does not equal the grid
area, distinguishing "not enough data" from "too much", and SHALL reject
out-of-range numbers and unknown characters.

#### Scenario: A generated description round-trips

- **WHEN** a description is generated and then decoded
- **THEN** the resulting clues are identical, and re-encoding yields the same
  description

#### Scenario: A description of the wrong length is rejected

- **WHEN** a description carrying more or fewer cells than the grid area is
  validated
- **THEN** it is rejected with a message distinguishing which

### Requirement: Group ports the graded group-axiom solver over the shared Latin solver

Group SHALL solve using the shared `src/native/engine/latin.ts` engine, supplying
only its group-specific deductions and validator: at Normal, an associativity
forward-deduction ((ab)c = a(bc)) together with filling the identity's row and
column once the identity is known; at Hard, ruling out identity candidates from
any product that equals neither of its factors. Extreme SHALL use the generic
set-elimination and forcing techniques and Unreasonable the generic
guess-and-verify recursion, with no Group-specific technique. A completed grid
SHALL be accepted only if it is associative.

The solver SHALL NOT introduce a difficulty tier beyond the five upstream ships,
and SHALL NOT implement the inverse-based, hard-mode-associativity or
element-order techniques upstream lists as unimplemented; the shipped difficulty
grading depends on their absence.

#### Scenario: The solver grades a board at the intended difficulty

- **WHEN** a board generated at a given difficulty is solved
- **THEN** it is solvable at that difficulty and not at the tier below

#### Scenario: Associativity is used as a deduction

- **WHEN** a partially-filled board has `ab`, `bc` and `(ab)c` known but `a(bc)`
  blank at Normal or harder
- **THEN** the solver places `a(bc)` equal to `(ab)c`

### Requirement: Group generation from the group data table

Group SHALL generate boards by selecting a group of the requested order from the
transcribed group data table, decompressing its generators into the full Cayley
table by breadth-first search, permuting its elements (fixing the identity in
place when the identity is shown), then removing clues one at a time while the
board remains uniquely solvable at the requested difficulty. Generation SHALL
apply upstream's difficulty-downgrade exceptions, whereby some small sizes cannot
reach the higher difficulties and are generated one tier easier.

In identity-hidden mode, generation SHALL additionally blank the identity's row
and column and one further row and column, so the identity cannot be read
directly, and SHALL re-verify solvability afterward. Generation SHALL reject a
board that is already solvable one difficulty tier below the target.

#### Scenario: Small sizes are downgraded rather than failing

- **WHEN** a size too small to support the requested difficulty is used
- **THEN** a board is generated at the highest difficulty that size supports

#### Scenario: Identity-hidden boards do not reveal the identity

- **WHEN** an identity-hidden board is generated
- **THEN** the identity's row and column, and one further row and column, are
  blank, and the board is still uniquely solvable at its difficulty

### Requirement: Group input, gameplay aids and rendering

Group SHALL be played with mouse and keyboard: selecting a cell and typing an
element letter or number fills it, right-click selects a cell for pencil marks,
and a diagonal drag from a selected cell fills a whole diagonal at once. Filling
a cell SHALL be idempotent, and setting an immutable cell to the value it already
holds SHALL be permitted so a multifill need not detour around it.

Group SHALL provide two structural gameplay aids: dragging a row or column header
SHALL reposition that element's entire row and column so a player can group a
subgroup with its cosets, and dropping a divider between two adjacent elements
SHALL mark a boundary, cleared automatically when those two elements are dragged
apart. Group SHALL provide `findMistakes`, since the puzzle is uniquely solvable,
so Check & Save applies.

Rendering SHALL draw the element legend along the top and left, shade the leading
diagonal, draw dividers as thick edges, lay out pencil marks in a grid, highlight
the selection, annotate Latin duplicates and associativity failures in the error
colour, and flash on completion.

#### Scenario: A diagonal multifill sets several cells at once

- **WHEN** a cell is selected and the pointer is dragged diagonally to another
  cell, then an element is entered
- **THEN** every cell along that diagonal is set to the element, skipping any
  immutable cell that already holds it

#### Scenario: Reordering rows carries its divider correctly

- **WHEN** a row header is dragged to a new position such that a divider's two
  bordering elements are no longer adjacent
- **THEN** the affected divider is removed

#### Scenario: A completed valid table wins

- **WHEN** every cell is filled so the grid is Latin and associative
- **THEN** the game is reported solved and flashes
