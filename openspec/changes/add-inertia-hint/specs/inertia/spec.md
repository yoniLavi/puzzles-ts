# inertia Specification

## MODIFIED Requirements

### Requirement: Inertia game implements the Game interface

The engine SHALL provide a registered `inertia` game implementing
`Game<InertiaParams, InertiaState, InertiaMove, InertiaUi, InertiaDrawState>`: a
`w × h` grid whose cells are blank, a gem, a mine, a stop-square or a wall, with a
single ball starting on a stop-square. A move slides the ball in one of eight
directions until it lands on a stop-square or the next square in its path is a
wall; it collects every gem it passes over and dies on any mine it touches. The
game is won when every gem has been collected. Params SHALL be `w` and `h`, and
the three upstream presets (10×8, 15×12, 20×16) SHALL be offered. The game SHALL
report `canSolve = true`, `canFormatAsText = true` and `wantsStatusbar = true`.

The game SHALL NOT implement `findMistakes`: every reachable position is legal — a
death is undone, not corrected — so there is no wrong-but-legal state to flag, and
Check-&-Save correctly degrades to a plain quick-save.

The game SHALL implement `hint` (see "The hint explains each move by the gem it is
going for").

#### Scenario: Params round-trip

- **WHEN** params `{ w: 15, h: 12 }` are encoded in full and decoded
- **THEN** the decoded params equal the original

#### Scenario: Degenerate params are rejected

- **WHEN** `validateParams` is given a grid with a dimension below 2, or an area
  below 6 squares
- **THEN** it returns a non-null error string

## ADDED Requirements

### Requirement: The hint plans for the nearest gem the ball can safely take

The game SHALL implement `hint`, planning in **legs**: a leg is the shortest walk
to a gem, ending with the move that collects it.

Each leg SHALL go for the **nearest** gem — fewest moves to collect — that the
ball can take **without stranding itself**: a candidate leg SHALL be rejected when
the position it leaves behind can no longer be solved, and the next-nearest tried
instead. Where the near gems all strand the ball, the route solver's own tour
SHALL supply the leg, its remaining route being the witness that the leg is safe.

The plan SHALL NOT simply follow the route solver's tour. The tour is a heuristic,
and a hint is **recomputed from scratch whenever the player goes their own way**:
two tours grown from adjacent positions can disagree about which gem to fetch
first, so the hint sends the ball one way and then, a move later, tells it to come
back — for ever, collecting nothing. Going for the nearest safe gem cannot do
that, because every move of a shortest walk strictly shortens the distance to a
gem that is still safe.

#### Scenario: The hint always makes progress, however the player got here

- **WHEN** a hint is asked for, its first step played, and a fresh hint asked for
  again — repeatedly, from any position the board reaches
- **THEN** the board is solved in a finite number of moves; the hint never sends
  the ball back and forth between two positions without collecting a gem

#### Scenario: A stranding grab is not suggested

- **WHEN** the nearest gem can be collected in one slide, but that slide leaves the
  ball where some other gem can never be reached again
- **THEN** the hint does not suggest that slide

### Requirement: The hint explains each move by the gem it is going for

The hint SHALL narrate every move it suggests against the gem its leg is going for,
and SHALL claim no more than it has verified.

Each leg's **subgoal** is the gem it ends by collecting — the last one along its
final move's path, where that move sweeps up several. The subgoal SHALL be held
**stable** across every step of its leg: derived once, from the plan, and carried.
It SHALL NOT be re-derived per step from the ball's position, because the nearest
gem to the ball changes as the ball moves while the gem the plan is going for does
not — re-deriving makes the narration flip-flop between goals and read as though
it has lost the plot.

Because Inertia's gems are anonymous — there is no "tile 8" to name one by — the
subgoal gem SHALL be marked on the board, so the narration can refer to it.

Each move SHALL be narrated, and SHALL claim no more than has been **verified**:

- **forced** — when every other direction the ball can set off in would run it onto
  a mine, the narration SHALL say so; this is a genuine necessity claim. Where it
  is instead *walls* that block every other direction, the narration SHALL say
  that, and SHALL NOT speak of mines;
- **collecting** — when the slide collects at least one gem, the narration SHALL
  name what it sweeps up and what brings the ball to a halt (a stop square, or the
  wall at the end) — the rule the game turns on, which is that the player does not
  choose where the ball stops;
- **stranding** — when the subgoal gem could be swept up by a single slide from
  here, and doing so would leave some gem unreachable for ever, the narration SHALL
  say so; this is Inertia's one provable verdict about a position;
- **positioning** — when the slide collects nothing, the narration SHALL say that
  no slide from here reaches the subgoal gem, and what the move is for. That
  premise SHALL be **checked**, not assumed: a plan may decline a grab it could
  take, so the claim is not true by construction. It SHALL NOT claim to be the
  *only* such move unless that has been verified.

A narration SHALL NOT promise that one more slide finishes the leg unless the
plan's **own next move** is that slide — a slide merely existing is not the claim,
because a gem can be reached from a side no single slide from here can reach, and a
promise the plan then breaks reads as a hint that has lost the plot.

#### Scenario: A move that collects nothing is explained by what it sets up

- **WHEN** the hint suggests a move that collects no gem
- **THEN** its narration names the subgoal gem it is positioning for, rather than
  merely stating the direction

#### Scenario: The subgoal does not change under the player's feet

- **WHEN** a leg takes several moves to reach its gem
- **THEN** every step of that leg names the same subgoal gem

#### Scenario: A forced move is called forced

- **WHEN** every direction the ball could otherwise set off in runs it onto a mine
- **THEN** the narration says so

#### Scenario: The hint never says a gem is out of reach when a slide would take it

- **WHEN** a step's narration says no slide from here reaches the subgoal gem
- **THEN** no legal, non-fatal slide from that position collects it

### Requirement: A hint is a nudge; only Solve is a commitment

`hint` SHALL NOT mark the game as solved-with-help and SHALL NOT install a route
into the game state. Solve's existing behaviour — installing a route, setting
`cheated`, and reporting "Auto-solver used." in the status bar for the remainder of
the game — SHALL be unchanged.

This separation is the reason the hint exists: the game already offers a
step-by-step aid through Solve, but only at the price of recording the game as
auto-solved, which is precisely the price a player asking for one nudge is trying
not to pay.

The game SHALL implement `hintKeepTrack`, so that a move in the displayed step's
direction **completes** that step and the plan is kept. Without it the midend drops
the plan on every player move — including one that faithfully follows the hint —
and the next hint replans from scratch, which is what a stable subgoal exists to
prevent.

#### Scenario: Asking for a hint does not brand the game auto-solved

- **WHEN** the player asks for a hint
- **THEN** the status bar does not report that the auto-solver was used, and no
  route arrow is installed on the ball

#### Scenario: Following the hint keeps the plan

- **WHEN** the player plays the move the displayed hint step suggests
- **THEN** the plan advances to its next step rather than being recomputed

#### Scenario: The hint refuses honestly when the ball is dead

- **WHEN** the player asks for a hint with the ball dead
- **THEN** the hint refuses, and says that the move to make is to undo

#### Scenario: The hint refuses honestly when a gem is out of reach for ever

- **WHEN** the player asks for a hint from a position where some gem can no longer
  be reached by any sequence of moves
- **THEN** the hint refuses, says that a gem can no longer be reached, and says
  that the move to make is to undo

### Requirement: The hint is drawn as a marked gem and an arrow

`redraw` SHALL mark the displayed step's subgoal gem with a ring in its own colour,
and SHALL draw the step's direction as an arrow on the ball, in the same colour and
shape as the route arrow (both mean "the solver says go this way"). The aim arrow
of a swipe in progress SHALL take precedence over both, being what the ball will
actually do next.

The ring SHALL be part of the tile's cache key, because it is drawn on a tile
rather than on the ball sprite — an overlay outside the diff key is never painted
and never erased.

#### Scenario: The marked gem is ringed and the direction shown

- **WHEN** a hint step is displayed
- **THEN** the board rings its subgoal gem, and an arrow on the ball points the way
  the step suggests
