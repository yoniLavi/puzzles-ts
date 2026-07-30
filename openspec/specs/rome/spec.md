# rome Specification

## Purpose
TBD - created by archiving change add-rome-ts-port. Update Purpose after archive.
## Requirements
### Requirement: Rome game implements the Game interface

The engine SHALL provide `src/native/games/rome/` implementing the `Game`
interface for Rome (Nikoli's *Roma*), registered so the puzzle is served by the
TypeScript engine.

Parameters SHALL be a width, a height, and a difficulty (Easy, Normal or
Tricky). Validation SHALL require width at least 3 and height at least 3 and a
difficulty within range, matching upstream. A game ID SHALL encode the width,
height and difficulty and round-trip through decode, treating an absent `x` as a
square board.

Because Rome is a uniquely-solvable logic puzzle whose difficulty tiers are all
pure deduction, it SHALL implement `findMistakes`, and Check & Save SHALL
hard-block while any mistake is present.

Rome SHALL offer the two upstream highlight preferences — highlighting the
squares whose arrows reach a goal, and highlighting the squares of a loop —
with upstream's defaults (the first on, the second off).

#### Scenario: Every preset produces a soluble board

- **WHEN** a new game is generated for any preset or legal size and difficulty
- **THEN** a board is produced that is solvable by pure deduction at exactly that
  difficulty

#### Scenario: A game ID round-trips through the parameters

- **WHEN** a parameter set is encoded to a game ID and decoded
- **THEN** the same width, height and difficulty are recovered

### Requirement: Rome descriptions use the region-border and clue encoding

A Rome description SHALL encode the outlined-region layout as a run-length list
over the inter-cell edges — a digit for a run of walls, a letter for a run of
non-walls (with the letter `z` denoting a maximal run with no trailing wall) —
followed by the clue grid as a run-length sequence in which letters denote runs
of empty squares and the characters `U`, `D`, `L`, `R` and `X` denote fixed
up/down/left/right arrows and goals.

Validation SHALL reject a description that uses invalid region-border
characters, that uses invalid clue characters, that contains a region larger
than four cells, or that places a goal in a region whose size is not exactly one.

#### Scenario: A generated description round-trips

- **WHEN** a description is generated and then decoded into a board and
  re-encoded
- **THEN** the resulting description is identical

#### Scenario: A goal in an oversized region is rejected

- **WHEN** a description placing a goal in a region larger than a single cell is
  validated
- **THEN** it is rejected

### Requirement: Rome ports the deductive solver and generator faithfully

Rome SHALL provide a solver that fills the grid by pure deduction, or reports
that the board is invalid or incomplete. Validity SHALL be judged by merging
each arrow with the square it points at into a disjoint-set forest and flagging
any arrow that points off the grid, any duplicate arrow within an outlined
region, and any arrow that forms a loop. The solver SHALL apply the upstream
deduction rules in the upstream order, gated by difficulty — Easy, then the
additional Normal rules, then the additional Tricky rule — and SHALL NOT
backtrack or guess at any difficulty.

The generator SHALL use the solver to keep every board soluble: it SHALL fill
the grid with arrows in single-cell regions, merge outlined regions randomly
while keeping arrows within a region distinct, and remove redundant clues,
accepting a board only when it is soluble at the target difficulty and not
soluble at the difficulty below. Generation from a given seed SHALL be
reproducible over the shared bit-identical RNG.

#### Scenario: The solver completes a soluble board without guessing

- **WHEN** a soluble board is solved at its difficulty
- **THEN** every square is filled by deduction and the result reaches a goal from
  every square with no loops and no duplicate arrows in any region

#### Scenario: Generation is reproducible from a seed

- **WHEN** the same size, difficulty and seed are used twice
- **THEN** both runs produce the identical board description

### Requirement: Rome input, arrow placement, pencil marks and completion

Rome SHALL be played by grabbing a square and dragging a direction to place an
arrow, by right-dragging or using the pencil key to toggle a pencil mark, or by
moving a keyboard cursor and placing an arrow or mark. A move onto a fixed clue,
a move off the grid, or a placement that repeats the existing arrow SHALL
produce no state change and no history entry. Pencil marks SHALL be part of the
state and SHALL round-trip through the save codec.

Placing an arrow SHALL show it, and completing the board — every square filled
with arrows leading to a goal, no loop, no off-grid arrow and no duplicate arrow
within a region — SHALL report the game solved. Rendering SHALL draw the region
outlines, arrows and goals, pencil marks in the cell quadrants, an optional
highlight of squares whose arrows reach a goal, an inline error tint for
off-grid and duplicate arrows, and a completion flash. There SHALL be no
interpolated arrow animation.

#### Scenario: Dragging a direction places an arrow

- **WHEN** a non-fixed square is grabbed and a direction is dragged and released
- **THEN** an arrow in that direction is placed in the square

#### Scenario: Completing the grid wins

- **WHEN** the final arrow is placed so every square leads to a goal with no loop
  and no duplicate arrow in any region
- **THEN** the game is reported solved and flashes

#### Scenario: A duplicate arrow in a region is flagged as a mistake

- **WHEN** two squares in the same outlined region hold the same arrow direction
- **THEN** `findMistakes` flags both squares and Check & Save is hard-blocked

### Requirement: Rome mistake-checking covers arrows that break no rule

Mistake-checking SHALL report both the rule violations the board already shows
as the player works — an arrow pointing off the grid, an arrow duplicated inside
an outlined region, and an arrow that forms a loop — and, separately, any arrow
the player has placed that contradicts the puzzle's unique solution even though
it breaks no rule. The unique solution SHALL be re-derived from the fixed clues
alone, never from anything the player has entered, and when the board is not
deducible from those clues no contradiction SHALL be reported.

An empty square SHALL NOT be reported as a mistake, and a pencil mark SHALL NOT
be reported as a mistake however it disagrees with the solution, because Rome's
pencil marks carry no fixed meaning.

#### Scenario: A legal-looking arrow that contradicts the solution is flagged

- **WHEN** an arrow is placed that breaks no rule but differs from the unique
  solution's arrow for that square
- **THEN** it is reported as a mistake and Check & Save is hard-blocked

#### Scenario: Pencil marks are never mistakes

- **WHEN** a square carries pencil marks that exclude the solution's direction
- **THEN** no mistake is reported for that square

