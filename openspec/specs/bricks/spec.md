# bricks Specification

## Purpose
TBD - created by archiving change add-bricks-ts-port. Update Purpose after archive.
## Requirements
### Requirement: Bricks game implements the Game interface

The engine SHALL provide `src/native/games/bricks/` implementing the `Game`
interface for Bricks (Tawamurenga), registered so the puzzle is served by the
TypeScript engine.

Parameters SHALL be a width, a height and a difficulty (Easy, Normal or Tricky).
Validation SHALL require width at least 2, height at least 2, and a known
difficulty. A game ID SHALL encode the width, height and difficulty and round-trip
through decode.

The board SHALL be a hexagon stored as a padded parallelogram: the actual grid
width SHALL be the parameter width plus the ceiling of half the height minus one,
with the two triangular corners masked as boundary cells, leaving exactly
width-by-height playable cells. Neighbours SHALL be the fixed six-direction hex
step set. This geometry SHALL be bespoke and SHALL NOT depend on the shared grid
tiling engine.

#### Scenario: Every preset produces a soluble board

- **WHEN** a new game is generated for any preset or legal size
- **THEN** a board is produced whose unique solution the solver reaches, marking it
  complete

#### Scenario: A game ID round-trips through the parameters

- **WHEN** a parameter set is encoded to a game ID and decoded
- **THEN** the same width, height and difficulty are recovered

### Requirement: Bricks descriptions use the run-length cell encoding

A Bricks description SHALL encode only the playable cells in canonical
left-to-right, top-to-bottom order: each numbered cell as its decimal value with a
separator inserted between two adjacent numbers, and each run of playable
(non-numbered) cells as a run-length lowercase count. Boundary cells SHALL be
re-derived from the geometry and SHALL NOT appear in the description.

Validation SHALL reject a description that decodes to more or fewer playable cells
than the board holds, distinguishing too many from too few, and SHALL reject a clue
value out of range.

#### Scenario: A generated description round-trips

- **WHEN** a description is generated and then decoded into a board
- **THEN** re-encoding that board yields the identical description

#### Scenario: A description with the wrong number of cells is rejected

- **WHEN** a description that decodes to more or fewer playable cells than the board
  has is validated
- **THEN** it is rejected with a message distinguishing too many from too few

### Requirement: Bricks ports the deductive solver and generator faithfully

Bricks SHALL provide a solver that decides whether a grid is complete, still
unfinished, or invalid, from three rules: no three consecutive shaded cells in a
horizontal line, every shaded cell supported by a shaded cell below it, and every
numbered cell's shaded-neighbour count consistent with its clue. The solver SHALL
place cells by contradiction — tentatively shading or unshading a cell and forcing
the opposite when that leads to an invalid grid — with bounded lookahead for the
harder difficulties. Every difficulty tier SHALL be solvable by pure deduction; the
solver SHALL NOT rely on guessing.

The generator SHALL use the solver to keep every puzzle uniquely solvable at its
target difficulty: it SHALL fill the grid under the support and run-length
constraints, number it, then remove numbers in a randomised order, keeping a
removal only while the puzzle stays uniquely solvable. Generation from a given seed
SHALL be reproducible.

#### Scenario: The solver reaches the unique solution

- **WHEN** a generated board is solved
- **THEN** the solver marks it complete and its cells match the intended solution

#### Scenario: Generation is reproducible from a seed

- **WHEN** the same seed is used twice for the same parameters
- **THEN** both runs produce the identical board description

### Requirement: Bricks input, mistake-checking and completion

Bricks SHALL be played by clicking or dragging to cycle a cell between shaded,
unshaded and empty, with the right button cycling in the reverse direction, and by a
hexagon-aware keyboard cursor. A numbered cell SHALL never be shadeable. Moving the
cursor up or down SHALL alternate between an orthogonal and a diagonal step to
follow the hexagonal grid.

