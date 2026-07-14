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

### Requirement: Netslide offers an explained hint

Netslide SHALL implement `Game.hint` and `Game.hintKeepTrack`, planning a
sequence of slides that rebuilds the network and narrating each one by the
consequence it actually has.

Because Netslide has no solver, the hint SHALL plan against a finished grid: the
generator's `aux` (the unshuffled grid) when the game came with one, and
otherwise a grid **recovered from the board itself**. The plan's goal test SHALL
be "every tile is powered", not "the board equals the target", so a board the
player completes by another route is recognised as finished.

The hint SHALL meet the collection's hint quality bar:

- It SHALL name board elements as the player can **see or count** them, never by a
  claim it has not checked. The immovable tile SHALL be called **the source** — the
  tile power flows from, drawn as the black box — and SHALL NOT be called "the
  centre": it sits at `⌊w/2⌋, ⌊h/2⌋`, which on an even-sized board is visibly not
  the centre. A line that cannot be slid SHALL be named by its **number** ("row 3
  never slides"), which is true at every board size.
- It SHALL lead with what the game can prove about **this move**: a tile in the
  source's row can only be moved by sliding its column, and vice versa — the single
  degree of freedom that is the game's technique.
- It SHALL NOT restate the **rules** of the game step after step. That the source
  cannot move is a rule the board already shows — no arrows are drawn beside its row
  or column — and no move *follows* from it; it belongs in the help text, not in
  every hint. A step whose tile merely belongs beside the source SHALL say that
  plainly, without a preamble.
- It SHALL narrate each move by its consequence — whether it **places a tile
  where it belongs** or is a **setting-up move** that brings one within reach —
  using the shared sliding-tile hint vocabulary, never merely restating the
  move, and SHALL NOT say a tile "belongs" twice in one sentence.
- A subgoal that takes several slides SHALL be emitted as **one multi-leg
  journey** (continuation legs flagged `continuesPrevious`), so it reads and
  auto-plays as a single hint.
- It SHALL claim only what it has checked. Netslide's tiles are wire masks and
  many are identical, so a tile does not have *one* home — it belongs anywhere
  the finished board wants its wires. The hint SHALL therefore say a tile
  belongs at a cell only when the finished board wants that tile's wires there,
  and SHALL NOT claim it is the only cell it could occupy. A plan that runs out
  of budget before finishing may leave a tile somewhere merely useful; such a
  move SHALL be narrated as setting up, not as arriving.

#### Scenario: A hint on a board one move from solved

- **WHEN** a hint is requested on a board one slide away from a finished network
- **THEN** the plan is a single step whose move completes the board, and its
  explanation says that it puts a tile where it belongs

#### Scenario: A hint on a board that came with no answer

- **WHEN** a hint is requested on a game created from a `params:desc` id — a
  shared link or a bookmark — which carries no `aux`
- **THEN** the hint recovers the finished grid from the board and plans against
  it, rather than giving up

#### Scenario: A tile is only ever said to belong where its wires are wanted

- **WHEN** a hint step says a tile belongs at a cell
- **THEN** the finished board holds exactly that tile's wires in that cell

#### Scenario: The immovable tile is never called the centre

- **WHEN** any hint step is narrated, on a board of any size
- **THEN** its explanation calls the immovable tile the source, and never the
  centre — which on an even-sized board would name a tile the player can see it is
  not

#### Scenario: A frozen line is named by its number

- **WHEN** a hint step turns on the single degree of freedom — the tile sits in the
  source's row, so only its column can shift it
- **THEN** the explanation names that row by its number, and says that only a column
  move can shift the tile

### Requirement: Netslide can be solved from any position

Following Netslide's hint SHALL finish the board from **any** position a player
can reach, on any preset, whether or not the game came with a known answer. The
hint SHALL never give up on a solvable board, and SHALL never walk the player in
circles.

This SHALL be achieved structurally, and SHALL NOT be worked around by caching
the plan, which hides the defect rather than fixing it:

- The measure of how far a board is from finished SHALL be a pure function of
  that board, recomputed against it, so that it cannot report progress on a move
  that makes the picture worse and cannot disagree with itself between
  recomputes.
- An endgame the heuristic cannot see past — two tiles wanting each other's
  cells, which reads as two cells from finished and is really ten moves away —
  SHALL be planned by an exact **shortest** search, so that the plan's first move
  provably shortens the distance to a finished board. A heuristic plan carries no
  such guarantee and demonstrably loops: several slides of one row, each scoring
  as progress, return the board to exactly where it started.

The grid the hint plans against SHALL be reachable from the board by sliding. Not
every valid finished grid is: a slide of a line of length `k` is a `k`-cycle,
even exactly when `k` is odd, so on an all-odd grid only half the arrangements
exist at all.

The hint SHALL hold a stable subgoal (the tile it is currently placing) across
the legs of its journey and SHALL mark that tile on the board. Netslide SHALL be
covered by the cross-game hint-resume guard.

#### Scenario: Following the hint finishes a board that came with no answer

- **WHEN** a hint is requested on any preset, with no `aux` available, and its
  plan is followed to the end, repeatedly, as the midend does
- **THEN** a finished board is reached

#### Scenario: The hint never aims at a grid the board cannot reach

- **WHEN** the finished grid is recovered from the board
- **THEN** it is one the board can actually be slid into

### Requirement: Netslide can be solved without the generator's answer

`Game.solve` SHALL work on a board that carries no `aux` — a game created from a
descriptive `params:desc` id, such as a shared link or a bookmark — by recovering
the finished grid from the board itself, rather than refusing.

#### Scenario: Solving a game built from a descriptive id

- **WHEN** Solve is used on a game created from a `params:desc` id
- **THEN** the board is completed, rather than refused with "Solution not known
  for this puzzle"

### Requirement: Netslide renders the displayed hint step

`redraw` SHALL show the current hint step: the tile being placed highlighted, the
cell the plan is taking it to marked, and the slide arrow the player should press
drawn in the hint colour. A destination the tile genuinely belongs in SHALL be
marked distinctly from one it is only passing through, so a setting-up move never
reads as the answer. Hint colours SHALL be appended past the upstream colour enum
so the game's palette stays index-for-index with it.

The hint overlay SHALL be part of the render cache's diff key, so it repaints on
the frame the hint is requested even though the underlying tiles did not change
that frame.

The two marks SHALL behave differently while a slide animates, because they mark
different kinds of thing:

- The **tile** mark marks a *tile*, which is moving, so it SHALL travel with the
  tile it marks. While the hinted slide is animating, the displayed step's
  `tile` cell is the cell the tile set off *from* — the midend advances the plan
  when the animation ends — so `redraw` SHALL mark the cell the slide lands it in,
  and SHALL NOT mark the vacated cell, which by then holds a different tile.
- The **destination** mark marks a *cell*, which is not moving, so it SHALL stay
  where the cell is while the line slides underneath it, and SHALL NOT be drawn
  with the animation's offset.

#### Scenario: A hint repaints on a board that did not otherwise change

- **WHEN** a board is drawn, a hint is then requested, and the same draw state is
  redrawn
- **THEN** the hint highlight appears on that second paint

#### Scenario: The tile mark travels with the tile mid-slide

- **WHEN** a frame is captured partway through the slide the displayed hint step
  asked for
- **THEN** the tile highlight is drawn on the tile being placed, at the offset
  position that tile is drawn at — not on the cell it has left

#### Scenario: The destination mark stays put mid-slide

- **WHEN** a frame is captured partway through a slide whose line contains the
  cell the hint is taking the tile to
- **THEN** that cell's outline is drawn at the cell's own position, unshifted by
  the animation

