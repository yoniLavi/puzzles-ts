## MODIFIED Requirements

### Requirement: Fifteen offers a greedy full-solution hint plan

The Fifteen `hint()` SHALL return the whole greedy solution as a multi-step
plan: each step is the next single-cell gap slide chosen by the greedy human
solver (fill the shorter of the top row / left column tile-by-tile, moving the
next tile toward its home, with a hard-coded shortest-move table for the
end-of-line corner), highlighting the tile it slides. Following the plan from
any solvable board SHALL reach the solved state.

Each step's narration SHALL explain **why** the move matters, not merely which
tile slides: a step that lands a tile in its final solved cell (where the solver
will not disturb it again) SHALL narrate it as placing that tile **home**; a
step that does not SHALL narrate it as a setup/maneuvering move, naming the
**target tile** it is working toward its home. The home-vs-helper wording SHALL
be consistent with the project hint quality bar (the Palisade exemplar) and with
the sibling Sixteen hint.

`hintKeepTrack` SHALL return `"completed"` for a player move that produces
exactly the board the current step expects (advancing the plan), and `"off"`
otherwise (dropping the plan so the next request recomputes). Returning the
whole plan — rather than one step per request — keeps the hint displayed while
it is followed, consistent with the other sliding-tile game. The move chosen per
step, the highlighted tile, the tracking, and the plan length SHALL be unchanged
by the narration enrichment.

#### Scenario: Hint plan solves a solvable board

- **WHEN** `hint()` is requested on an unsolved board and every step's move is
  applied in order
- **THEN** the steps are legal single-cell gap slides and the board reaches the
  solved arrangement within the upstream `5·n³` move bound

#### Scenario: Hint highlights the tile it moves

- **WHEN** `hint()` is requested on an unsolved board
- **THEN** the first step's move is a slide whose target is one cell from the
  gap, and its highlight names the tile that will slide into the gap

#### Scenario: Narration distinguishes a home move from a setup move

- **WHEN** a step lands a tile in its final solved cell
- **THEN** its narration states that the tile is being placed home
- **WHEN** a step only maneuvers (it does not land a tile in its final cell)
- **THEN** its narration states it is a setup move and names the target tile
  being worked toward its home

#### Scenario: Following the plan keeps it displayed; deviating drops it

- **WHEN** the player makes exactly the move the current step describes
- **THEN** `hintKeepTrack` reports the step completed and the plan advances
- **AND** a different move reports `"off"`, dropping the plan
