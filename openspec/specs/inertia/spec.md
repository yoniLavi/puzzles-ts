# inertia Specification

## Purpose
TBD - created by archiving change add-inertia-ts-port. Update Purpose after archive.
## Requirements
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

### Requirement: The ball slides until it is stopped

`executeMove` SHALL move the ball one square at a time in the move's direction,
and for each square entered: collect a gem there (decrementing the gem count and
clearing the square), die on a mine there, and stop when the square is a
stop-square or when the next square in the direction is a wall. `interpretMove`
SHALL reject a direction whose adjacent square is a wall, and SHALL reject every
move while the ball is dead. The state SHALL record the distance travelled by the
last move, so the renderer can animate the slide.

#### Scenario: The ball collects gems on the way past

- **WHEN** the ball slides through a line of squares containing gems and lands
  against a wall
- **THEN** every gem in the traversed squares is collected and the gem count drops
  by that number

#### Scenario: The ball dies on a mine

- **WHEN** the ball's slide takes it onto a mine
- **THEN** the resulting state is dead, the slide stops there, and no further move
  is accepted until the player undoes

#### Scenario: A move into a wall is refused

- **WHEN** the player presses a direction whose adjacent square is a wall
- **THEN** no move is produced and the game state is unchanged

### Requirement: All eight directions are reachable from the keyboard

The game SHALL accept the arrow keys for the four orthogonal directions and the
digits `1`–`4` and `6`–`9` — laid out as the number pad, which is itself a
compass — for all eight, **with or without** the `MOD_NUM_KEYPAD` modifier.

Accepting the *unmodified* digits is a deliberate divergence from upstream, which
requires the modifier. This web frontend never sets it (any single character key
is mapped to its character code), so without this the four diagonal moves would
be reachable only with the mouse and a keyboard-only player could not play the
game. Inertia binds no other digit, so no other input can be shadowed.

#### Scenario: A diagonal is reachable from the keyboard

- **WHEN** the player presses `3`
- **THEN** the ball sets off to the south-east

### Requirement: The ball can be swiped in a direction

Pressing the pointer **on the ball** SHALL begin a swipe rather than making a
move: while the pointer is held, the game SHALL draw an arrow on the ball
pointing at the direction the pointer is aimed at (the octant it lies in, seen
from the ball), and SHALL play that direction when the pointer is released.

