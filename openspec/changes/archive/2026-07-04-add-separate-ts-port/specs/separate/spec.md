# separate Specification

## ADDED Requirements

### Requirement: Separate game implements the Game interface

The engine SHALL provide a registered `separate` game implementing
`Game<SeparateParams, SeparateState, SeparateMove, SeparateUi, SeparateDrawState>`:
the grid-partition puzzle ("Block Puzzle") on a `w × h` grid in which every cell
holds one of `k` letters, each letter occurring `w·h/k` times, and the player
divides the grid into disjoint connected `k`-ominoes such that each region
contains exactly one of each letter. Params SHALL be `w`, `h`, and `k`
(positive integers), encoded `{w}x{h}n{k}` with a bare `{w}` decoding to a
square `w × w` grid with `k = w`. `validateParams` SHALL reject a non-positive
dimension, a `k` that does not divide `w·h`, an unreasonably large `w·h`, and (on
a full validation) `k` equal to the whole grid. The game SHALL offer a menu of
presets, report `canSolve = true` and `canFormatAsText = true`, and drive a
solve-completion flash.

#### Scenario: Params round-trip

- **WHEN** params `{ w: 6, h: 6, k: 4 }` are encoded
- **THEN** the result is `6x6n4`
- **AND** decoding it round-trips the params
- **AND** decoding a bare `5` yields `{ w: 5, h: 5, k: 5 }`

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is called with a non-positive dimension, or a `k`
  that does not divide `w·h`
- **THEN** it returns a non-null error string

### Requirement: Separate descriptions encode the letters grid

The desc SHALL be the `w·h` letters in row-major order, each an uppercase letter
`A + grid[i]` (so `k` distinct letters `A..`), exactly as upstream's
`new_game_desc` emits. `validateDesc` SHALL reject a desc of the wrong length or
containing a character outside `A .. A+k-1`. `newState` SHALL parse the desc into
the immutable letters array and an all-unknown wall state (only the grid rim
walls set), `completed` and `cheated` both false.

#### Scenario: A description round-trips

- **WHEN** a generated desc is parsed by `newState` and its letters are
  re-encoded
- **THEN** the re-encoded desc equals the original

#### Scenario: A malformed description is rejected

- **WHEN** `validateDesc` is given a desc of the wrong length or with a letter
  outside the alphabet `A .. A+k-1`
- **THEN** it returns a non-null error string

### Requirement: Separate uses a three-valued wall model with a half-grid cursor

The player SHALL divide the grid by toggling edges, each three-valued (wall /
no-wall mark / unknown) and shared between the two cells it separates so every
edit records both sides, exactly as Palisade. A left click SHALL cycle the edge
nearest the pointer through wall ↔ unknown; a right click through no-wall-mark ↔
unknown. A half-grid keyboard cursor (corner/edge/centre coordinates in
`[1, 2w-1] × [1, 2h-1]`) SHALL move with the arrow keys and set the adjacent edge
with select/select2. Toggling a grid-rim wall SHALL be rejected. A move that
changes nothing SHALL return `null` (no history entry).

#### Scenario: Clicking an interior edge toggles a wall on both sides

- **WHEN** the player left-clicks near the shared edge between two adjacent cells
- **THEN** the returned move sets the wall bit on that edge of both cells
- **AND** re-applying the same click clears it

#### Scenario: Rim walls cannot be toggled

- **WHEN** a move would toggle a wall on the outer boundary of the grid
- **THEN** `executeMove` rejects it

### Requirement: Separate is solved when every region is a one-of-each k-omino

A state SHALL be solved iff the walls divide the grid into connected components
each of exactly `k` cells, each component containing each of the `k` letters
exactly once, and no wall lies interior to a component. `status` SHALL report
`solved` in that case and `ongoing` otherwise.

#### Scenario: A correct partition is solved

- **WHEN** the walls partition the grid into `k`-ominoes each holding one of each
  letter
- **THEN** `status` reports `solved`

