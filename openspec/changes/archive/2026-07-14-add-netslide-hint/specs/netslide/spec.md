# netslide Specification

## ADDED Requirements

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

- It SHALL lead with what the game can **prove**: the centre tile can never
  move, because the row and the column through it are both frozen, so the
  network must be built around it. Where it bites, it SHALL say that a tile in
  the centre row can only be moved by sliding its column (and vice versa) — a
  single degree of freedom.
- It SHALL narrate each move by its consequence — whether it **places a tile
  where it belongs** or is a **setting-up move** that brings one within reach —
  using the shared sliding-tile hint vocabulary, never merely restating the
  move.
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

#### Scenario: A hint repaints on a board that did not otherwise change

- **WHEN** a board is drawn, a hint is then requested, and the same draw state is
  redrawn
- **THEN** the hint highlight appears on that second paint
