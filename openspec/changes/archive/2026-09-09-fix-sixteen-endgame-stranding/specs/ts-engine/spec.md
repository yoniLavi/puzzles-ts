# ts-engine — deltas for fix-sixteen-endgame-stranding

## ADDED Requirements

### Requirement: The slide planner SHALL carry a last resort bounded by depth rather than by memory

The shared slide planner SHALL offer a second exact search for the boards its
state-bounded search cannot reach, and that search SHALL be bounded by **depth**
rather than by stored states: a breadth-first **endgame database** of every board
within a given number of slides of the goal, kept between hints because it
depends only on the goal and the move set, and a depth-first walk from the board
that slides a line in place and slides it back, holding one board however deep it
goes.

**The reason it must be shaped that way is a measurement, not a preference.**
Sixteen's swapped-pair endgames sit exactly nine moves from finished while
reading as two cells out, and the state-bounded search reaches eight at that
board size. Reaching nine by storing states costs 18–24 million of them, about
ten seconds and the better part of a gigabyte, which a browser tab may not spend;
so the hint gave up on those boards — twelve of forty walked 5×4 games and five
of forty 5×5 ones — saying no move would get the player closer, on boards that
were perfectly solvable. Splitting the same nine plies into a kept four-ply
database and a five-ply walk costs tens of megabytes and a few seconds, once per
game.

A game SHALL declare only the two depths, never a condition under which the
search runs. **The deep search SHALL reach at most one ply further than the
ungated search**, and this is the property that makes it safe to gate at all: a
plan it opens is then at most one move longer than the ungated search can
finish, so playing that plan's first move leaves a board the ungated search
handles, on every board, because the ungated search has no condition on it. Two
plies further would leave a board nothing ungated can finish, the gate would shut
on it, and the recompute cycle that `fix-sixteen-hint-recompute-stability`
removed would return.

**The database's completeness SHALL be asserted directly**, not inferred from the
search's answers. A hash index that narrows its key — a Zobrist hash stored in an
`Int32Array` and compared against an unsigned copy of itself — does not fail when
it is wrong; it goes half blind, returns "no plan" on boards it holds, and reads
exactly like a search that cannot reach far enough. It survived a full round of
measurement and produced a confident wrong conclusion about which boards were
reachable. An end-to-end agreement check does **not** catch it at test-sized
depths, because losing half of a small database changes no answer.

#### Scenario: A board past the state-bounded search still gets a plan

- **WHEN** a hint is asked on a board beyond the reach of the planner's
  state-bounded search, where the heuristic search is also at a strict local
  minimum
- **THEN** the deep search returns a shortest plan within its declared depths,
  rather than the planner returning nothing

#### Scenario: The two exact searches agree

- **WHEN** the same board is planned by the state-bounded search and by the deep
  search, both within reach
- **THEN** they return plans of the same length, each reaching the goal

#### Scenario: The database is asked whether it holds a board it must hold

- **WHEN** the deep search is configured to walk no plies at all, and asked about
  a board fewer slides from the goal than its database is deep
- **THEN** it returns a plan for that board, because the database holds every
  such board and can match it

#### Scenario: Following the deep search's plan converges

- **WHEN** a plan from the deep search is followed one move at a time, with a
  fresh plan computed after each move
- **THEN** each plan is strictly shorter than the last, and the walk reaches the
  goal

## MODIFIED Requirements

### Requirement: The hint walk SHALL cover every preset a game offers

The cross-game guarantee that following hints solves the board, from any reached
position, SHALL be asserted over **every leaf preset** of every hinting game, not
over one of them.

It was asserted over `firstLeaf(game.presets())` — by convention the smallest and
easiest board a game offers — for thirty games. The guard therefore had never
seen a Hard board, an `Unreasonable` board, or any mode variant, while reading as
the collection's strongest hint guarantee. Widened (2026-09-08) it walked **209
preset cases** and reported thirteen refusals that the narrow form could not
reach, all of them a real finding.

The sweep SHALL carry a vacuity count of preset cases walked, and its cost SHALL
be tiered rather than paid per commit — with the per-commit slice keeping at
least one preset **per axis the game actually varies**: one per declared tier for
a game that has tiers, and the first and last preset for one that does not.

Keying the slice on tier alone is not sufficient, and that is a measurement
rather than a precaution. Every preset of an untiered game carries the same tier
key, so such a game collapsed to its first preset — reinstating, for the twelve
untiered hinting games, exactly the first-leaf blindness the widening existed to
remove, on the same day it removed it. Sixteen is untiered with five presets: its
3×3 walks in seven moves and its 5×5 hint cycled for ever, and only the slow tier
could see it.

**Any cross-game sweep over presets SHALL ask the same question**, and the answer
SHALL be derived from the game rather than assumed. A second sweep keyed on tier
did worse than sample one preset of an untiered game: it skipped such games
before reaching its own vacuity count, so twelve of the thirty hinting games were
outside it while it read as covering them all. The shared preset enumeration
these sweeps derive their population from lives with the other cross-game hint
testing helpers, so a sweep does not re-answer it.

**A sweep's finding SHALL be pinned by its shape where it has one, rather than by
more sampling.** The stranding above appears on about a fifth of boards, which no
affordable number of seeds catches reliably; every instance is the same
recognizable board shape, and a test that names two such boards asserts the same
property deterministically in seconds. Seeds remain the wrong dial to turn.

#### Scenario: A hint works on Easy and gives up on Hard

- **WHEN** a game's hint cannot walk a board dealt from a preset at a
  deduction-complete tier
- **THEN** the walk fails, naming the game, the preset and the position

#### Scenario: A game gains a preset

- **WHEN** a preset is added to a game's menu
- **THEN** it is walked from that commit, with no line added anywhere to enroll
  it

#### Scenario: An untiered game's largest board is walked per commit

- **WHEN** a hinting game declares no difficulty contract, so every preset it
  offers carries the same tier key
- **THEN** the per-commit slice walks its last preset as well as its first,
  rather than collapsing the game to one board

#### Scenario: A sweep meets a game with no tiers

- **WHEN** a cross-game sweep varies a game's params by tier, and the game
  declares no difficulty contract
- **THEN** it varies that game by preset instead of skipping it, and its vacuity
  count counts what it actually looked at
