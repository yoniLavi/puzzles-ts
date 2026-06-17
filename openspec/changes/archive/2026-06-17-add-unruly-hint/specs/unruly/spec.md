## ADDED Requirements

### Requirement: Unruly provides an explained deduction hint and a placement animation

The `unruly` game SHALL implement `hint(state)` returning a plan-carrying,
narrated hint that explains *why* each move is forced (the fork's hint quality
bar), and `hintKeepTrack` so the plan auto-advances as the player follows it.
The hint SHALL refuse (a `{ ok: false }` result) when the board is already
solved or when `findMistakes(state)` is non-empty, since a deduction seeded from
contradictory marks would mislead. Otherwise it SHALL deduce, from the player's
current marks, the ordered sequence of forced cells (run to fixpoint at the
solver's full strength) and return one narrated `HintStep` per forced cell. Each
step's narration SHALL state the deduction technique that forces the cell — two
of three consecutive cells already equal (a third would be three in a row), a
row or column whose count of one colour is already complete (so the rest are the
other colour), a unique-rows conflict (a cell that would duplicate a full
row/column), or a near-complete row whose single remaining odd-colour cell is
pinned to one window (so every other empty cell is forced). Moves that a single
firing forces (a whole line completing to one colour, a near-complete row's
forced remainder) SHALL be emitted as one journey via `continuesPrevious`, so
they read and auto-play as a single coherent hint. `hintKeepTrack` SHALL report
`"completed"` when the player's move sets the hinted cell to the hinted value and
`"off"` otherwise.

`redraw` SHALL render the displayed step: the target cell in the hint colour with
a preview of the forced colour, and the deduction's **evidence made visible** —
the sibling cells the same journey forces light-shaded in a lighter hint colour
(applied only to still-empty cells, so the shade tracks the live board as legs
apply), and filled premise cells (the same-colour pair, the near-complete
reserved window) **ringed** in the hint colour rather than shaded, since a light
shade over a filled tile would hide the colour that is the evidence. Every step
SHALL carry visible evidence — a non-empty shaded area or a ring — never a bare
conclusion.

Independently of hints, the game SHALL implement `animLength` so that a `place`
move which changes a cell animates: `redraw` SHALL grow the new colour from the
cell centre to full over the animation, drawing the previous colour beneath. The
animation SHALL be geometric (palette-index based, no colour tween), settle to
the plain new colour, and coexist with the completion flash. Because the base
animation length is non-zero, a hint-executed move SHALL play stretched to the
uniform hint-step duration, so auto-hint reads as continuous fills.

#### Scenario: Hint explains the next forced move

- **WHEN** `hint` is called on an unsolved, mistake-free generated board
- **THEN** it returns `{ ok: true }` with a non-empty list of steps
- **AND** the first step's move is a legal `executeMove` whose narration names the
  technique (three-in-a-row / completed count / unique rows / near-complete) that
  forces its cell
- **AND** applying every step's move in order solves the board

#### Scenario: One firing reads as one journey

- **WHEN** a single completed-count or near-complete firing forces several cells
- **THEN** those cells are emitted as consecutive steps, the first beginning a
  journey and the rest flagged `continuesPrevious`
- **AND** the per-cell techniques (three-in-a-row, unique rows) emit independent
  steps

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
- **THEN** `hintKeepTrack` returns `"completed"`
- **AND** a move that sets a different cell, or the hinted cell to a different
  value, returns `"off"`

#### Scenario: A placement animates as a growing fill

- **WHEN** a `place` move changes a cell and `redraw` runs mid-animation
- **THEN** the cell draws its previous colour beneath the new colour growing from
  the centre
- **AND** at rest the cell shows the plain new colour
