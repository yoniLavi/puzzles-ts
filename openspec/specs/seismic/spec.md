# seismic Specification

## Purpose
TBD - created by archiving change add-seismic-ts-port. Update Purpose after archive.
## Requirements
### Requirement: Seismic game implements the Game interface

The engine SHALL provide `src/native/games/seismic/` implementing the `Game`
interface for Seismic (Hakyuu / Ripple Effect), registered so the puzzle is
served by the TypeScript engine.

Parameters SHALL be a width, a height, a difficulty (Easy or Hard), and a game
mode (Seismic or Tectonic). Validation SHALL require width and height at least 4
and a known difficulty, matching upstream. A game ID SHALL encode the width,
height, mode and difficulty and round-trip through decode, with a bare number
decoding as a square grid.

Validation SHALL additionally reject a board of more than 49 cells, with a reason
the Custom-type dialog can display. This is a deliberate divergence from upstream,
which imposes no bound and simply never returns: the generator's region-growing
stage succeeds by chance, and its measured success rate collapses from 1 in 22 at
16 cells to 1 in 200,000 at 49 and to nothing at all at 56 and above. The bound is
set at 49 because that is the largest board upstream itself ships a preset for, so
no configuration either implementation can actually produce is excluded. The
retry loop below the bound SHALL be finite, so a divergence fails with a labelled
error rather than running forever.

The grid SHALL be partitioned into regions, and a region of size N SHALL require
one instance of each number from 1 to N. In Seismic mode two equal numbers Z on
the same row or column SHALL be at least Z cells apart; in Tectonic mode two
equal numbers SHALL NOT be orthogonally or diagonally adjacent. Regions SHALL be
represented on the shared disjoint-set structure, and because the wall layout is
determined by region membership alone, generation from a given seed SHALL be
reproducible without matching any particular canonical-element choice.

#### Scenario: A game ID round-trips through the parameters

- **WHEN** a parameter set is encoded to a game ID and decoded
- **THEN** the same width, height, mode and difficulty are recovered

#### Scenario: Every preset produces a soluble board

- **WHEN** a new game is generated for any preset
- **THEN** a board is produced whose unique solution is reachable by the solver at
  the preset's difficulty band

#### Scenario: A board the generator cannot build is refused up front

- **WHEN** parameters describing more than 49 cells are validated
- **THEN** they are rejected with a stated reason, rather than accepted and left to
  generate indefinitely

### Requirement: Seismic descriptions use the run-length wall and clue encoding

A Seismic description SHALL encode two comma-separated parts: a run-length list of
the region walls over all horizontal borders followed by all vertical borders,
and a run-length list of the clue numbers in row-major order. Runs of walls SHALL
be written as decimal counts and runs of non-walls as letters, and runs of empty
clue cells SHALL be abbreviated with letters; a clue cell SHALL carry its digit.

Validation SHALL reject a description that uses an unknown wall character, that
forms a region larger than nine cells, or that places a clue larger than its
region's size, and SHALL otherwise accept it. Decoding a description SHALL rebuild
the region structure and the fixed clues.

#### Scenario: A generated description round-trips

- **WHEN** a description is generated and then decoded into a board
- **THEN** re-encoding that board yields the identical description

#### Scenario: An over-large clue is rejected

- **WHEN** a description whose clue exceeds the size of its region is validated
- **THEN** it is rejected as an over-large clue

### Requirement: Seismic ports the deductive solver and solver-gated generator

Seismic SHALL provide a solver that fills the grid by candidate elimination — a
naked single and a hidden single within a region at Easy, plus a trial-placement
deduction at Hard — reporting the difficulty reached or that the puzzle is not
uniquely soluble. The solver SHALL enforce the mode's keep-apart rule and the
one-of-each-number-per-region rule while eliminating candidates.

The generator SHALL fill a full valid solution, merge singleton cells into regions
in a randomised order while no region gains a repeated number, strip clues while
the puzzle stays soluble at the target difficulty, and accept a puzzle only when
it is soluble at that difficulty and not at the difficulty below. Generation from
a given seed SHALL be reproducible, reusing the bit-identical random source.

#### Scenario: The solver grades a puzzle's difficulty

- **WHEN** a uniquely soluble puzzle is solved
- **THEN** the solver reports the lowest difficulty at which its deductions
  complete the grid

#### Scenario: Generation is reproducible from a seed

- **WHEN** the same seed is used twice for the same parameters
- **THEN** both runs produce the identical board description

### Requirement: Seismic input, note-taking and completion

Seismic SHALL be played with the Solo control scheme: a left-click or the cursor
keys select a cell for number entry, a right-click selects a cell for pencil
marks, and a mode toggle switches between entering numbers and pencil marks. A
digit SHALL be entered only when it does not exceed the selected cell's region
size, SHALL NOT change a fixed clue, and SHALL be a no-op when it would not change
the cell. The game SHALL offer an on-screen keypad sized to the mode (five numbers
in Tectonic, nine in Seismic) plus a clear key, a mark-all action that fills every
empty cell with all of its region's candidates, a sticky pencil mode preference,
and a pencil-mode indicator.

Rendering SHALL draw the region boundaries, the placed numbers, and the pencil
marks, SHALL highlight a duplicate-in-region or a keep-apart violation in an error
colour as it is entered, and SHALL flash on completion. There SHALL be no move
animation.

#### Scenario: A digit above the region size is rejected

- **WHEN** the player types a digit larger than the selected cell's region size
- **THEN** the board is unchanged

#### Scenario: Completing the grid wins

- **WHEN** the last cell is filled so that every region and keep-apart rule is
  satisfied
- **THEN** the game is reported solved and flashes

### Requirement: Seismic flags mistakes against the unique solution

Because Seismic has a unique solution, it SHALL implement `findMistakes` so that
Check-&-Save can hard-block a save on a wrong board. Given a state, the game SHALL
re-solve from the fixed clues to the unique solution and flag every placed cell
whose value contradicts the solution, and every empty cell whose non-empty pencil
notes have crossed out that cell's solution value. A cell with only extra,
non-contradicting notes SHALL NOT be flagged, and when the givens are not uniquely
soluble no cell SHALL be flagged. The flagged cells SHALL be rendered with a
distinct mistake overlay carried in the render diff key so it repaints on the
frame after the offending move.

#### Scenario: A wrong placement is flagged

- **WHEN** the player enters a number that differs from the unique solution and
  runs Check
- **THEN** that cell is reported as a mistake and Check-&-Save refuses to save

#### Scenario: A crossed-out note is flagged

- **WHEN** an empty cell's pencil notes exclude the value the unique solution
  requires there
- **THEN** that cell is reported as a mistake

#### Scenario: A correct partial board reports no mistakes

- **WHEN** every placed number matches the unique solution and no note crosses out
  a required value
- **THEN** no cell is flagged

