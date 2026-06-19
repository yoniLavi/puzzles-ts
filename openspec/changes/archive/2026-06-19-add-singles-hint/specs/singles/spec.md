## ADDED Requirements

### Requirement: Singles provides an explained deduction hint

The `singles` game SHALL implement `hint(state)` returning a plan-carrying,
narrated hint that explains *why* each move is forced (the fork's hint quality
bar), and `hintKeepTrack` so the plan auto-advances as the player follows it.
The hint SHALL refuse (a `{ ok: false }` result) when the board is already
solved or when `findMistakes(state)` is non-empty, since a deduction seeded from
contradictory marks would mislead. Otherwise it SHALL run the deductive solver
from the player's current marks, recording each forced cell in deduction order
with the deduction that forces it, and return the ordered sequence of narrated
`HintStep`s (the remaining solution).

Each step's narration SHALL state the deduction that forces the cell: two equal
numbers one cell apart forcing the middle white; an adjacent equal pair
blackening the other copies in its line; a 2×2 board-corner argument
(four/three/two matching numbers); an offset-pair pattern; a white cell with a
single non-black neighbour forcing that neighbour white; a square whose
shading would split the white region forcing it white; a cell adjacent to a
shaded square forcing it white; or a number sharing a line with a circled white
forcing it shaded. A single deduction that forces **two cells at once** (the
four-in-a-corner pair, an offset-pair's two whites) SHALL be emitted as **one**
multi-cell `HintStep`, not two.

`redraw` SHALL render the displayed step: the target cell(s) highlighted in the
hint colour with a preview of the forced mark (a shaded inset to blacken, a ring
to keep white), and the deduction's **evidence** rendered so the narration's
premise is visible — **shaded** in a lighter hint colour where the evidence is
an undecided number cell (its digit drawing on top), and **ringed** in the hint
colour where the evidence is an already-decided cell whose black or circled
state is itself the reason (an adjacent shaded square; a circled white using up
a number). Every step SHALL carry visible evidence — a non-empty shaded area or
a ringed premise — never a bare conclusion.

Where a single deduction has premise cells in **distinct roles**, those roles
SHALL be rendered in distinct colours, so the highlight does not imply cells
share a role they do not. Specifically, a 2×2-corner deduction SHALL distinguish
the **matching pair** (the cells that share a number, shaded as evidence) from
the **protected corner** (the cell that would be sealed off, drawn in its own
distinct colour). The three roles (target, evidence, protected corner) SHALL be
mutually disjoint — no cell carries two roles. The corner deduction's narration
SHALL name the **actual numbers** involved (not generic "this square / its other
neighbour") and follow the proof-by-contradiction order it embodies — the
signal (the touching matching pair), the move being ruled out (shading the
target), its consequence (the corner's other neighbour forced shaded, the corner
boxed in), and the deduction (the target stays white) — e.g. "One of the two
touching 3s must be shaded. Shading this 5 would force the 3 beside the corner 4
shaded as well, leaving the corner boxed in on both sides — so the 5 stays
white."

`hintKeepTrack` SHALL report `"completed"` when the player's move sets exactly
the hinted cell(s) to the hinted value, `"onTrack"` (shrinking a multi-cell step
in place to the cells still outstanding) when the move fills a strict subset of a
multi-cell step's cells with the hinted value and nothing else, and `"off"`
otherwise.

#### Scenario: Hint explains the next forced move

- **WHEN** `hint` is called on an unsolved, mistake-free generated board
- **THEN** it returns `{ ok: true }` with a non-empty list of steps
- **AND** the first step's move is a legal `executeMove` whose narration names
  the deduction (sandwich / pair / corner / offset / connectivity / cascade)
  that forces its cell
- **AND** applying every step's move in order solves the board

#### Scenario: A two-cell firing is one step

- **WHEN** the deduction that fires forces two cells simultaneously (a 2×2
  corner with four matching numbers, or an offset-pair pattern)
- **THEN** the hint emits a single `HintStep` whose move sets both cells

#### Scenario: A corner deduction separates the corner from the matching pair

- **WHEN** a 2×2-corner deduction fires (e.g. a top-left 2×2 of `[[4,3],[5,3]]`,
  where the two 3s match and the 4 corner would be sealed off)
- **THEN** the matching pair is the shaded evidence, the corner is the distinct
  "protected corner" role in its own colour, and the forced cell is the target —
  the three roles disjoint
- **AND** the narration names the actual numbers and follows the contradiction
  arc (e.g. "One of the two touching 3s must be shaded. Shading this 5 … leaving
  the corner boxed in … — so the 5 stays white"), not the old "two corner squares"

#### Scenario: Every hint step shows visible evidence

- **WHEN** `hint` returns a plan for a generated board
- **THEN** every step carries either a non-empty shaded area or a ringed premise
  cell — never a bare conclusion

#### Scenario: Hint refuses on a solved or mistaken board

- **WHEN** `hint` is called on a solved board, or on a board where the player has
  marked a cell contradicting the unique solution
- **THEN** it returns `{ ok: false }` with an explanatory error

#### Scenario: Following the hint advances the plan

- **WHEN** the player makes the move the current hint step describes
- **THEN** `hintKeepTrack` returns `"completed"` (or `"onTrack"` when a
  multi-cell step is filled one cell at a time)
- **AND** a move that sets a different cell, or the hinted cell to a different
  value, returns `"off"`
