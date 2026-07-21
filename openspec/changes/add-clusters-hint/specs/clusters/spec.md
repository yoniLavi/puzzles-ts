# clusters Specification Delta — add-clusters-hint

## ADDED Requirements

### Requirement: Clusters provides an explained deduction hint

Clusters SHALL implement the `hint` and `hintKeepTrack` hooks so a player can ask
why the next move is forced. A hint SHALL be computed from the game's own
contradiction solver — the solver and the hint SHALL be two projections of one
deduction engine — so that every hinted move corresponds to a deduction the solver
actually makes, in the solver's order.

Each hint step SHALL explain *why* the move is forced, not merely which cell to
colour: it SHALL name the rule that the opposite colouring would violate — a cell
wholly surrounded by the other colour, a given dot that would touch a second
same-colour cell, or a non-dot cell that could no longer reach two same-colour
neighbours — stating the premise, the contradiction, and the conclusion. The
forced cell SHALL be highlighted as the hint target and the neighbouring cells
that form the deduction's evidence SHALL be shaded, so the reasoning is visible on
the board and not only in prose. The hint SHALL NOT pre-place the forced colour.

A deduction that forces a move only through the solver's one-level lookahead SHALL
be presented as a single multi-leg journey: the hypothetical, the forced
consequences shown one board mark at a time, and the final contradiction — never a
single dense sentence, and never an un-narrated "only one option fits" fallback.
Every board the shipped generator can emit SHALL be solvable by the narratable
deduction; a board that would require un-narratable nested speculation SHALL be
rejected at generation rather than hinted without an explanation.

A hint SHALL be refused, with an explanatory banner, when the board is already
solved or contains a rule violation (as reported by `findMistakes`), because a
hint cannot deduce from a contradictory board.

#### Scenario: A forced move is explained by the rule it would break

- **WHEN** a hint is requested on a solvable, mistake-free board
- **THEN** the forced cell is highlighted with its evidence neighbours shaded, and
  the explanation names the rule (wholly surrounded, dot overcount, or
  cannot-reach-two) that the opposite colour would violate

#### Scenario: A lookahead deduction unfolds as one journey

- **WHEN** the next forced move follows only from the one-level lookahead
- **THEN** it is presented as one multi-leg hint — the hypothesis, the forced
  consequences added one mark at a time, and the contradiction — that auto-plays
  as a single hint

#### Scenario: A hint is refused on an unsolvable or mistaken board

- **WHEN** a hint is requested on a board that is solved, or that contains a
  rule-violating cell
- **THEN** no move is hinted and an explanatory banner is shown
