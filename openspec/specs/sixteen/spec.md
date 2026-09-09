# sixteen Specification

## Purpose
TBD - created by archiving change refactor-pre-port-tidy. Update Purpose after archive.

## Requirements

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
drags and the move counter): an exact bidirectional search that meets in the
middle, run on **every** board, and a heuristic forward search for the boards
that search cannot reach. When neither reaches the goal but the forward search
improves the board, its partial path SHALL be returned as the plan (the next
hint request continues from the improved position).

**The exact search SHALL NOT be gated on how nearly finished the board looks.**
It was — armed only at a strict local minimum on a board with at most eight tiles
out of place — and Sixteen's 5×5 hint cycled with period 4 as a result, reaching
four tiles from finished and walking away again for ever. A shortest plan climbs
on the way home (the measured plan peaks at 17 tiles out of place, and at a total
travel of 30, from 9 and 9), so any such gate switches off partway down its own
descent and hands the board back to the heuristic. See the `ts-engine` planner
requirement for the general rule.

The planner SHALL return the whole path as a plan
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
as a home move).

A hint SHALL give the move that gets the board home even when that move undoes
the slide the player just made. Withholding it — which the port did, on the
grounds that it reads as useless advice and is the shape a ping-pong takes —
sends the player the long way round from a board one slide off finished, and
cannot be applied to a shortest plan without destroying the property that makes
the plan converge. The don't-undo veto SHALL remain available to the heuristic
search, which carries no such property.

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
  color

#### Scenario: A local-minimum endgame still yields a plan

- **WHEN** a user asks for a hint on a near-solved board where every single
  slide worsens the distance heuristic (e.g. two disjoint swapped pairs)
- **THEN** the exact bidirectional search produces a shortest full-slide plan,
  and following or auto-playing the stored plan reaches the solved state

#### Scenario: A player who re-asks after every move still arrives

- **WHEN** a player asks for a hint, plays only its first move, and asks again,
  from a board the exact search can reach
- **THEN** each fresh plan is exactly one move shorter than the last, and the
  walk reaches the solved board rather than returning to a position it has
  already left

#### Scenario: Narration distinguishes a final placement from a staging move

- **WHEN** a step (or a journey's final leg) lands the narrated tile in its
  solved cell
- **THEN** its narration states the tile is being moved into its final place
- **WHEN** a step leaves the narrated tile out of its solved cell
- **THEN** its narration states it is a setup/staging move

### Requirement: The Sixteen port supports direct row and column dragging

The Sixteen TS port SHALL support direct touch and mouse row/column dragging. When a user drags on a tile in the grid, the game SHALL track the horizontal or vertical drag vector and visually offset the dragged row/column in real-time. When released, the slide SHALL snap to the nearest cell alignment and execute the move if the drag distance exceeds half of a tile width.

#### Scenario: Dragging a row to slide it right
- **WHEN** a user pointerdowns on tile (0, 1), pointermoves right by 1.2 tiles, and pointerups
- **THEN** the game executes a slide move on row 1 with a delta of +1 (shifting right by 1)

### Requirement: Sixteen's hint SHALL finish the swapped-pair endgames

Sixteen's hint SHALL return a plan from a board whose only fault is one or two
pairs of tiles sitting in each other's cells, and SHALL NOT refuse on it.

These boards are where the collection's strongest hint guarantee actually broke.
They are a strict local minimum of the distance measure — every slide makes the
picture worse — and they are **nine moves** from finished while reading as two or
four cells out, which is one move past what a search that stores every board it
visits can afford at this size. Walking forty games of each preset one recomputed
hint at a time, the hint stopped on twelve of forty 5×4 games and five of forty
5×5 ones, telling the player "No move here would get you closer." on a solvable
board after they had followed thirty-odd hints. Sixteen SHALL therefore configure
the planner's depth-bounded deep search, and its reach SHALL cover nine moves at
its largest preset.

The guard for this SHALL name the boards rather than sample for them, and SHALL
assert the **plan length** and not merely that a plan came back: the
state-bounded search never returns more than eight moves at this size, so only a
plan longer than eight proves the deep search ran. A test that asked for any plan
at all would keep passing if the deep search were disabled and the board happened
to be reachable another way.

#### Scenario: A single swapped pair

- **WHEN** a hint is asked on a 5×4 board that is solved except for two tiles in
  each other's cells
- **THEN** it returns a plan of more than eight moves that finishes the board

#### Scenario: Two swapped pairs

- **WHEN** a hint is asked on a 5×5 board that is solved except for two such
  pairs
- **THEN** it returns a plan of more than eight moves that finishes the board
