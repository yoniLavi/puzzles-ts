# signpost Specification

## Purpose
TBD - created by archiving change add-signpost-ts-port. Update Purpose after archive.
## Requirements
### Requirement: Signpost game implements the Game interface

The engine SHALL provide a registered `signpost` game implementing
`Game<SignpostParams, SignpostState, SignpostMove, SignpostUi,
SignpostDrawState>`: a `w × h` grid in which every cell carries an arrow
(one of 8 directions) and some cells carry immutable sequence numbers; the
player links cells into a single chain `1 … n` (`n = w*h`) where every link
follows its cell's arrow and the numbers run consecutively. Params SHALL be
`w`, `h`, and `forceCornerStart` (boolean), encoded `{w}x{h}` with a
trailing `c` when corner-start is set (square shorthand `{n}`). All 6
upstream presets (4×4, 4×4 free ends, 5×5, 5×5 free ends, 6×6, 7×7) SHALL
be offered. `validateParams` SHALL reject non-positive dimensions and a
1×1 full generation. The game SHALL report `canSolve = true` and
`canFormatAsText = true` and SHALL drive a spin win-flash suppressed after
Solve.

#### Scenario: Params round-trip

- **WHEN** params `{ w: 5, h: 5, forceCornerStart: true }` are encoded in
  full
- **THEN** the result is `5x5c` and decoding it round-trips the params

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is given a 1×1 grid for full generation
- **THEN** it returns a non-null error string

### Requirement: Signpost descriptions use the upstream per-cell encoding

The desc SHALL encode the grid row-major, one token per cell: a direction
letter `a`–`h` (`a` = N … `h` = NW) alone for a cell with no immutable
number, or the decimal number followed by the direction letter for an
immutable-numbered cell. `validateDesc` SHALL reject unknown characters,
numbers out of range, and a token count not matching `w*h`. `newState`
SHALL parse the desc into per-cell arrow directions and immutable numbers
shared (frozen) across all states of the game, with no links initially
placed.

#### Scenario: A description round-trips

- **WHEN** a generated desc is parsed by `newState` and re-encoded
- **THEN** the re-encoded desc equals the original

#### Scenario: A malformed description is rejected

- **WHEN** `validateDesc` is given a desc whose token count does not match
  `w*h`, or an unknown direction character
- **THEN** it returns a non-null error string

### Requirement: Signpost maintains the linked-chain state model

`SignpostState` SHALL maintain, in addition to the immutable arrows and
clues, the player's `next`/`prev` links, a disjoint-set forest binding
linked cells into regions, and a derived per-cell sequence number and
region colour group. On every move the derived numbering SHALL be
recomputed (upstream `update_numbers` / `head_number` / `connect_numbers`):
merging two regions SHALL keep the larger region's colour group, adding a
blank cell to a numbered region SHALL inherit that region's colour and
extend its numbering, and joining two blank cells SHALL pick the lowest
unused colour group. State SHALL be immutable and cloned per move (typed
arrays + disjoint-set forest, no explicit free).

#### Scenario: Linking renumbers a region

- **WHEN** the player links a cell numbered `k` to a blank cell it points at
- **THEN** the blank cell derives number `k+1` and the two cells share one
  region and colour group

#### Scenario: Merging keeps the dominant colour

- **WHEN** two differently-coloured regions are joined
- **THEN** the merged region takes the colour group of the larger of the two

### Requirement: Signpost ports the deductive solver faithfully

The port SHALL implement the upstream solver: iterate `update_numbers` and
a single forced-link deduction (`solve_single` — if a cell has exactly one
legal next cell it may link to, make that link; symmetrically for a sole
legal predecessor) to a fixpoint, gated by `move_couldfit` (a region may
only bridge a numeric gap it fits into). The solver SHALL report the board
solved, stuck, or impossible, and its verdict SHALL match the C solver on
every intermediate board (the generator is solver-gated).

#### Scenario: Forced links are deduced

- **WHEN** the solver runs on a board where a cell points at exactly one
  legal continuation
- **THEN** it links them, and iterating to a fixpoint solves any generated
  board

#### Scenario: Solve recovers the chain from a dirty state

- **WHEN** `solve()` is invoked on a partially- and wrongly-linked board
- **THEN** it returns a move reconstructing the correct full `1 … n` chain

### Requirement: Signpost generates byte-identically to the C build

For a given random seed and params, `newDesc` SHALL produce the exact desc
string the C generator produces — the `new_game_fill` head+tail random walk,
the `new_game_strip` shuffle-and-solver-gated clue selection, and the
final `generate_desc` encoding — reproduced by matching C's `random_upto` /
`shuffle` call order. A committed gated differential test SHALL assert this
across all 6 presets and representative non-preset sizes.

#### Scenario: Generated descs match the C reference

- **WHEN** the trace harness records `(preset, seed) → desc` fixtures from
  the pure-C build and the TS `newDesc` is run for the same seeds
- **THEN** every TS desc equals the recorded C desc byte-for-byte

### Requirement: Signpost reports mistakes for Check & Save

Because generated boards are uniquely solvable, `signpost` SHALL implement
`findMistakes(state)`: re-solve from the immutable clues, and if that yields
a unique complete chain, flag every cell whose player `next` link disagrees
with the solution's link. Cells with no outgoing player link SHALL never be
flagged. If the board is not uniquely solvable, `findMistakes` SHALL return
no mistakes. This is distinct from the live error overlay, which flags
locally inconsistent links (loops, number clashes) rather than globally
wrong ones.

#### Scenario: A wrong link is flagged

- **WHEN** the player links two cells that are not consecutive in the unique
  solution and requests Check & Save
- **THEN** `findMistakes` flags that link and the save is refused

#### Scenario: A hand-typed ambiguous board reports nothing

- **WHEN** `findMistakes` runs on a desc with no unique solution
- **THEN** it returns an empty list

### Requirement: Signpost renders to full parity with a blitter drag sprite

`render.ts` SHALL draw the board with palette indices matching the C enum,
including the four 16-entry HSV colour ramps for region backgrounds and mid
/ dim arrow colours. The drawstate SHALL key a per-cell packed `Int32Array`
cache (region colour group, sequence number, arrow direction, and the
immutable / error / cursor / drag-origin / flash / findMistakes-overlay
bits) diffed against the previous frame, with every overlay rebuilt each
frame so it is in the diff key. The drag sprite SHALL use a blitter
(save-restore under the moving arrow), as the Pegs port does. The win-flash
SHALL spin the arrows, honouring the `flash-type` preference (unidirectional
vs meshing gears). The engine SHALL paint no pixels of its own; the
first-draw branch fills the background.

#### Scenario: Region colours repaint after linking

- **WHEN** a render scenario links a sequence of cells
- **THEN** the recorded draw ops show each region's cells drawn with its
  assigned background-ramp colour, and a subsequent link that merges regions
  repaints the affected cells with the surviving colour

#### Scenario: A wrong link renders red

- **WHEN** the findMistakes overlay is active for a wrong link
- **THEN** that cell is drawn with the `COL_ERROR` styling on the next paint

### Requirement: Signpost exposes the victory-flash preference

`signpost` SHALL expose the sole upstream preference through the `Game.prefs`
hook: `flash-type` (a choice of "unidirectional" vs "meshing gears" victory
rotation). Setting it SHALL change the win-flash spin direction pattern and
SHALL persist through the standard preferences mechanism.

#### Scenario: The flash preference is offered and applied

- **WHEN** the player opens Preferences for signpost
- **THEN** a victory-rotation-effect choice is shown, and selecting "meshing
  gears" makes alternate cells spin in opposite directions on the next win

