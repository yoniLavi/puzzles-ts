## ADDED Requirements

### Requirement: Filling provides an explained deduction hint

The `filling` game SHALL implement `hint(state)` returning a plan-carrying,
narrated hint that explains *why* each move is forced (the fork's hint quality
bar), and `hintKeepTrack` so the plan auto-advances as the player follows it.
The hint SHALL refuse (a `{ ok: false }` result) when the board is already
solved or when `findMistakes(state)` is non-empty, since a deduction seeded from
contradictory marks would mislead. Otherwise it SHALL deduce, from the player's
current board, an ordered sequence of forced steps that together solve the
board, returning one narrated `HintStep` per step.

A step MAY force **several squares at once** when a single deduction pins them
together (the "one firing = one journey" bar): the region-growth deduction —
the empty squares a region cannot reach its size without — SHALL be emitted as
**one step filling all of them**, narrated as either *fitting exactly* into
those squares (the group completes the region) or the region being unable to
*fully grow* without them (it still needs more). Cells no region-growth group
covers SHALL be forced individually by the remaining rules — a cell no
neighbouring region can grow into (a region of one — a 1), a cell where every
number but one is eliminated (the survivor), or a region's single
flood-reachable growth square. Each step's narration SHALL name the deduction
that forces it and SHALL avoid repeating the region's number. `hintKeepTrack`
SHALL report `"completed"` when the player's move fills all of the step's
squares with the hinted value, `"onTrack"` (shrinking the step to the
still-empty squares) when it fills only some of them, and `"off"` when it
touches any other cell or uses the wrong value.

`redraw` SHALL render the displayed step: the target square(s) given a **mild
"fill here" highlight with no digit drawn in them** (a call to action, not a
filled-in answer — the value is read from the narration), and the deduction's
**evidence shaded as an area** in a lighter hint colour — the region the
deduction reasons about, or the neighbouring cells that pin a lonely /
eliminated cell — so the shaded picture the narration names is visible. The
evidence cells' digits SHALL remain readable on the shaded fill, and the shaded
area SHALL never include a target square.

#### Scenario: Hint explains the next forced move and solves the board

- **WHEN** `hint` is called on an unsolved, mistake-free generated board
- **THEN** it returns `{ ok: true }` with a non-empty list of steps
- **AND** each step's move is a legal `executeMove` whose narration names the
  deduction (region growth / lonely cell / elimination) that forces its squares
- **AND** applying every step's move in order solves the board

#### Scenario: One firing forces several squares as a single step

- **WHEN** a region cannot reach its size without more than one empty square
- **THEN** `hint` emits a single step whose move fills all those squares
- **AND** its narration reads as the region fitting exactly into them, or being
  unable to fully grow without them

#### Scenario: Region-based steps show visible evidence

- **WHEN** `hint` returns a plan for a generated board
- **THEN** every region-growth step carries a non-empty shaded area, and no
  step shades one of its own target squares

#### Scenario: Hint refuses on a solved or mistaken board

- **WHEN** `hint` is called on a solved board, or on a board where the player
  has filled a cell contradicting the unique solution
- **THEN** it returns `{ ok: false }` with an explanatory error

#### Scenario: Following a multi-square hint advances or shrinks the plan

- **WHEN** the player fills all of the current step's squares with its value
- **THEN** `hintKeepTrack` returns `"completed"`
- **AND** filling only some of them returns `"onTrack"` with the step shrunk to
  the squares still to fill
- **AND** a move touching any other cell, or using a different value, returns
  `"off"`
