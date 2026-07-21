# clusters Specification Delta — add-clusters-hint

## ADDED Requirements

### Requirement: Clusters provides an explained deduction hint

Clusters SHALL implement the `hint` and `hintKeepTrack` hooks so a player can ask
why the next move is forced. A hint SHALL be computed from the game's own
contradiction solver — the solver and the hint SHALL be two projections of one
deduction engine — so that every hinted move corresponds to a deduction the
solver can make from the player's current position, and the plan SHALL be
recompute-stable: deterministic scan order, so a hint recomputed after a
followed move continues where the previous plan left off.

Each hint step SHALL explain *why* the move is forced, not merely which cell to
colour: it SHALL name the rule that the opposite colouring would violate — a
tile wholly sealed off from its own colour, a given dot that would touch a
second same-colour tile, or a plain tile that could no longer touch two tiles of
its own colour — stating the premise, the contradiction, and the conclusion in
the necessity voice. The forced cell SHALL be highlighted as the hint target,
and when the contradiction lands on a tile other than the target, that tile
SHALL be marked with a visually distinct ring (distinct from the live-error
frame in both hue and structure) that the narration's "ringed" refers to
uniquely, so the reasoning is visible on the board and not only in prose. The
hint SHALL NOT pre-place the forced colour.

A deduction that forces a move only through the solver's one-level lookahead
SHALL be presented as one step that displays the whole forcing chain statically
on the board: the hypothesis cell as the hint target, each cell the hypothesis
would force marked with the colour it would be forced to (in a form visually
distinct from a placed tile), and the tile where the contradiction lands ringed
— never an un-narrated "only one option fits" fallback. At each lookahead stall
the plan SHALL select the candidate firing with the shortest forcing chain
(deterministically tie-broken), keeping the displayed chain short. Because the
generator gates every board on the depth-1 solver — whose hypothetical
propagation is itself deduction-only — every board the shipped generator can
emit SHALL be solvable by this narratable deduction with no nested speculation.

A hint SHALL be refused, with an explanatory banner, when the board is already
solved, when the board contains a rule violation (as reported by
`findMistakes`), or when the deduction runs into a contradiction from the
player's position (a wrong tile that no local rule yet flags) — in the last
case the banner SHALL say a placed tile must be wrong rather than deduce onward
from a doomed position.

#### Scenario: A forced move is explained by the rule it would break

- **WHEN** a hint is requested on a solvable, mistake-free board
- **THEN** the forced cell is highlighted, and the explanation names the rule
  (sealed off, dot overcount, or cannot-touch-two) that the opposite colour
  would violate, ringing the endangered tile when it is not the target itself

#### Scenario: A lookahead deduction shows its whole forcing chain

- **WHEN** the next forced move follows only from the one-level lookahead
- **THEN** it is presented as one hint step whose narration states the
  hypothesis and the contradiction, with every cell of the forcing chain marked
  on the board with the colour the hypothesis would force it to

#### Scenario: A hint is refused on an unsolvable or mistaken board

- **WHEN** a hint is requested on a board that is solved, that contains a
  rule-violating tile, or whose placed tiles contradict the unique solution
  without yet breaking a local rule
- **THEN** no move is hinted and an explanatory banner is shown