Because Bricks is uniquely solvable and every rule violation is localised, it SHALL
provide a `findMistakes` hook that reports the offending cells, so that Check & Save
hard-blocks while a mistake is present. Rule violations SHALL additionally be shown
live during play — three-in-a-row bars, gravity error diamonds, and over-count
numbers.

The game SHALL be reported complete when the grid satisfies all three rules with no
cell left empty, and SHALL flash on completion. There SHALL be no interpolated
animation.

#### Scenario: Dragging paints a run of cells

- **WHEN** the player presses on a cell and drags across further playable cells
- **THEN** on release every dragged playable cell is set to the drag's colour in a
  single move

#### Scenario: A mistake blocks Check & Save

- **WHEN** the grid contains a rule violation and the player invokes Check & Save
- **THEN** `findMistakes` reports the offending cells and the save is blocked

#### Scenario: Satisfying every rule wins

- **WHEN** the last empty cell is set so that all three rules hold
- **THEN** the game is reported complete and flashes

### Requirement: Bricks provides an explained deduction hint

Bricks SHALL implement the `hint` and `hintKeepTrack` hooks so a player can ask
why the next move is forced. A hint SHALL be computed from the game's own
contradiction solver — the solver and the hint SHALL be two projections of one
deduction engine — so that every hinted move corresponds to a deduction the
solver can make from the player's current position, and the plan SHALL be
recompute-stable: a deterministic scan order, so a hint recomputed after a
followed move continues where the previous plan left off.

Each hint step SHALL explain *why* the move is forced, not merely which cell to
act on: for a single-cell contradiction it SHALL name the concrete rule the
opposite colour would violate — three shaded bricks in a horizontal row, a shaded
brick with no shaded brick beneath it to rest on, or a clue that the change would
push above or below its shaded-neighbour count — stating the premise, the
contradiction, and the conclusion in the necessity voice. The forced cell SHALL
be highlighted as the hint target and the deduction's evidence cells SHALL be
marked distinctly on the board so the reasoning is visible and not only in prose.
The hint SHALL NOT pre-place the forced colour. Because every Bricks deduction
forces exactly one cell, each hint step SHALL be a single self-contained journey.

A move that is forced only through the solver's recursive lookahead SHALL be
presented as one step narrated as a proof by contradiction: the hypothesis (the
cell taken as shaded or clear) and the contradiction its forced consequences
reach, with the cell(s) where the board breaks marked — never an un-narrated
"only one option fits" fallback. At each lookahead stall the deduction SHALL be
chosen deterministically so the plan stays recompute-stable.

A hint SHALL be refused, with an explanatory banner, when the board is already
solved, when the board contains a rule violation (as reported by
`findMistakes`), or when the player's placed cells contradict the unique solution
without yet breaking a local rule — in the last case the banner SHALL say a
placed cell must be wrong rather than deduce onward from a doomed position.

#### Scenario: A forced move is explained by the rule it would break

- **WHEN** a hint is requested on a solvable, mistake-free board where a
  single-cell contradiction is available
- **THEN** the forced cell is highlighted as the target, its evidence cells are
  marked, and the explanation names the rule (three-in-a-row, a brick left
  unsupported, or a clue's neighbour count) that the opposite colour would
  violate, without pre-placing the forced colour

#### Scenario: A lookahead deduction is narrated as a proof by contradiction

- **WHEN** the next forced move follows only from the recursive lookahead rung
- **THEN** it is presented as one hint step whose narration states the hypothesis
  and the contradiction its forced consequences reach, with the contradiction
  cell(s) marked on the board

#### Scenario: A hint is refused on a solved, mistaken, or wrong-but-legal board

- **WHEN** a hint is requested on a board that is solved, that contains a
  rule-violating cell, or whose placed cells contradict the unique solution
  without yet breaking a local rule
- **THEN** no move is hinted and an explanatory banner is shown, and for the
  last case the banner states that a placed cell must be wrong

