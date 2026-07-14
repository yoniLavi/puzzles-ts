# netslide Specification

## Purpose
TBD - created by archiving change add-netslide-ts-port. Update Purpose after archive.
## Requirements
### Requirement: Netslide game implements the Game interface

The engine SHALL provide a registered `netslide` game implementing
`Game<NetslideParams, NetslideState, NetslideMove, NetslideUi,
NetslideDrawState>`: a `w × h` grid of Net wire tiles (a 4-bit mask of
connections `R=1`, `U=2`, `L=4`, `D=8`) whose solved configuration is a
spanning tree rooted at the centre tile, scrambled by toroidal row/column
slides. The player SHALL slide rows and columns — never the centre row or the
centre column — until every tile is connected to the centre.

Params SHALL be `w`, `h`, `wrapping`, `barrierProbability` and `movetarget`,
encoded `{w}x{h}[w][b{prob}][m{target}]` (square shorthand `{n}`; the `b`
suffix only in the full encoding, the `m` suffix in both because the target
move count is part of the puzzle). All 9 upstream presets (3×3, 4×4, 5×5 ×
easy / medium / hard) SHALL be offered. `validateParams` SHALL require width
and height both greater than one, a barrier probability in `[0, 1]`, and a
non-negative move target.

The game SHALL report `canSolve = true`, `canFormatAsText = false` and
`wantsStatusbar = true`.

#### Scenario: Params round-trip

- **WHEN** params `{ w: 5, h: 5, wrapping: true, barrierProbability: 0.5,
  movetarget: 20 }` are encoded in full
- **THEN** the result is `5x5wb0.5m20` and decoding it round-trips the params

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is given a width or height of 1, a negative or
  greater-than-one barrier probability, or a negative move target
- **THEN** it returns a non-null error string

### Requirement: Netslide descriptions encode wires and barriers

The desc SHALL encode the grid row-major: one hexadecimal digit per tile
giving its wire mask, each optionally followed by `v` (a barrier to the right
of that tile) and/or `h` (a barrier below it). `validateDesc` SHALL reject
unexpected characters and descs that are shorter or longer than `w × h` tiles.

`newState` SHALL parse the desc into the wire grid and the barrier grid,
SHALL add barriers around the whole border when the game is not wrapping, and
SHALL derive each barrier's corner-joining flags (the `RU`/`UL`/`LD`/`DR` bits
used to draw barrier junctions cleanly). Barriers never change during play and
SHALL therefore be shared, frozen, across every state of a game.

#### Scenario: A description round-trips

- **WHEN** a generated desc is parsed by `newState`
- **THEN** the wire grid and barrier positions match those the generator built

#### Scenario: A non-wrapping game is walled in

- **WHEN** `newState` builds a non-wrapping game
- **THEN** every tile on the outer edge carries a barrier on its outward side

### Requirement: Netslide generates a spanning-tree grid, then shuffles it

`newDesc` SHALL construct the solved grid by growing outward from the centre
tile: it maintains a set of candidate `(x, y, direction)` extensions ordered
lexicographically by `x`, then `y`, then `direction`, repeatedly picks one
uniformly at random, connects it, and updates the candidate set so that no
tile ever becomes a full cross (all four arms) and no closed loop is ever
formed. The result is a spanning tree over every tile.

It SHALL then shuffle by applying random row/column slides, declining a slide
that would directly undo the previous one or that would repeat so often as to
be a shorter slide in the opposite direction — a declined slide SHALL NOT
count toward the move total. The number of slides is `movetarget` when set, and
otherwise `2 · (w−1) · (h−1)`.

It SHALL choose barrier locations **after** shuffling, drawing them one at a
time from the candidate set, so that on a fixed seed raising the barrier
probability yields a superset of the barriers a lower probability produced.

It SHALL save the unshuffled grid as `aux`.

#### Scenario: The solved grid is a spanning tree

- **WHEN** a grid is generated
- **THEN** every tile is reachable from the centre, no tile has four arms, and
  the wires contain no closed loop

