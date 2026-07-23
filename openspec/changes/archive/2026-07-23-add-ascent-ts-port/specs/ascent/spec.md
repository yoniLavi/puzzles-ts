# ascent Specification Delta — add-ascent-ts-port

## ADDED Requirements

### Requirement: Ascent game implements the Game interface

The engine SHALL provide `src/native/games/ascent/` implementing the `Game`
interface for Ascent (Hidoku), registered so the puzzle is served by the
TypeScript engine.

Parameters SHALL be a width, a height, a difficulty (Easy, Normal, Tricky or
Hard), a grid mode (Rectangle, Rectangle-no-diagonals, Hexagon, Honeycomb or
Edges), and the booleans "remove start and end points" and "symmetrical clues".
Validation SHALL require width and height between 2 and 50 with area under 1000,
SHALL require an odd height and a width greater than half the height for Hexagon
mode, and SHALL forbid a 2×2 Edges grid, an Edges difficulty below Normal, and
symmetrical clues in Edges mode — matching upstream. A game ID SHALL encode every
parameter and round-trip through decode.

Because Ascent is a unique-solution logic puzzle, it SHALL implement `findMistakes`
and SHALL be a valid target for a later explained hint (authored as a separate
change).

#### Scenario: Every preset produces a uniquely soluble board

- **WHEN** a new game is generated for any preset or legal size and mode
- **THEN** a board is produced whose clues admit exactly one completion under the
  graded solver

#### Scenario: A game ID round-trips through the parameters

- **WHEN** a parameter set is encoded to a game ID and decoded
- **THEN** the same width, height, difficulty, grid mode and clue flags are
  recovered

### Requirement: Ascent descriptions use the upstream run-length encoding

An Ascent description SHALL encode the padded grid in row-major order: a placed
number as its decimal value (with a separator between two adjacent numbers), a run
of empty cells as a lower-case letter count, and a run of wall cells as an
upper-case letter count, repeating the maximal letter for runs longer than 26. In
Edges mode the arrow clues SHALL be encoded as ordinary numbers on the border
ring, and re-tagged as edge clues on decode.

The physical grid the description covers SHALL be the user-facing size adjusted
for the mode (Honeycomb widened, Edges bordered by two cells on each axis).
Validation SHALL reject a description whose highest number exceeds the cell count,
and SHALL distinguish a description carrying fewer cells than the board from one
carrying more.

#### Scenario: A generated description round-trips

- **WHEN** a description is generated and then decoded into a grid
- **THEN** re-encoding that grid yields the identical description

#### Scenario: A description with the wrong number of cells is rejected

- **WHEN** a description covering more or fewer cells than the physical board is
  validated
- **THEN** it is rejected with a message distinguishing too little from too much

### Requirement: Ascent ports the four-tier deductive solver faithfully

Ascent SHALL provide a solver that finds the unique completion of a graded puzzle,
or reports that it cannot. The solver SHALL be a fixpoint of deduction rules gated
by difficulty — Easy applying only single-position and simple-proximity reasoning,
Normal adding path reasoning, Tricky adding simple single-number reasoning, and
Hard adding full single-number and overlap reasoning. The solver SHALL NOT guess
or backtrack at any difficulty tier.

The generator SHALL use the graded solver to keep every board uniquely soluble at
its target difficulty: it SHALL build a Hamiltonian path by the backbite
algorithm, then either remove clue numbers while the solver still solves
(non-Edges modes, honouring the symmetry and keep-endpoints options) or move
numbers out to arrow clues via a maximal bipartite matching (Edges mode), retrying
until soluble. Generation from a given seed SHALL be reproducible.

#### Scenario: A graded board is solved only at its difficulty

- **WHEN** a board generated at a given difficulty is solved
- **THEN** the graded solver reaches the unique completion at that difficulty, and
  a strictly weaker ruleset does not

#### Scenario: Generation is reproducible from a seed

- **WHEN** the same seed is used twice for the same parameters
- **THEN** both runs produce the identical description

### Requirement: Ascent input, movement and completion

Ascent SHALL be playable by three number-entry methods: clicking a placed number
and then an adjacent cell to place its successor, clicking an empty cell and
typing a multi-digit number, and — in Edges mode — dragging from an arrow clue to
an empty cell on the same row, column or diagonal. It SHALL also support drawing a
path directly by left-dragging across cells and erasing it by right-clicking or
right-dragging, resolving a fully-drawn path into placed numbers. The arrow keys
and Enter SHALL emulate mouse clicks. Ephemeral entry state SHALL live on the UI,
never on the game state, and an input that changes nothing SHALL produce no history
entry.

A move SHALL be modelled as a discriminated union of place, line, clear and solve
operations rather than as an upstream move string. Placing a number on an
immutable (given) cell SHALL be rejected. The game SHALL be completed when every
cell is filled, the numbers form a single path from the lowest to the highest, and
every arrow clue is satisfied.

Because Ascent has a unique solution, `findMistakes` SHALL re-solve the clues and
flag every placed number that contradicts the unique completion, so that Check &
Save hard-blocks on a contradiction. This is distinct from the in-play error
shading that marks a duplicated number or a path segment violating adjacency.

Rendering SHALL draw numbers, walls, drawn path segments and — in Edges mode —
border arrows, SHALL show endpoint candidate hints for a single-number path, and
SHALL flash on completion. Moves SHALL be applied instantly with no interpolated
animation.

#### Scenario: Placing the next number along the path

- **WHEN** a placed number is selected and an adjacent empty cell is chosen
- **THEN** the successor number is placed in that cell

#### Scenario: A wrong number is reported as a mistake

- **WHEN** `findMistakes` runs on a board containing a placed number that differs
  from the unique solution at that cell
- **THEN** that cell is reported as a mistake, and Check & Save refuses to save

#### Scenario: Completing the path wins

- **WHEN** the last move fills the grid so the numbers form a single path from
  lowest to highest and all arrow clues are satisfied
- **THEN** the game is reported solved and flashes
