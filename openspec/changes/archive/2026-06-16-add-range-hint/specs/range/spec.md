## ADDED Requirements

### Requirement: Range provides an explained deduction hint

The `range` game SHALL implement `hint(state)` returning a plan-carrying,
narrated hint that explains *why* each move is forced (the fork's hint quality
bar), and `hintKeepTrack` so the plan auto-advances as the player follows it.
The hint SHALL refuse (a `{ ok: false }` result) when the board is already
solved or when `findMistakes(state)` is non-empty, since a deduction seeded
from contradictory marks would mislead. Otherwise it SHALL deduce, from the
player's current marks, the ordered sequence of forced cells (the remaining
no-recursion solution) and return one narrated `HintStep` per forced cell.
Each step's narration SHALL state the deduction that forces the cell — the
adjacent black square (a neighbour of a black must be white), a clue already
satisfied (its run must stop, so the next cell is black), a clue that would be
overrun (the cell must be black), a clue that can only reach its count one way
(the cell must be white), or a cut-vertex of the white region (it must be
white to keep the white cells connected). `hintKeepTrack` SHALL report
`"completed"` when the player's move sets the hinted cell to the hinted value
and `"off"` otherwise. `redraw` SHALL render the displayed step: the target
cell highlighted in the hint colour with a preview of the forced mark, and the
deduction's **evidence shaded as an area** in a lighter hint colour — the
clue's line of sight (satisfied/overrun), the run it must reach along (reach),
or the non-black cells a cut would isolate (connect) — so the shaded picture
the narration names is visible, not merely a single premise cell. A premise
that cannot take the area shade (an adjacent **black** square, which must stay
black) SHALL instead be **ringed** in the hint colour. The shaded area SHALL be
computed against the board state as each step's deduction fires (the prior
steps applied), so the run grows as the player follows the plan, and SHALL
never include the target cell itself.

Independently of hints, `redraw` SHALL render a **known-white cell — a clue or
a player white mark — with a distinct white fill** (clues are implicitly
white), leaving only undecided cells the neutral background, so a beginner
reads determined state at a glance. The white is derived from the
background-shifting palette helper so it stays distinguishable from the
background.

#### Scenario: Hint explains the next forced move

- **WHEN** `hint` is called on an unsolved, mistake-free generated board
- **THEN** it returns `{ ok: true }` with a non-empty list of steps
- **AND** the first step's move is a legal `executeMove` whose narration names
  the deduction (adjacency / clue / connectedness) that forces its cell
- **AND** applying every step's move in order solves the board

#### Scenario: Every hint step shows visible evidence

- **WHEN** `hint` returns a plan for a generated board
- **THEN** every step carries either a non-empty shaded area or a ringed black
  premise cell — never a bare conclusion — and no step's area contains its own
  target cell

#### Scenario: Hint refuses on a solved or mistaken board

- **WHEN** `hint` is called on a solved board, or on a board where the player
  has marked a cell contradicting the unique solution
- **THEN** it returns `{ ok: false }` with an explanatory error

#### Scenario: Following the hint advances the plan

- **WHEN** the player makes the move the current hint step describes
- **THEN** `hintKeepTrack` returns `"completed"`
- **AND** a move that sets a different cell, or the hinted cell to a different
  value, returns `"off"`