#### Scenario: Raising the barrier probability on one seed adds barriers

- **WHEN** the same seed and grid params are generated at barrier probability
  0.5 and then at 1.0
- **THEN** the shuffled grid is identical and the 0.5 barrier set is a subset
  of the 1.0 barrier set

### Requirement: Netslide slides rows and columns, and powers the connected tiles

A move SHALL be a single-step toroidal slide of one row or one column in one
direction, or the solve move. `interpretMove` SHALL map a click in the border
gutter beside a row or column to a slide of that line — with the **right
button reversing the direction** — and SHALL refuse a click beside the centre
row or the centre column, which cannot be slid.

A keyboard cursor SHALL walk the ring of border arrow positions (top row
left-to-right, right column downwards, bottom row right-to-left, left column
upwards), skipping the un-slidable centre row and column, with select
performing the slide.

The game SHALL compute the set of *active* (powered) tiles as those reachable
from the centre tile through mutually-connected wires not separated by a
barrier. A row or column that is mid-slide SHALL be treated as unpowered so
the highlight does not appear to jump across a line in motion. The game is
complete when every tile is active.

#### Scenario: A slide wraps around

- **WHEN** a row is slid right
- **THEN** every tile in it moves one place right and the rightmost tile wraps
  around to the left end

#### Scenario: The right button reverses a slide

- **WHEN** the same border arrow is clicked with the left and then the right
  button
- **THEN** the two moves slide the same line in opposite directions

#### Scenario: The centre line cannot be slid

- **WHEN** the gutter beside the centre row or centre column is clicked
- **THEN** no move is produced

#### Scenario: Completion is every tile powered

- **WHEN** a slide leaves every tile reachable from the centre
- **THEN** the game reports itself complete and plays a completion flash

### Requirement: Netslide solves by replaying the generator's grid

The game has **no solver**. `solve` SHALL replay the unshuffled grid saved in
the generator's `aux`, and SHALL report "solution not known" when no `aux` is
available (a descriptive game id or a loaded save), faithful to upstream.

Netslide SHALL NOT implement `findMistakes`: every reachable board is legal —
the solution can still be reached from any state by sliding — so there is no
wrong-but-legal state to flag, and Check & Save correctly degrades to a plain
quick-save.

#### Scenario: Solve on a freshly generated game

- **WHEN** Solve is invoked on a game created from a random seed
- **THEN** the board is restored to the generator's unshuffled grid and is
  reported solved-with-help

#### Scenario: Solve on a descriptive id

- **WHEN** Solve is invoked on a game created from a `params:desc` id
- **THEN** it reports that the solution is not known

### Requirement: Netslide renders wires, barriers, arrows and the slide animation

`redraw` SHALL draw each tile's wires — in the powered colour when the tile is
active and the wire colour otherwise — with a box at the centre tile and at
every endpoint (a single-armed tile), and SHALL draw the connection stubs
across tile borders. Barriers SHALL be drawn in the barrier colour with their
corner flags joining them cleanly at junctions. Slide arrows SHALL be drawn in
the border gutter beside every slidable row and column, with the cursor's
arrow highlighted.

Geometry SHALL follow the **`NARROW_BORDERS`** variant (`BORDER =
3·tileSize/4 + 1`), which is what the web build compiles.

A slide SHALL be animated by offsetting the moving line, drawing the wrapping
tile in its off-grid position for the duration; completion SHALL flash tiles
outward from the centre.

The status bar SHALL report the move count (and the target move count when
set), whether the game is complete or was auto-solved, and how many tiles are
currently active.

#### Scenario: Powered and unpowered wires differ

- **WHEN** a board is drawn with some tiles connected to the centre
- **THEN** the connected tiles' wires are drawn in the powered colour and the
  rest in the plain wire colour

#### Scenario: A slide is animated

- **WHEN** a frame is captured partway through a row slide
- **THEN** that row's tiles are drawn offset from their grid positions and the
  tile wrapping around is also drawn beyond the far edge

