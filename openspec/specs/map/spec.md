# map Specification

## Purpose
TBD - created by archiving change add-map-ts-port. Update Purpose after archive.
## Requirements
### Requirement: Map game implements the Game interface

The engine SHALL provide a registered `map` game implementing
`Game<MapParams, MapState, MapMove, MapUi, MapDrawState, MapMistake>`: colour
every region of a map so that no two adjacent regions share a colour, given some
regions pre-coloured as immutable clues. Params SHALL be `w`, `h`, `n` (number
of regions) and `diff` (one of Easy, Normal, Hard, Unreasonable), encoded
`{w}x{h}n{n}` with a full-form `d{char}` difficulty suffix (chars `e`/`n`/`h`/`u`).
`decodeParams` SHALL be lenient: an omitted `xH` defaults height to width, an
omitted `nN` defaults `n` to `w*h/8`, a `.` in the region count is tolerated
(truncated), and an unknown difficulty char is ignored. All 6 upstream landscape
presets (20×15 with 30 regions at each difficulty, and 30×25 with 75 regions at
Normal and Hard) SHALL be offered. `validateParams` SHALL enforce `w ≥ 2`,
`h ≥ 2`, `n ≥ 5`, `n ≤ w*h`, and the width×height overflow guard. The game SHALL
report `canSolve = true` and `canFormatAsText = true`, and SHALL drive a
completion flash suppressed after Solve.

#### Scenario: Params round-trip

- **WHEN** params `{ w: 20, h: 15, n: 30, diff: Normal }` are encoded in full
- **THEN** the result is `20x15n30dn` and decoding it round-trips the params

#### Scenario: Lenient decode

- **WHEN** `decodeParams` is given `12` (no height, no region count, no
  difficulty)
- **THEN** it yields `w = 12`, `h = 12`, `n = 12*12/8`, and the default
  difficulty

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is given fewer than five regions, or more regions
  than grid squares
- **THEN** it returns a non-null error string

### Requirement: Map descriptions use the upstream two-part encoding

The desc SHALL encode the region boundaries and the clue colours as two
comma-separated run-length parts: first the edge list — alternating runs of
edge/non-edge walked across all horizontal edges (row by row) then all vertical
edges (column by column), lowercase letters giving run lengths with the upstream
`z` "run of 25, no state switch" special case and a notional leading non-edge;
then the clue list — digits `0`–`3` for region clue colours interspersed with
lowercase letters giving run lengths of unclued regions (with `z` meaning a run
of 26). `validateDesc` SHALL rebuild the regions from the edge list via a
union-find over non-edges and reject an unknown character, an edge list that
defines the wrong number of regions, and a clue list whose region count does not
equal `n`. `newState` SHALL parse the desc into the immutable region structure
(the four-quadrant map, the adjacency graph, the clue colouring), run the
desc-seeded diagonal-smoothing pass, and compute the canonical edge/region label
points.

#### Scenario: A description round-trips

- **WHEN** a generated desc is parsed by `newState` and re-encoded
- **THEN** the re-encoded desc equals the original

#### Scenario: A malformed description is rejected

- **WHEN** `validateDesc` is given a desc whose clue list defines a region count
  other than `n`, or whose edge list defines the wrong number of regions
- **THEN** it returns a non-null error string

### Requirement: Map ports the graded solver and solver-gated generator faithfully

The port SHALL implement `map_solver` with its full graded deductive power over
the region-adjacency graph: at Easy, place a region that has exactly one possible
colour left; at Normal, additionally exclude a shared colour pair from the common
neighbours of an adjacent same-two-possibilities pair; at Hard, additionally run
the forcing-chain BFS; at Unreasonable, additionally recurse (guess and verify).
The solver SHALL return the three-valued verdict (impossible / unique / stuck-or-
ambiguous), and a grading routine SHALL return the easiest difficulty that yields
a unique solution. The generator (`new_game_desc`) SHALL be byte-faithful to the
C RNG draw order — voronoi region growth over the cumulative-frequency table, the
recursive four-colouring, the solver-gated clue reduction that never removes the
last region of a colour, and the difficulty-floor retry loop — so that for a
given seed and params the produced desc and aux reproduce the C output exactly.
`solve` SHALL return the generator's aux when present, else re-solve from the
clues at maximum difficulty.

#### Scenario: Generated boards are uniquely solvable at their difficulty

- **WHEN** a board is generated for a given difficulty and graded by the TS
  solver
- **THEN** the grading is a unique solution at exactly the requested difficulty
  (or the generator's documented fallback for pathologically dense/sparse maps)

#### Scenario: Desc reproduces the C reference byte for byte

- **WHEN** `newDesc` runs for a fixture's seed and params
- **THEN** the produced desc and aux equal the recorded C values exactly, and the
  TS solver grades the decoded board at the C-recorded difficulty

### Requirement: Map reports completion and mistakes

The board SHALL be completed when every region is coloured and no two adjacent
regions share a colour. Because boards are uniquely solvable, the game SHALL
implement `findMistakes`: re-solve from the immutable clues to the unique
solution and return every region whose player-assigned colour differs from it (a
definite mistake); a non-uniquely-solvable board yields no mistakes, and an
uncoloured region is never a mistake. Check & Save depends on this hook and SHALL
refuse to save while any mistake is present. The always-on red adjacency error
markers (drawn where two adjacent coloured regions clash) SHALL remain,
independent of `findMistakes`.

#### Scenario: A region coloured against the unique solution is flagged

- **WHEN** the player colours a region a colour the unique solution does not give
  it, and `findMistakes` is invoked
- **THEN** that region is returned as a mistake

#### Scenario: A partially-coloured but correct board has no mistakes

- **WHEN** the player has coloured only regions in agreement with the unique
  solution
- **THEN** `findMistakes` returns an empty result

### Requirement: Map input, preferences and rendering

`interpretMove` SHALL support: a press that picks up the colour of the region
under the pointer (or, on a blank region, its pencil marks) into a floating drag
blob; a release that drops the held colour onto the region under the pointer; a
right-drag from a colour to a blank region that toggles a single pencil-mark bit;
and a keyboard cursor that picks and drops via the select keys — with the
diagonally-split-cell quadrant hit-test of `region_from_coords` ported exactly. A
drop that changes nothing SHALL produce no move. Pencilling a coloured region
SHALL be rejected. The three upstream preferences (victory-flash effect,
number-regions, stipple display style) SHALL be exposed through the `prefs` hook
with the upstream keyword slugs, stored on the `Ui` with `newUi` defaults, and
the `l`/`L` key SHALL toggle region numbers in play. `redraw` SHALL render region
fills, the diagonal second-region triangle of a split cell, pencil-mark stipples,
grid lines on region boundaries, the red adjacency error diamonds, optional
region numbers, the flagged-mistake region outline, the floating drag/cursor
blob (a blitter sprite), and the selected completion-flash style — with the
palette index-for-index against the upstream colour enum and a `BORDER` of 0
(NARROW_BORDERS).

#### Scenario: A drag colours a region

- **WHEN** the player presses on a coloured region and releases on an adjacent
  blank region
- **THEN** `interpretMove` yields a move whose execution sets the blank region to
  the held colour

#### Scenario: A no-op drop yields no move

- **WHEN** the player drops a colour onto a region that already holds it (or onto
  the border, or onto an immutable clue region)
- **THEN** `interpretMove` yields no move (returns null or a UI update only)

