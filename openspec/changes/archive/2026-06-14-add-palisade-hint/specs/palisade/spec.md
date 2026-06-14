## ADDED Requirements

### Requirement: Palisade offers a deduction-based hint

The `palisade` game SHALL implement `Game.hint()` and `Game.hintKeepTrack()`,
surfacing one step of its deductive solver as a narrated, highlighted hint.

`hint(state)` SHALL seed the solver from the player's current state — the
player's walls copied into the solver's borders, and every player no-wall mark
(`DISABLED` bit) pre-merged into the solver's DSF — then run the six deductions
to a fixpoint, recording in discovery order every edge the deductions force: a
**wall** for each newly-set `disconnect`, and a **no-wall** for each
individually-forced `connect` (a clue whose walls are all placed, two edges to
one region the clue cannot afford as walls, or an under-sized region whose
single growth target is reached by exactly one undecided edge). Each recorded
edge SHALL become one `HintStep` whose move is the two-sided `edges` edit that
sets that edge to the forced state, whose explanation names the rule that fired
— phrased as advice that has **not** yet been applied ("must be a wall" /
"can't be a wall", never "is a wall" / "has none") — and whose highlights
identify every element the explanation references: the target edge, any sibling
edges ("these two edges"), and the referenced cells (a clue pair, or the region
the deduction reasons about). The full chain SHALL be returned as the plan (one
forced edge per step), so a single request shows the next deduction and auto-hint
can play the whole chain.

`hint()` SHALL refuse — returning `{ ok: false }` with a readable reason —
when the board is already solved, or when `findMistakes(state)` reports any
mistake, so a hint is never derived from a wrong wall or mark. When the clue set
is not uniquely solvable (so no deduction is found) it SHALL likewise return an
error rather than a plan.

`hintKeepTrack(move, step, state)` SHALL return `"completed"` when the player's
`edges` move toggles the step's hinted edge into its forced state (side- and
button-checked: a wrong-button click on the same edge does not complete the
step), and `"off"` otherwise.

The renderer SHALL paint the action edge (the one to set this step) in
`COL_HINT`, any *related* sibling edge in a visibly distinct `COL_HINT_SIBLING`
(so "this edge" is never confused with the edge merely referenced alongside
it), and shade every referenced cell in a `COL_HINT_CELL` background — folding
the highlight into the per-tile cache so it appears when shown and clears when
the midend drops the plan. For the `equivalentEdges` deduction the shaded cells
SHALL be the region the two edges border, **not** the clue cell that decides
the edges. Seeding the hint from the player's state SHALL NOT mutate that
state, and running the solver without a recorder SHALL behave exactly as before
(the `solve`, `findMistakes`, and generator paths are unchanged).

#### Scenario: Next deduction is surfaced and solves the board

- **WHEN** `hint()` is called on a fresh, uniquely-solvable Palisade board
- **THEN** it returns a non-empty plan whose steps are forced edges in
  discovery order
- **AND** applying every step's move in order brings the board to a solved state

#### Scenario: A player no-wall mark is not re-hinted

- **WHEN** the player has marked an edge "no wall" that the solver would also
  deduce as no-wall
- **THEN** that edge does not appear as a step in the returned plan (its fact is
  already seeded into the solver's DSF)

#### Scenario: Hint refuses on a mistaken or solved board

- **WHEN** `hint()` is called on a board carrying a wall the unique solution
  lacks, or on an already-solved board
- **THEN** it returns `{ ok: false }` with a human-readable error and no plan

#### Scenario: Following the hinted edit advances the plan

- **WHEN** a hint step is displayed and the player makes the exact hinted edge
  edit
- **THEN** `hintKeepTrack` returns `"completed"`
- **AND** a wrong-button click on the same edge, or an edit on a different edge,
  returns `"off"`

#### Scenario: The hint highlights every referenced element distinctly

- **WHEN** `redraw` is given a displayed hint step with a sibling edge and
  referenced cells
- **THEN** the action edge is painted in `COL_HINT`
- **AND** the sibling edge is painted in the distinct `COL_HINT_SIBLING`
- **AND** every referenced cell is shaded in `COL_HINT_CELL`
- **AND** with no hint step the tiles draw without any of those hint colours
