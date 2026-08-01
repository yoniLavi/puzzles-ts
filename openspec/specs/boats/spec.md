# boats Specification

## Purpose
TBD - created by archiving change add-boats-ts-port. Update Purpose after archive.
## Requirements
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

The run-length sequence SHALL be written so that a run is emitted only when a
given clue follows it or the run reaches the maximum a single letter can carry,
which means a description whose final squares carry no clue legitimately encodes
short — a board with no given clues at all encodes as its border clues alone.

Validation SHALL reject a description that carries **more** grid squares than
the board holds, that carries the wrong number of border-clue slots
(distinguishing too many from too few), or that uses an unknown character. It
SHALL NOT reject a description that carries fewer grid squares than the board
holds, since that is the ordinary encoding of a board whose last squares have no
clue.

#### Scenario: A generated description round-trips

- **WHEN** a description is generated and then decoded into a board
- **THEN** re-encoding that board yields the identical description

#### Scenario: A description with too many squares is rejected

- **WHEN** a description whose decoded grid area exceeds the board area is
  validated
- **THEN** it is rejected

#### Scenario: A description with no given clues is accepted

- **WHEN** a description carrying the right number of border clues and no grid
  clues at all is validated
- **THEN** it is accepted, and decodes to a board with no given squares

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

The solver's deductive power is **not monotone in its difficulty cap**: the
unfinished-boat disjoint-set check, which runs only from the second tier upward,
can report a contradiction on a board that has none and abandon the solve. It
never places a wrong square, so every generated board remains correct and
uniquely solvable, but a board generated at the easiest tier may fail to solve
under a higher cap. Any consumer that solves a board of unknown difficulty —
Solve, and the mistake check — SHALL therefore try each difficulty tier and use
the first that succeeds, rather than solving once at the maximum.

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

#### Scenario: Completing the fleet wins, without filling in the water

- **WHEN** the last boat is placed so that every row and column count is met and
  the fleet is exactly accounted for
- **THEN** the game is reported solved and flashes, even if squares the player
  never marked as water remain undecided

### Requirement: Boats explains its next deduction

Boats SHALL provide an explained hint that computes a plan of forced moves from
the player's current board and narrates each one by the deduction that forces it,
meeting the project's hint quality bar: the narration SHALL state *why* the move
is forced — the premise that singles out this conclusion — and not merely what to
place.

The hint SHALL be derived from the same deduction engine as the solver, replayed
one firing at a time, and SHALL NOT alter the solver, the generator or the
description codec.

Because the solver is not monotone in its difficulty cap, the hint SHALL replay
the deduction at the **lowest** cap at which the board solves, so that a board
generated at an easy tier is taught the easy technique that suffices.

Every named technique SHALL be narratable — Boats guesses at no tier, so the hint
SHALL NOT fall back on an unexplained "this is the only possibility" step.

#### Scenario: A hint names the technique that forces the move

- **WHEN** a hint is requested on a board where a row already shows all the ships
  its number allows
- **THEN** the remaining squares in that row are offered as water, and the
  explanation states that the row's number is already met

#### Scenario: A hint on an easy board teaches an easy technique

- **WHEN** a hint is requested on a board generated at the easiest difficulty
- **THEN** a plan is produced, and it is the deduction that difficulty admits
  rather than a harder refutation reaching the same square

#### Scenario: A refutation names the rule the alternative would break

- **WHEN** a square is forced only because the opposite placement immediately
  contradicts the board
- **THEN** the explanation names the specific rule that would break — a line's
  number, two boats touching, or a boat the fleet cannot hold — rather than
  asserting the square is forced without reason

### Requirement: One deduction is one hint

A single deduction that forces several squares SHALL be presented as **one**
hint — a multi-leg journey whose continuation legs are marked as continuing the
previous one — rather than as several disjoint hints. Squares that follow from a
placement by the never-touch rule SHALL be shown as part of that step rather than
narrated as further deductions.

Forced squares and the evidence they are deduced from SHALL be visually distinct,
and the two kinds of placement Boats admits — a boat segment and water — SHALL be
marked in the shape of the action each represents, so that one hint colour cannot
stand for two different actions.

#### Scenario: A line filled by one deduction is a single hint

- **WHEN** a deduction completes a whole row with water
- **THEN** one hint is presented covering every square in that row, not one hint
  per square

### Requirement: Boats refuses to hint a board it cannot honestly advise

The hint SHALL refuse, with a reason, when the board is already solved, when the
player has placed a square that contradicts the puzzle's unique solution, or when
no further deduction is available. On the mistake refusal it SHALL surface the
offending squares through the existing mistake overlay.

A placement that breaks no rule yet but that no solution permits SHALL be treated
as a mistake for this purpose, so that the hint never reasons onward from a board
that cannot be completed.

#### Scenario: A wrong-but-legal placement is refused rather than reasoned from

- **WHEN** a hint is requested on a board carrying a boat segment that breaks no
  rule but appears in no solution
- **THEN** the hint refuses and the offending square is highlighted, rather than a
  plan being computed from the unsolvable position

### Requirement: The fleet display fits the canvas for every legal fleet

The inventory of boats drawn beneath the board SHALL be laid out entirely within
the width the game reports for its canvas, for every fleet configuration
parameter validation admits. Rows SHALL break between whole batches of one boat
size, keeping a size's boats together, **and** within a batch that is itself too
wide for a row — a fleet holding more boats of one size than fit across the board
otherwise draws past the right edge, which upstream records as a known defect
(`TODO ui: Certain custom fleets don't fit in the UI`).

The layout SHALL be computed once and shared by the size calculation and the
renderer, so the reported canvas height always matches the number of rows drawn.
Wherever upstream's batch-only layout stayed inside the row limit, the layout
SHALL be identical to it.

#### Scenario: A fleet wider than one row wraps instead of overflowing

- **WHEN** the fleet holds more boats of one size than fit across the board
- **THEN** that batch wraps onto a further row, every boat is drawn inside the
  canvas width, and the reported canvas is tall enough for the extra row

#### Scenario: A fleet that already fitted is laid out unchanged

- **WHEN** a fleet whose every batch fits within a row is drawn
- **THEN** each size's boats stay together on one row, positioned as before

