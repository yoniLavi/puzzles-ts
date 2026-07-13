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

### Requirement: The hint explains each move by the gem it is going for

The game SHALL implement `hint`, planning from the route solver and narrating each
move against a **subgoal** — the gem the route is going for.

The route SHALL be split into **legs**, a leg being the run of moves ending in the
first move that collects a gem, and the gem ending a leg SHALL be that leg's
subgoal. The subgoal SHALL be held **stable** across every step of its leg: it is
derived once, from the plan, and carried. It SHALL NOT be re-derived per step from
the ball's position, because the nearest gem to the ball changes as the ball moves
while the gem the route is going for does not — re-deriving makes the narration
flip-flop between goals and read as though it has lost the plot.

Because Inertia's gems are anonymous — there is no "tile 8" to name one by — the
subgoal gem SHALL be marked on the board, so the narration can refer to it.

Each move SHALL be narrated as exactly one of three cases, and SHALL claim no more
than is true:

- **forced** — when every other direction the ball can set off in would run it onto
  a mine, the narration SHALL say so; this is a genuine necessity claim;
- **collecting** — when the slide collects at least one gem, the narration SHALL
  name what it sweeps up and what brings the ball to a halt;
- **positioning** — when the slide collects nothing, the narration SHALL say that
  the ball cannot reach the subgoal gem from where it stands and that this move puts
  it somewhere it can. It SHALL NOT claim to be the *only* such move unless that has
  been verified.

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

### Requirement: A hint is a nudge; only Solve is a commitment

`hint` SHALL NOT mark the game as solved-with-help and SHALL NOT install a route
into the game state. Solve's existing behaviour — installing a route, setting
`cheated`, and reporting "Auto-solver used." in the status bar for the remainder of
the game — SHALL be unchanged.

This separation is the reason the hint exists: the game already offers a
step-by-step aid through Solve, but only at the price of recording the game as
auto-solved, which is precisely the price a player asking for one nudge is trying
not to pay.

#### Scenario: Asking for a hint does not brand the game auto-solved

- **WHEN** the player asks for a hint
- **THEN** the status bar does not report that the auto-solver was used, and no
  route arrow is installed on the ball

#### Scenario: The hint refuses honestly when the ball is dead

- **WHEN** the player asks for a hint with the ball dead
- **THEN** the hint refuses, and says that the move to make is to undo
