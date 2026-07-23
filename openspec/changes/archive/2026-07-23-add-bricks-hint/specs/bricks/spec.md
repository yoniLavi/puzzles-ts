# bricks Specification Delta — add-bricks-hint

## ADDED Requirements

### Requirement: Bricks provides an explained deduction hint

Bricks SHALL implement the `hint` and `hintKeepTrack` hooks so a player can ask
why the next move is forced. A hint SHALL be computed from the game's own
contradiction solver — the solver and the hint SHALL be two projections of one
deduction engine — so that every hinted move corresponds to a deduction the
solver can make from the player's current position, and the plan SHALL be
recompute-stable: a deterministic scan order, so a hint recomputed after a
followed move continues where the previous plan left off.

Each hint step SHALL explain *why* the move is forced, not merely which cell to
act on: for a single-cell contradiction it SHALL name the concrete rule the
opposite colour would violate — three shaded bricks in a horizontal row, a shaded
brick with no shaded brick beneath it to rest on, or a clue that the change would
push above or below its shaded-neighbour count — stating the premise, the
contradiction, and the conclusion in the necessity voice. The forced cell SHALL
be highlighted as the hint target and the deduction's evidence cells SHALL be
marked distinctly on the board so the reasoning is visible and not only in prose.
The hint SHALL NOT pre-place the forced colour. Because every Bricks deduction
forces exactly one cell, each hint step SHALL be a single self-contained journey.

A move that is forced only through the solver's recursive lookahead SHALL be
presented as one step narrated as a proof by contradiction: the hypothesis (the
cell taken as shaded or clear) and the contradiction its forced consequences
reach, with the cell(s) where the board breaks marked — never an un-narrated
"only one option fits" fallback. At each lookahead stall the deduction SHALL be
chosen deterministically so the plan stays recompute-stable.

A hint SHALL be refused, with an explanatory banner, when the board is already
solved, when the board contains a rule violation (as reported by
`findMistakes`), or when the player's placed cells contradict the unique solution
without yet breaking a local rule — in the last case the banner SHALL say a
placed cell must be wrong rather than deduce onward from a doomed position.

#### Scenario: A forced move is explained by the rule it would break

- **WHEN** a hint is requested on a solvable, mistake-free board where a
  single-cell contradiction is available
- **THEN** the forced cell is highlighted as the target, its evidence cells are
  marked, and the explanation names the rule (three-in-a-row, a brick left
  unsupported, or a clue's neighbour count) that the opposite colour would
  violate, without pre-placing the forced colour

#### Scenario: A lookahead deduction is narrated as a proof by contradiction

- **WHEN** the next forced move follows only from the recursive lookahead rung
- **THEN** it is presented as one hint step whose narration states the hypothesis
  and the contradiction its forced consequences reach, with the contradiction
  cell(s) marked on the board

#### Scenario: A hint is refused on a solved, mistaken, or wrong-but-legal board

- **WHEN** a hint is requested on a board that is solved, that contains a
  rule-violating cell, or whose placed cells contradict the unique solution
  without yet breaking a local rule
- **THEN** no move is hinted and an explanatory banner is shown, and for the
  last case the banner states that a placed cell must be wrong
