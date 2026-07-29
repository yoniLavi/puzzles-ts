# salad Specification Delta — add-salad-ts-port

## ADDED Requirements

### Requirement: Salad game implements the Game interface

The engine SHALL provide `src/native/games/salad/` implementing the `Game`
interface for Salad, registered so the puzzle is served by the TypeScript engine.

Salad SHALL support both of its game modes: **ABC End View** (letters, with clues on
the grid's borders naming the first character seen looking inward) and **Number
Ball** (numbers, with in-grid ball and cross clues). Parameters SHALL be a grid size
(`order`), a symbol count (`nums`), a game mode, and a difficulty. Validation SHALL
require `nums` at least 2 and less than `order`, `order` at least 3, and `nums` at
most 9, matching upstream. A game ID SHALL encode the size, symbol count, mode and
difficulty and round-trip through decode.

Salad SHALL declare a `findMistakes` hook, because it has a unique solution, and
SHALL surface its `nums` symbol keys plus the empty and not-empty markers as an
on-screen keypad.

#### Scenario: Every preset produces a uniquely-solvable board

- **WHEN** a new game is generated for any preset or legal size, in either mode
- **THEN** a board is produced whose clues admit exactly one completion under the
  solver at the puzzle's difficulty

#### Scenario: A game ID round-trips through the parameters

- **WHEN** a parameter set is encoded to a game ID and decoded
- **THEN** the same size, symbol count, game mode and difficulty are recovered

### Requirement: Salad descriptions use the upstream run-length block encoding

A Salad description SHALL encode its clue arrays in canonical order using a
run-length block encoding: a run of empty squares as a single lowercase letter, an
empty-marker square as `X`, a must-contain-a-symbol square as `O`, and a symbol as a
character offset from a per-array base. In ABC End View mode the description SHALL be
the border clues, a comma, then the grid clues; in Number Ball mode it SHALL be the
grid clues alone.

Validation SHALL reject a description that carries more or fewer squares than the
relevant array holds (distinguishing which), that contains an out-of-range clue
value, or that uses an unknown character, reproducing the upstream messages.

#### Scenario: A generated description round-trips

- **WHEN** a description is generated and then decoded into a board
- **THEN** re-encoding that board yields the identical description

#### Scenario: A description with the wrong number of squares is rejected

- **WHEN** a description carrying more or fewer squares than its array has cells is
  validated
- **THEN** it is rejected with a message distinguishing too much from too little

### Requirement: Salad ports the solver as a shared Latin-square consumer

Salad SHALL provide a solver built on the shared `engine/latin.ts` framework, adding
its own deductions: hole-versus-symbol synchronisation, per-line hole and circle
counting, and — in ABC End View mode — the border-clue deduction. The "some squares
empty" rule SHALL be realised by treating symbols above `nums` in a full order-`order`
Latin square as empty squares, so the shared Latin generator and solver cube are
reused unchanged.

The solver SHALL provide two difficulties, Normal and Extreme, and both SHALL be
solvable by pure deduction without guessing. The generator SHALL use the solver to
keep every board uniquely solvable: it SHALL generate a full Latin square, then
remove clues in a randomised order, keeping a removal only while the puzzle stays
uniquely solvable at the target difficulty. Generation from a given seed SHALL be
reproducible.

#### Scenario: The solver deduces the unique solution without guessing

- **WHEN** a generated board is solved at its difficulty
- **THEN** the solver reaches the unique completion using only its deductive
  techniques, never backtracking search

#### Scenario: Generation is reproducible from a seed

- **WHEN** the same seed is used twice for the same parameters
- **THEN** both runs produce the identical board description

### Requirement: Salad input, marking and completion

Salad SHALL be played by selecting a cell and entering a symbol, an empty marker, or
a not-empty marker, with pencil marks available for tentative notes. Left-click SHALL
select a cell for ink entry and right-click for pencil entry; the arrow keys SHALL
move a keyboard cursor and the select key SHALL toggle between ink and pencil entry.
A fill-all-candidates action SHALL be available. A move that would not change the
board SHALL be a no-op.

Salad SHALL flag mistakes on demand: given the board, `findMistakes` SHALL re-solve
from the fixed clues and report every player entry that contradicts the unique
solution — a wrong symbol, an empty marker where a symbol belongs, a not-empty marker
where an empty square belongs — and every empty cell whose pencil notes have crossed
out its solution value. The game SHALL be reported solved and SHALL flash when every
line holds each symbol exactly once with the correct empty squares and all border
clues are satisfied.

Rendering SHALL draw symbols, balls and crosses, pencil-mark candidate grids, border
clues in the surrounding margin, a live highlight of rule violations, and a
completion flash. Rendering targets a neat presentation, not pixel parity with the C.

#### Scenario: Entering a symbol places it in the selected cell

- **WHEN** a cell is selected in ink mode and a valid symbol key is pressed
- **THEN** that symbol is placed in the cell and the cell is no longer empty

#### Scenario: Completing every line to the rules wins

- **WHEN** the last entry makes every row and column hold each symbol once with the
  correct empty squares, satisfying all clues
- **THEN** the game is reported solved and flashes

#### Scenario: Check flags a contradicting entry

- **WHEN** the board holds a player entry that contradicts the unique solution and
  mistakes are checked
- **THEN** that entry is reported as a mistake and highlighted
