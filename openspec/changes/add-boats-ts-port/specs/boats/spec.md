# boats Specification Delta — add-boats-ts-port

## ADDED Requirements

### Requirement: Boats game implements the Game interface

The engine SHALL provide `src/native/games/boats/` implementing the `Game`
interface for Boats (Battleships), registered so the puzzle is served by the
TypeScript engine.

Parameters SHALL be a width, a height, a maximum fleet (boat) size, a fleet
configuration (how many boats of each size), a difficulty of Easy, Normal, Tricky
or Hard, and a remove-numbers flag. Validation SHALL require width and height at
least 2 and at most 99, fleet size between 1 and 9 and no greater than the larger
of width and height, at least one boat in the fleet, and that the fleet fits in
the grid — matching upstream. A game ID SHALL encode the width, height, fleet
size, difficulty, remove-numbers flag and fleet configuration and round-trip
through decode.

Because Boats has a unique solution, it SHALL declare a `findMistakes` hook so
that Check & Save hard-blocks a save while a provably-wrong cell is present.

#### Scenario: Every preset produces a uniquely soluble board

- **WHEN** a new game is generated for any preset or legal parameter set
- **THEN** a board is produced whose fleet can be located by deduction alone at
  exactly the requested difficulty, with a unique solution

#### Scenario: A game ID round-trips through the parameters

- **WHEN** a parameter set is encoded to a game ID and decoded
- **THEN** the same width, height, fleet size, difficulty, remove-numbers flag and
  fleet configuration are recovered

### Requirement: Boats descriptions use the border-clue and run-length grid encoding

A Boats description SHALL encode, first, the row and column occupancy clues as
`width + height` comma-terminated tokens, each a decimal count or a marker for a
hidden clue (the remove-numbers mechanic); and then the grid in row-major order as
a run-length sequence in which a lowercase letter denotes a run of that many empty
squares and an uppercase letter denotes a single given clue — water or one of the
boat-segment shapes (single, vague/unknown, top, bottom, left, right, centre).

Validation SHALL reject a description that carries the wrong number of grid
squares (distinguishing too much from too little), that carries the wrong number
of border-clue slots, or that uses an unknown character.

#### Scenario: A generated description round-trips

- **WHEN** a description is generated and then decoded into a board
- **THEN** re-encoding that board yields the identical description

#### Scenario: A description with the wrong number of squares is rejected

- **WHEN** a description whose decoded grid area differs from the board area is
  validated
- **THEN** it is rejected with a message distinguishing too much from too little

### Requirement: Boats ports the four-tier deductive solver faithfully

Boats SHALL provide a solver that finds the fleet placement by deduction, or
reports that no deduction completes it. The solver SHALL apply progressively
harder named technique tiers — Easy, Normal, Tricky, Hard — and SHALL report the
highest tier a board actually requires. The solver SHALL NOT guess or backtrack at
any tier, so that every generated board is solvable by pure deduction and Boats
satisfies the guess-free-generation policy at every named difficulty.

Boat connectivity SHALL be computed over the shared disjoint-set structure, whose
canonical root identity the solver reads (the canonical square of a boat run), so
the port SHALL NOT substitute a union-find with a different root rule.

The generator SHALL use the solver to guarantee a unique solution at exactly the
requested difficulty: it SHALL place a random fleet, derive the border clues,
optionally hide border numbers while the board stays soluble, and reject any board
not solvable at exactly the target difficulty. Generation from a given seed SHALL
be reproducible.

#### Scenario: The solver reports the required difficulty

- **WHEN** a soluble board is solved
- **THEN** the returned tier equals the hardest technique tier the deduction
  needed, and the completed grid is the unique solution

#### Scenario: Generation is reproducible from a seed

- **WHEN** the same seed is used twice for the same parameters
- **THEN** both runs produce the identical board description

### Requirement: Boats input, placement, mistakes and completion

Boats SHALL be played by mouse or touch and by keyboard. A left-click SHALL cycle a
cell between empty, a boat segment and water; a right-click SHALL toggle water; a
drag SHALL fill a run along a single row or column; and a keyboard cursor with a
place-segment key, a place-water key and modifier-drag SHALL provide the same
placements. An unknown boat segment SHALL automatically resolve to the correct
shape once its neighbours are known, and a completed boat SHALL be crossed off the
fleet list.

The game SHALL flag provably-wrong cells live: a row or column whose occupancy
count is exceeded, two boats touching even diagonally, a boat of a size the fleet
cannot accommodate, and a placed segment that contradicts a given clue. The
`findMistakes` hook SHALL re-solve the puzzle to its unique solution and report
every placed cell that contradicts it, so that Check & Save also blocks a
locally-legal placement that no solution permits; the live-flagged cells are a
subset of what it reports. Undo and redo SHALL be provided by the engine with no
game-specific state.

Rendering SHALL draw each cell as water or its boat-segment shape, the row and
column count clues on the edges, and the fleet list, with wrong cells and counts in
their error colours; there SHALL be no interpolated animation, and the board SHALL
flash on completion.

#### Scenario: Filling a run of cells along a row

- **WHEN** a drag begins in one cell and ends in another on the same row or column
- **THEN** every cell between them is set to the dragged content in a single move

#### Scenario: A row whose count is exceeded is flagged

- **WHEN** more boat segments are placed in a row than its occupancy clue allows
- **THEN** the offending cells and the count are shown in the error colour and are
  reported by `findMistakes`

#### Scenario: Completing the fleet wins

- **WHEN** the last boat is placed so the whole fleet is located and surrounded by
  water
- **THEN** the game is reported solved and flashes