Aiming SHALL yield no direction — and so draw no arrow, and make no move on
release — when the pointer is back on the ball (which is how the player calls the
swipe off) or when it is aimed at a wall (which is not a move the ball can make).
The arrow SHALL be drawn in its own colour, distinct from the route arrow, since
the two mean different things ("you are about to go this way" versus "the solver
says go this way") and a player with a route installed sees both.

The whole gesture SHALL also work on the **secondary** button, because on touch a
press that stays put for the long-press interval is delivered as one — and a
press that stays put is exactly what holding the ball to aim looks like. Inertia
binds nothing else to the secondary button.

This is a deliberate divergence: upstream offers only the click-an-octant input,
which stays supported, but is fiddly with a finger and gives no feedback before
committing.

#### Scenario: Holding and dragging aims, and releasing launches

- **WHEN** the player presses on the ball, drags out to the east and releases
- **THEN** an arrow points east while the pointer is held, and the ball sets off
  east on release

#### Scenario: Dragging back to the ball calls the swipe off

- **WHEN** the player presses on the ball, drags out, drags back onto the ball
  and releases
- **THEN** no move is made

### Requirement: Descriptions encode the grid; the start square becomes a stop

The desc SHALL be exactly `w · h` characters from `{b, g, m, s, w, S}` (blank,
gem, mine, stop, wall, start), row-major. `newState` SHALL place the ball on the
single `S` square and treat that square as a stop-square thereafter.
`validateDesc` SHALL reject a desc of the wrong length, containing an unrecognised
character, without exactly one start square, or without at least one gem.

#### Scenario: Start square is a stop square

- **WHEN** a game is created from a desc whose start square is at (x, y)
- **THEN** the ball is at (x, y) and that square behaves as a stop-square for
  subsequent slides

#### Scenario: A desc with no gems is rejected

- **WHEN** `validateDesc` is given a desc containing no `g`
- **THEN** it returns a non-null error string

### Requirement: Generated boards place gems only on round-trip-reachable squares

The generator SHALL fill the grid with one fifth walls, one fifth stop-squares and
one fifth mines plus one start square, the remainder blank, and shuffle it; then
find the **gem candidates** — the squares for which some direction is reachable
both *from* the start and *back to* the start, computed by two breadth-first
searches over the `w · h · 8` square-plus-direction space — and reject the grid if
there are fewer candidates than the required gem count. It SHALL further reject a
grid in which some square is geometrically further than a threshold from the
nearest candidate (the threshold starting at 2 and relaxing by one every 50
rejections), so that reachable squares stay spread over the board. It SHALL then
place `⌊w·h/5⌋` gems on a shuffled subset of the candidates.

Searching square-plus-direction pairs rather than squares is required for
correctness: a square may only be enterable heading one way and only leavable
heading another, so a gem there could be collected but never returned from.

#### Scenario: Every generated board is completable

- **WHEN** a board is generated for any preset
- **THEN** the route solver finds a route from the start that collects every gem

#### Scenario: Generated boards reproduce the C generator byte for byte

- **WHEN** `newDesc` is run for a recorded preset and seed
- **THEN** the desc equals the desc the C generator produced for that preset and
  seed (the differential fixture)

### Requirement: Solve installs a route the player follows

`solve` SHALL compute a route — a sequence of directions from the ball's current
position that collects every remaining gem — by building the move graph (a vertex
at every square the ball can come to rest, plus a *directed* vertex at every gem
the ball can slide through, since a gem passed through in one direction cannot be
left in another), growing a tour that splices in a detour to one as-yet-uncollected
gem after another until none remain, and then repeatedly replacing redundant
sections of the tour with shortest paths until it stops shrinking. It SHALL return
an error when some remaining gem is unreachable.

Because the tour is an approximate solution to a travelling-salesman problem and
not a deduction, the route is **not** required to reproduce the one the C
reference finds. Two tours SHALL be grown — one reaching for the nearest
uncollected gem, one for the farthest — and the shorter kept, which yields a
route no longer than C's on every board of the differential fixture.

The solve move SHALL **install** that route into the game state rather than
completing the game: the game remains in progress until the player collects the
last gem, and the status bar SHALL report that the auto-solver was used. While a
route is installed:

- the renderer SHALL draw an arrow on the ball pointing along the route's next
  direction;
- Enter/Space SHALL play that direction;
- a move that follows the route SHALL advance it;
- a move that deviates SHALL cause the game to **re-solve** from the new position
  and install the new route, or discard the route when the new position admits no
  route;
- death, or the collection of the last gem, SHALL discard the route.

#### Scenario: Following the route advances it

- **WHEN** a route is installed and the player plays the direction the arrow shows
- **THEN** the route advances to its next step and the arrow points along it

#### Scenario: Deviating from the route re-solves

- **WHEN** a route is installed and the player plays some other legal direction
- **THEN** the game installs a freshly computed route from the resulting position

#### Scenario: The route is no worse than the C reference's

- **WHEN** a route is computed for a board in the differential fixture
- **THEN** it collects every gem without the ball dying, and is no longer than
  the route the C solver found for the same board

#### Scenario: Solve does not finish the game

- **WHEN** the player invokes Solve on a board with gems remaining
- **THEN** the ball has not moved, the gems are still uncollected, and the game
  reports itself as still in progress

### Requirement: Rendering, animation and the status bar

The game SHALL render walls with a bevel, mines, stop-squares as rings, gems as
diamonds, and the ball as a circle (a jagged red splat when dead) drawn over a
blitter-saved background, with the route arrow when a route is installed. A move
SHALL animate the ball sliding along its path, in a time proportional to the
square root of the distance travelled, with each gem disappearing as the ball
reaches it. Death SHALL flash the board red and the winning move SHALL flash it
light. The status bar SHALL show the remaining gem count, `DEAD!` when dead,
`COMPLETED!` when finished, and a running deaths tally.

The deaths tally SHALL be incremented only for a death caused by a move the player
just made on an unfinished board, so that undoing and redoing a fatal move does
not re-count it.

#### Scenario: Undo and redo do not re-count a death

- **WHEN** the player dies, undoes the fatal move, and redoes it
- **THEN** the deaths tally still reads 1

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