#### Scenario: A duplicate-letter region is not solved

- **WHEN** a wall-bounded region has size `k` but contains a repeated letter
- **THEN** `status` reports `ongoing`

### Requirement: Separate ports the DSF solver and gates generation on it

The port SHALL implement the upstream `solver_attempt` deductions over a
disjoint-set forest of squares — (1) mark two components disconnected when
adjacent squares belong to distinct components that already share a letter, and
(2) connect an under-size component that has exactly one legal way to extend —
run to a fixpoint, reporting solved / progressed / stuck. `solve()` SHALL run the
solver to the unique partition and return a move that draws a wall on every edge
between two different components (reporting failure if the board is not uniquely
deducible). The generator SHALL build a random `k`-omino partition with
`divvyRectangle`, then repeatedly fill each omino with a shuffled set of the `k`
letters (respecting the squares the solver has already depended on) and re-solve,
keeping a board only when the solver fully solves it — so every generated board
is uniquely solvable by the ported solver. All RNG draws SHALL go through the
bit-identical `random.ts`.

#### Scenario: Generated boards are uniquely solvable

- **WHEN** the generator produces a board for given params
- **THEN** the ported solver run to a fixpoint partitions it into `k`-ominoes
  each holding one of each letter

#### Scenario: Solve draws the unique partition's walls

- **WHEN** `solve()` is invoked on a generated board
- **THEN** the returned move yields a solved state

### Requirement: Separate shades completed correct regions

The render SHALL shade a wall-bounded region with the shared completed-region colour (a neutral `COL_CORRECT` grey, matching Rectangles) once
it is a completed, correct region — exactly `k` cells, holding one of each letter
(no duplicate), with no wall interior to it — giving the player the same
local-correctness feedback Galaxies and Rectangles give. The untouched board
(one undivided region) SHALL NOT be shaded. The shading is a local check on the
region as drawn, not a check against the unique solution. The valid overlay SHALL
be part of the render cache diff key so it appears and clears as regions are
completed and broken.

#### Scenario: A completed region is shaded, the rest is not

- **WHEN** the player seals one region of the unique solution (its full boundary)
  while the rest of the grid is still undivided
- **THEN** exactly that region's `k` cells render with the `COL_CORRECT` background
- **AND** the untouched remainder does not

### Requirement: Separate ships findMistakes for Check & Save

Because Separate is uniquely solvable, the game SHALL implement `findMistakes`:
re-solve the fixed letters to the unique partition and return every player edge
whose state contradicts it — a wall where the solution has none, or a no-wall
mark where the solution has a wall. The flagged edges SHALL render with a
distinct error overlay, and the overlay SHALL be part of the render cache diff
key so it repaints on the frame Check & Save runs (playbook §3.2). When the board
is not uniquely deducible `findMistakes` SHALL return an empty list.

#### Scenario: A contradicting wall is flagged

- **WHEN** the player draws a wall that the unique solution does not have and
  Check & Save runs
- **THEN** `findMistakes` includes that edge and it renders in the error colour

### Requirement: Separate is registered, catalogued, and its C is deleted

On owner-accepted full behavioural parity, `separate` SHALL be registered in the
TS game registry, moved from `puzzles/unfinished/CMakeLists.txt` into the main
catalog with `TS_PORTED` (so it lists in the catalog and ships its two per-puzzle
icon PNGs but builds no `separate.c`/wasm), and `puzzles/unfinished/separate.c`
SHALL be deleted. Because `separate` was `divvy_rectangle`'s last C consumer,
`puzzles/divvy.c` (and `divvy-test.c`, its `core_obj` entry, and its declaration
in `puzzles.h`) SHALL also be deleted.

#### Scenario: Separate appears in the catalog with no wasm

- **WHEN** the wasm build runs after stage 2
- **THEN** `separate` is present in the catalog with both icon sizes and no
  `separate.wasm`, and `divvy.c` is no longer compiled
