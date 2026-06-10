## ADDED Requirements

### Requirement: Sixteen game implements the Game interface

The engine SHALL provide a registered `sixteen` game implementing `Game<SixteenParams, SixteenState, SixteenMove, SixteenUi, SixteenDrawState>`: the toroidal sliding-tile puzzle with `WxH[mM]` params (movetarget `M` > 0 selects shuffle-by-random-moves generation; otherwise random permutation with parity correction), slide moves on whole rows/columns expressed as `{ axis, index, delta }`, a keyboard cursor with Unlocked/LockTile/LockPosition modes, slide animation, completion flash, and per-tile cache rendering.

#### Scenario: Random-permutation generation is solvable

- **WHEN** a new game is created with movetarget 0
- **THEN** the generated permutation is parity-corrected so the board is reachable from the solved state
- **AND** the solved state reports completed status

#### Scenario: Slide move semantics

- **WHEN** a slide move `{ axis: "row", index: 1, delta: +1 }` executes
- **THEN** every tile in row 1 shifts right by one cell with toroidal wraparound
- **AND** the move counter increments by one regardless of slide distance

### Requirement: The Sixteen port implements heuristic hints and rendering

The Sixteen TS port SHALL implement a hint planner that searches in
**full-slide moves** (a slide by any distance is one move, matching player
drags and the move counter): a heuristic forward search first, and — when that
fails to reach the goal on a near-solved board — an exact bidirectional
search that meets in the middle, so deep local minima (e.g. two swapped
pairs) still yield plans. The planner SHALL return the whole path as a plan
of narrated steps. Each step's narration SHALL describe what its move
actually does: the highlighted tile is the lowest-numbered out-of-place tile
on the moved line, the target is that tile's **landing cell** under the
step's move (with a second-leg preview when the next step continues the same
tile's journey perpendicular to the first), and the returned delta is
normalized to the in-grid direction of travel. The Sixteen `redraw` method
SHALL render the current step by highlighting the tile to move (filled
overlay), its landing cell (border highlight), and the corresponding slide
arrow (using `COL_HINT`). Sixteen's `hintKeepTrack` SHALL report
`"completed"` when a slide of the hinted line lands the tile on the step's
target, `"onTrack"` for other slides of that line (adjusting the step's
remaining delta in place), and `"off"` otherwise.

#### Scenario: Sixteen generates a hint plan

- **WHEN** a user asks for a hint on an unsolved Sixteen board
- **THEN** the planner returns a plan of one or more slide moves whose steps
  each land the highlighted tile exactly on that step's highlighted target,
  and the current step renders the tile, target, and slide arrow in the hint
  colour

#### Scenario: A local-minimum endgame still yields a plan

- **WHEN** a user asks for a hint on a near-solved board where every single
  slide worsens the distance heuristic (e.g. two disjoint swapped pairs)
- **THEN** the exact bidirectional fallback produces a shortest full-slide
  plan once, and following or auto-playing the stored plan reaches the solved
  state without recomputation

### Requirement: The Sixteen port supports direct row and column dragging

The Sixteen TS port SHALL support direct touch and mouse row/column dragging. When a user drags on a tile in the grid, the game SHALL track the horizontal or vertical drag vector and visually offset the dragged row/column in real-time. When released, the slide SHALL snap to the nearest cell alignment and execute the move if the drag distance exceeds half of a tile width.

#### Scenario: Dragging a row to slide it right
- **WHEN** a user pointerdowns on tile (0, 1), pointermoves right by 1.2 tiles, and pointerups
- **THEN** the game executes a slide move on row 1 with a delta of +1 (shifting right by 1)
