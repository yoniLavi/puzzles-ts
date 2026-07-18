# rect Specification

## Purpose
TBD - created by archiving change add-rect-ts-port. Update Purpose after archive.
## Requirements
### Requirement: Rectangles game implements the Game interface

The engine SHALL provide a registered `rect` game implementing
`Game<RectParams, RectState, RectMove, RectUi, RectDrawState, RectMistake>`:
divide a `w × h` grid into rectangles so that every rectangle contains exactly
one numbered square and its area equals that number. Params SHALL be `w`, `h`,
`expandfactor` (a non-negative float, default 0) and `unique` (a boolean,
default true), encoded `{w}x{h}` with a full-form `e{%g}` expansion-factor
suffix when non-zero and an `a` suffix when `unique` is false (square shorthand
`{n}`). All 7 upstream presets (7×7, 9×9, 11×11, 13×13, 15×15, 17×17, 19×19)
SHALL be offered. `validateParams` SHALL enforce `w > 0`, `h > 0`, `w*h ≥ 2`,
and a non-negative expansion factor. The game SHALL report `canSolve = true`
and `canFormatAsText = true`, and SHALL drive a completion flash suppressed
after Solve.

#### Scenario: Params round-trip

- **WHEN** params `{ w: 9, h: 7, expandfactor: 0, unique: false }` are encoded
  in full
- **THEN** the result is `9x7a` and decoding it round-trips the params

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is given a grid whose area is less than 2, or a
  negative expansion factor
- **THEN** it returns a non-null error string

### Requirement: Rectangles descriptions use the upstream encoding

The desc SHALL encode the `w × h` grid row-major as a run-length string: a
lowercase-run character `a`–`z` compressing 1–26 consecutive empty (non-numbered)
squares, an optional `_` separator, and a decimal number for each numbered
square. `validateDesc` SHALL reject unknown characters and a description whose
decoded square count does not exactly fill the grid. `newState` SHALL parse the
desc into the immutable grid of numbers, with all edges initially clear and the
correctness overlay computed.

#### Scenario: A description round-trips

- **WHEN** a generated desc is parsed by `newState` and re-encoded
- **THEN** the re-encoded desc equals the original

#### Scenario: A malformed description is rejected

- **WHEN** `validateDesc` is given a desc with too much or too little data to
  fill the grid
- **THEN** it returns a non-null error string

### Requirement: Rectangles ports the solver and solver-gated generator faithfully

The port SHALL implement `rect_solver` with its full deductive power:
per-rectangle candidate-placement enumeration, the overlaps and `rectbyplace`
bookkeeping, and the deduction loop (sole-remaining-number-position marking,
placement-intersection marking, rectangle-focused and square-focused placement
elimination), plus the RNG-driven number-placement winnowing used during
generation. The generator (`new_game_desc`) SHALL be byte-faithful to the C RNG
draw order — base-grid random tiling, singleton removal, the two-pass
expand-and-transpose stretch, the `unique`-gated solver call, and the run-length
desc encoding — so that for a given seed and params the produced desc and `aux`
reproduce the C output exactly. `solve` SHALL run the solver from the fixed
numbers and return the unique solution's edges (or the generator's `aux` when
present).

#### Scenario: Generated boards are uniquely solvable

- **WHEN** a board is generated with `unique = true` and solved from its numbers
- **THEN** the solver reaches a single consistent rectangle placement for every
  number

#### Scenario: Desc reproduces the C reference byte for byte

- **WHEN** `newDesc` runs for a fixture's seed and params
- **THEN** the produced desc and `aux` equal the recorded C values exactly

### Requirement: Rectangles reports completion and mistakes

The port SHALL compute per-cell correctness faithfully to `get_correct`: a cell
is correct iff it belongs to a valid rectangle — all boundary edges present,
none interior, and exactly one contained number equal to the rectangle's area.
The board is completed when every cell is correct. Because boards are uniquely
solvable, the game SHALL implement `findMistakes`: re-solve from the numbers to
the unique solution's edges and return every edge the player has drawn that the
unique solution does not contain (a definite mistake); a *missing* edge is not a
mistake, and a non-uniquely-solvable board yields no mistakes. Check & Save
depends on this hook and SHALL refuse to save while any mistake is present.

#### Scenario: A wall the solution does not contain is flagged

- **WHEN** the player has drawn an edge that the unique solution does not
  contain, and `findMistakes` is invoked
- **THEN** that edge is returned as a mistake

#### Scenario: A correct partial board has no mistakes

- **WHEN** the player has drawn only edges that the unique solution contains
- **THEN** `findMistakes` returns an empty result

### Requirement: Rectangles input and rendering

`interpretMove` SHALL support: a left-drag drawing a rectangle outline, a
right-drag erasing interior edges, a click near an edge toggling that single
edge, and a half-grid keyboard cursor with press-to-drag — with the
corner/centre/edge click allocation of `coord_round` ported exactly. A drag or
click that changes no edge SHALL produce no move. `redraw` SHALL render the grid,
number text, the three edge colours (black solid line, red drag-draw preview,
blue drag-erase preview), the computed corner pixels, the grey correct-rectangle
fill, the cursor tile, the flagged-mistake edge colour, and the completion
flash, with the palette index-for-index against the upstream colour enum and a
`BORDER` of 1 (NARROW_BORDERS).

#### Scenario: A drag draws a rectangle outline

- **WHEN** the player left-drags from one grid vertex to another spanning a
  rectangle
- **THEN** `interpretMove` yields a rectangle move whose execution sets the four
  boundary edges of that rectangle and clears its interior edges

#### Scenario: A no-op click yields no move

- **WHEN** the player clicks in a way that would change no edge
- **THEN** `interpretMove` yields no move (returns null or a UI update only)

