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
premise cells lightly shaded.

#### Scenario: Hint explains the next forced move

- **WHEN** `hint` is called on an unsolved, mistake-free generated board
- **THEN** it returns `{ ok: true }` with a non-empty list of steps
- **AND** the first step's move is a legal `executeMove` whose narration names
  the deduction (adjacency / clue / connectedness) that forces its cell
- **AND** applying every step's move in order solves the board

#### Scenario: Hint refuses on a solved or mistaken board

- **WHEN** `hint` is called on a solved board, or on a board where the player
  has marked a cell contradicting the unique solution
- **THEN** it returns `{ ok: false }` with an explanatory error

#### Scenario: Following the hint advances the plan

- **WHEN** the player makes the move the current hint step describes
- **THEN** `hintKeepTrack` returns `"completed"`
- **AND** a move that sets a different cell, or the hinted cell to a different
  value, returns `"off"`
