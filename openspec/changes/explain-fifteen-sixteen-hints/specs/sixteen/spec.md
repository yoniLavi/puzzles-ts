## MODIFIED Requirements

### Requirement: The Sixteen port implements heuristic hints and rendering

The Sixteen TS port SHALL implement a hint planner that searches in
**full-slide moves** (a slide by any distance is one move, matching player
drags and the move counter): a heuristic forward search first, and — only when
that makes no progress at all on a near-solved board (a strict local minimum,
where every slide worsens the heuristic) — an exact bidirectional search that
meets in the middle, so deep local minima (e.g. two swapped pairs) still
yield plans. When the forward search improves the board without reaching the
goal, its partial path SHALL be returned immediately as the plan (the next
hint request continues from the improved position) without engaging the
exact search. The planner SHALL return the whole path as a plan
of narrated steps. Each step's narration SHALL describe what its move
actually does: the highlighted tile is the lowest-numbered out-of-place tile
on the moved line — except when the previous step previewed this move as the
continuation of a tile's journey, in which case the same journey tile SHALL
carry the narration through its second leg and the step SHALL be flagged
`continuesPrevious` so the midend keeps the hint displayed across the legs —
the target is the narrated
tile's **landing cell** under the step's move (with a second-leg preview when
the next step continues the same tile's journey perpendicular to the first),
and the returned delta is normalized to the in-grid direction of travel.

Each step's narration SHALL also explain **why** the move matters: a move (or, for
a journey, its final leg) that lands the narrated tile in its solved cell SHALL
narrate it as placing the tile in its **final place**; a move that leaves the
tile out of its solved cell SHALL narrate it as a **setup/staging** move. The
home-vs-helper wording SHALL be consistent with the project hint quality bar
(the Palisade exemplar) and with the sibling Fifteen hint, and the *why* SHALL
attach to a journey's end state (a journey whose later leg homes the tile reads
as a home move). The plan's moves, highlights, `hintKeepTrack`, and pacing SHALL
be unchanged by the narration enrichment.

The Sixteen `redraw` method
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

#### Scenario: Narration distinguishes a final placement from a staging move

- **WHEN** a step (or a journey's final leg) lands the narrated tile in its
  solved cell
- **THEN** its narration states the tile is being moved into its final place
- **WHEN** a step leaves the narrated tile out of its solved cell
- **THEN** its narration states it is a setup/staging move
