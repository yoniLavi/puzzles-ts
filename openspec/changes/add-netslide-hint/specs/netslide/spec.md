# netslide Specification

## ADDED Requirements

### Requirement: Netslide offers an explained hint

Netslide SHALL implement `Game.hint` and `Game.hintKeepTrack`, planning a
sequence of slides that rebuilds the network and narrating each one by the
consequence it actually has.

Because Netslide has no solver, the hint SHALL plan against the generator's
`aux` (the unshuffled grid) and SHALL refuse with the same message `solve` uses
— "Solution not known for this puzzle" — when no `aux` is available (a
descriptive `params:desc` id, or a loaded save). The plan's goal test SHALL be
"every tile is powered", not "the board equals `aux`", so a board the player
completes by another route is recognised as finished.

The hint SHALL meet the collection's hint quality bar:

- It SHALL lead with what the game can **prove**: the centre tile can never
  move, because the row and the column through it are both frozen, so the
  network must be built around it. Where it bites, it SHALL say that a tile in
  the centre row can only be moved by sliding its column (and vice versa) — a
  single degree of freedom.
- It SHALL narrate each move by its consequence — whether it **places a tile in
  its final position** or is a **setting-up move** that brings one within reach
  — using the shared sliding-tile hint vocabulary, never merely restating the
  move.
- A subgoal that takes several slides SHALL be emitted as **one multi-leg
  journey** (continuation legs flagged `continuesPrevious`), so it reads and
  auto-plays as a single hint.
- It SHALL claim only what it has checked. The target is one valid solution, not
  provably the only one, so the narration SHALL say a tile *belongs* at a cell
  and SHALL NOT claim it is the only cell it could occupy.

#### Scenario: A hint on a board one move from solved

- **WHEN** a hint is requested on a board one slide away from a finished network
- **THEN** the plan is a single step whose move completes the board, and its
  explanation says that it places a tile in its final position

#### Scenario: A hint on a board with no known solution

- **WHEN** a hint is requested on a game created from a `params:desc` id or
  restored from a save, neither of which carries an `aux`
- **THEN** the hint is refused with "Solution not known for this puzzle"

#### Scenario: Auto-playing a whole plan finishes the board

- **WHEN** a hint plan is computed and executed step by step to its end
- **THEN** the board reaches a state in which every tile is powered

### Requirement: Netslide's hint plan is stable across recomputes

Netslide's hint SHALL be stable across recomputes: a plan is recomputed whenever
the player departs from it, and the game's two heuristic choices — which target
cell each tile is assigned to, and the planned path — SHALL NOT flip between
recomputes and send the player back and forth between subgoals.

The tile-to-target assignment SHALL be a pure deterministic function of the board
and the `aux` grid, with an explicit tie-break. The hint SHALL hold a stable
subgoal (the tile it is currently placing) across the legs of its journey and
SHALL mark that tile on the board. Instability SHALL NOT be worked around by
caching the plan, which hides the defect rather than fixing it.

Netslide SHALL be covered by the cross-game hint-resume guard.

#### Scenario: The subgoal survives the player going their own way

- **WHEN** a hint names a subgoal, the player then makes a different legal slide,
  and a hint is requested again
- **THEN** the newly computed plan is still working toward the same tile, not an
  unrelated one

### Requirement: Netslide renders the displayed hint step

`redraw` SHALL show the current hint step: the tile being placed highlighted, its
destination cell marked, and the slide arrow the player should press drawn in the
hint colour, previewing an ultimate destination distinctly from an intermediate
leg. Hint colours SHALL be appended past the upstream colour enum so the game's
palette stays index-for-index with it.

The hint overlay SHALL be part of the render cache's diff key, so it repaints on
the frame the hint is requested even though the underlying tiles did not change
that frame.

#### Scenario: A hint repaints on a board that did not otherwise change

- **WHEN** a board is drawn, a hint is then requested, and the same draw state is
  redrawn
- **THEN** the hint highlight appears on that second paint
