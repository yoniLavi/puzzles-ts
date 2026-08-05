# sticks Specification Delta — add-sticks-hint

## ADDED Requirements

### Requirement: Sticks provides an explained hint

Sticks SHALL implement `hint()`, planning from the player's **current** marks
and narrating each forced move as the deduction that forces it. It SHALL be
enrolled in the shared hint-bearing game list, so the cross-game resume,
purity, no-op, overlay and narration-quality guards cover it.

Every step SHALL name the technique that forces it. There SHALL be no generic
catch-all step: the shipped deduction decides every uniquely-solvable board
this generator produces, so a plan has no un-narratable residue to fall back
on.

A step's explanation SHALL name **which clue** the tentative line would break
and **how** it would break it, distinguishing at least: a line exceeding its
number, a line that could no longer reach its number, a line covering two
numbers, a black clue gaining more lines than it counts, and a black clue
losing a side it still needed. The failing clause SHALL be recorded where the
contradiction is detected, not re-derived when the step is narrated.

The explanation SHALL state its conclusion in the necessity voice of a
deductive game, and SHALL refer to a clue by the number the player can see.

The hint SHALL highlight where to act and the evidence its reasoning rests on,
and SHALL NOT draw the line as though it were already placed. Where the
explanation names a run or a span, that run or span SHALL be the one the
deduction actually walked.

Requesting a hint on a board contradicting its own clues SHALL refuse and
surface the mistakes, rather than deducing from a wrong position.

Recording SHALL be confined to the hint path: the generator's solve calls SHALL
be unchanged, and the frozen description fixtures SHALL NOT move.

#### Scenario: A forced line is explained by the clue it would break

- **WHEN** a hint is requested on a board where one orientation of a square
  would violate a clue
- **THEN** the step names that clue and the way the tentative line breaks it,
  and concludes that the square must take the other orientation

#### Scenario: A hint resumes from a self-played position

- **WHEN** a hint is requested from a board the player reached by their own
  correct moves
- **THEN** the plan makes progress and continues to lead to the solved board

#### Scenario: A hint never repeats a move already made

- **WHEN** a plan step is reached
- **THEN** the move it asks for changes the board

#### Scenario: A mistaken board is refused honestly

- **WHEN** a hint is requested on a board that contradicts its clues
- **THEN** the hint refuses and the contradicting squares are highlighted

#### Scenario: Recording does not disturb generation

- **WHEN** boards are generated for a fixed seed with the hint recorder present
  in the build
- **THEN** the descriptions are identical to those the frozen fixtures record
