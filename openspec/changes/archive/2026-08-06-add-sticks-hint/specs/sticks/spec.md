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

Where one clue and one rule rule out **several** squares at once, they SHALL be
one journey rather than several hints, each of its later legs saying that it
continues the same argument while keeping its own square's specifics.

The hint SHALL show where to act in the game's own vocabulary — the forced
square carrying a line of the forced orientation, in the hint colour, since a
uniform highlight could not say *which* orientation, and that is the whole of
the move. It SHALL NOT draw the line in the colour of a placed line. It SHALL
also show the evidence its reasoning rests on, marked so that the evidence does
not hide what makes it evidence. Where the explanation states a count — a run's
length, the room a line has left, the lines or open sides a black clue has —
the marked squares SHALL number what the explanation says, so the player can
count the picture against the words. Where the explanation names a run or a
span, that run or span SHALL be the one the deduction actually walked.

No two roles on the board SHALL share a colour: the hint takes the collection's
hint colour, and the keyboard cursor — which upstream drew in that same colour —
SHALL take one the board has not otherwise spent.

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

#### Scenario: One clue ruling out several squares is one hint

- **WHEN** a single clue and rule force more than one square on the same board
- **THEN** those squares arrive as one continuing journey, each leg naming the
  square it decides and the orientation that square must take

#### Scenario: The forced orientation is visible, not merely described

- **WHEN** a hint step is displayed
- **THEN** the forced square shows a line of the forced orientation in the hint
  colour, and no square shows a line in the placed-line colour that the player
  did not place

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
