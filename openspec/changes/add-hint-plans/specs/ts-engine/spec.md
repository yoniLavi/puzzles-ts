# ts-engine delta: add-hint-plans

## MODIFIED Requirements

### Requirement: The engine supports an ephemeral Hint System

The engine SHALL support a UI-only, ephemeral Hint System built on **plans**.
The `Game` interface SHALL define an optional `hint(state)` method returning a
non-empty ordered plan of `HintStep`s — each a move plus a human-readable
explanation and optional visual highlights, narrated for the state that step
applies to (`HintResult`). The `Midend` SHALL store the whole plan plus a
current-step index in `activeHint` (midend-only, never in game state, never
persisted), SHALL display exactly one step at a time (the current step is
passed to the game's `redraw` and its explanation appended to the status bar),
and SHALL recompute a plan only when no valid plan is stored.

Plan lifecycle:
- `midend.hint()` SHALL be a display refresh (no recompute, no advance) while
  a plan is active, and SHALL compute and store a fresh plan at index 0
  otherwise.
- `midend.executeHint()` SHALL execute the current step of the stored plan
  (computing a plan first if none is stored), keep that step displayed through
  the move's animation, and advance to the next step when the animation
  settles.
- A player move while a plan is active SHALL be classified by the game's
  `hintKeepTrack(move, currentStep, state)` verdict: `"completed"` advances
  the plan to the next step, `"onTrack"` keeps the current step displayed
  (the game MAY adjust the step's move in place to reflect partial progress),
  and `"off"` drops the plan. A game returning `"completed"` is asserting
  that the resulting state matches the plan's expectation, so the remaining
  steps stay valid.
- The plan SHALL be cleared on undo, redo, restart, new game, solve, when the
  last step completes, and when the board reaches the solved state.

#### Scenario: Requesting a hint from the midend

- **WHEN** the user requests a hint via `midend.hint()` with no active plan,
  on a game that implements the `hint` method
- **THEN** the midend computes a plan once, stores it with index 0, appends
  the first step's explanation to the status bar, and schedules a repaint

#### Scenario: Following a hint sequence manually

- **WHEN** the user makes a move that completes the displayed hint step
  (`hintKeepTrack` returns `"completed"`)
- **THEN** the midend advances to the next step of the stored plan without
  recomputing, and the next step's explanation and highlights are displayed

#### Scenario: An off-plan move drops the plan

- **WHEN** the user makes a move for which `hintKeepTrack` returns `"off"`
  (or undoes, redoes, restarts, or starts a new game) while a plan is active
- **THEN** the midend clears `activeHint`, redraws without hint visuals, and
  the next hint request computes a fresh plan

#### Scenario: Auto-play executes the stored plan

- **WHEN** `executeHint()` is called repeatedly while a stored plan has
  remaining steps
- **THEN** each call executes the plan's current step verbatim — `hint()` is
  not recomputed per step — and the plan advances at each animation settle,
  clearing after the final step

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
