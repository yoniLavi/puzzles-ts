# ts-engine — deltas for fix-sixteen-hint-recompute-stability

## REMOVED Requirements

### Requirement: Sliding-permutation games share one slide planner

**Reason**: Replaced by the requirement of the same shape below, which differs on
the one point that matters: the old one let a game **choose when** the exact
search runs, and named a no-progress gate as a part the planner owns. That is not
a tuning knob with a bad default — it is the defect. A shortest plan climbs on
its way home, so a search armed only where the board looks nearly finished, or
only where the heuristic has proved helpless, switches off partway down the
descent it opened and hands the board back to the heuristic that walks it
straight back. Sixteen's 5×5 hint cycled with period 4 for exactly this reason.

The old requirement's scenario "The expensive search stays gated" is therefore
not merely superseded but unsatisfiable: its precondition is a game asking for
the search "only as a last resort", and that is no longer something a game can
ask for. Keeping it under a `MODIFIED` block would leave a vacuous scenario
asserting behavior nothing can reach, which is why this is a removal and a
re-statement rather than an edit.

**Migration**: Both consumers were converted in this change. `exactSearch` loses
its `when` field and `SlidePlan` loses `usedExactSearch`, which existed only so a
game's tests could assert the gate still gated; the two tests that read it are
replaced by ones that assert the plan itself. Everything else about the
requirement carries over verbatim below.

## ADDED Requirements

### Requirement: Sliding-permutation games share one slide planner whose exact search always runs

The engine SHALL provide a shared toroidal slide planner
(`src/engine/slide-planner.ts`) that every sliding-permutation game's
`hint` uses, rather than each game carrying its own copy of the search.

The planner SHALL own the parts that are hard and game-independent: a heuristic
forward search over slide moves; an exact bidirectional search that returns a
**shortest** path; and a **partial-plan** result when the search improves on the
starting board without reaching the goal (the plan runs out, the player is
closer, and the next request recomputes).

The planner SHALL work on **the board as the player sees it** — one integer per
cell, whose meaning is the game's — and SHALL NOT distinguish two boards that
look alike. A game whose pieces are not all distinct (Netslide's wire masks)
otherwise has the planner chasing arrangements no sequence of slides can produce:
on an odd-width torus every slide is an even permutation, so a target that
distinguishes identical pieces may sit in an unreachable coset while the finished
picture is a move away.

The planner SHALL be parameterized on what genuinely differs between games — the
grid, the legal move set (including whether a slide may cover more than one
step), the finished board, the goal test, and **how far from finished a board
is** — and SHALL contain no game-specific narration or rendering.

**The exact search SHALL run on every board**, before the heuristic search, and a
game SHALL supply only its budget — never a condition under which it runs. A game
that cannot afford the search omits it entirely; there is no third option.

This replaces a rule that let a game hold the search back for the boards that
needed it — as a last resort where the heuristic proved helpless, or behind a
cheap test for "nearly finished". Both cycle, and the reason is structural rather
than a matter of tuning: **a shortest plan does not look like progress on the way
home**, so a gate keyed on any cheap board measure switches off partway down the
descent the search itself opened, the heuristic takes back over, and it walks the
board back where it came from. Sixteen's 5×5 hint did exactly this — a period-4
cycle in which the board reached four tiles from finished and left again, for
ever — and the same board's shortest plan peaks at 17 tiles out of place and a
total travel of 30 on its way home from 9 and 9. Three gates were measured and
all three cycled.

The cost this rule accepts is the searches on boards too far away to reach, which
spend their whole budget and come back empty. A game's budget SHALL therefore be
the smallest that still crosses its worst endgame rather than the largest it can
afford, and the planner's own state storage SHALL be allocation-free and packed,
because how much a failed search costs is what decides whether the guarantee is
affordable at all.

The planner's consumers SHALL be guarded by their own hint suites and by the
cross-game resume walk, which is the only guard that sees this class of defect: a
walk that follows a plan to its end never recomputes, and so is green on a game
whose hint ping-pongs.

#### Scenario: A second sliding game reuses the planner

- **WHEN** a sliding-permutation game other than Sixteen implements `hint`
- **THEN** it supplies its own legal moves, distance measure, goal test and
  narration, and reuses the shared search rather than re-implementing it

#### Scenario: The exact search is not held back for the boards that need it

- **WHEN** a game configures the exact search
- **THEN** it runs on every board the game hints on, with no condition available
  for the game to attach to it

#### Scenario: A search that cannot reach the goal still helps

- **WHEN** the forward search improves on the starting board but exhausts its
  budget before reaching the goal
- **THEN** the planner returns the partial plan to its best board, rather than
  failing

#### Scenario: The exact search returns a shortest plan

- **WHEN** the exact search reaches the goal
- **THEN** the plan it returns is a shortest sequence of moves to it, so that
  playing its first move leaves the board strictly nearer the goal

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
