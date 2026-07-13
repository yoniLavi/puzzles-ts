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

The game SHALL NOT implement `findMistakes` (every reachable position is legal —
a death is undone, not corrected) and SHALL NOT implement `hint` (see the
route-following requirement: the game's own route arrow is the step-by-step
guide, and no step of an approximate tour is *forced*, so there is no deduction to
narrate).

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

