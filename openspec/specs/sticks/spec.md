# sticks Specification

## Purpose
TBD - created by archiving change add-sticks-ts-port. Update Purpose after archive.
## Requirements
### Requirement: Sticks game implements the Game interface

The engine SHALL provide `src/games/sticks/` implementing the `Game`
interface for Sticks (Tatebo-Yokobo), registered so the puzzle is served by the
TypeScript engine.

Parameters SHALL be a width, a height, a percentage of black squares, and a
symmetry (none, 2-way mirror, 2-way rotational, 4-way mirror, or 4-way
rotational). Validation SHALL require width and height each at least 2, and, for a
full parameter check, the black-square percentage between 5 and 100, a known
symmetry, and 4-way rotational symmetry only on a square grid. A game ID SHALL
encode the width, height, black-square percentage and symmetry, and round-trip
through decode; a bare `width x height` ID SHALL decode without a symmetry marker.

Sticks SHALL be a uniquely-solvable logic puzzle and SHALL therefore declare a
`findMistakes` hook, so Check & Save can hard-block a save that contradicts the
solution.

#### Scenario: Every preset produces a uniquely solvable board

- **WHEN** a new game is generated for any preset or legal size
- **THEN** a board is produced that the deductive solver can complete to the
  unique solution

#### Scenario: A game ID round-trips through the parameters

- **WHEN** a parameter set is encoded to a game ID and decoded
- **THEN** the same width, height, black-square percentage and symmetry are
  recovered

### Requirement: Sticks descriptions use the run-length blank encoding

A Sticks description SHALL encode the fixed puzzle data — black cells and clue
numbers — over the grid cells in row-major order: runs of plain blank cells SHALL
be abbreviated with lowercase letters, a black cell SHALL carry a marker with an
optional adjacent clue digit, and a clue number SHALL be written inline as decimal
digits. The description SHALL account for exactly the grid's cell count.

Validation SHALL reject a description that accounts for more or fewer cells than
the grid holds, distinguishing too many from too few, and SHALL reject a
description containing an unknown character.

#### Scenario: A generated description round-trips

- **WHEN** a description is generated and then decoded into a board
- **THEN** re-encoding that board yields the identical description

#### Scenario: A description with the wrong number of cells is rejected

- **WHEN** a description accounting for more or fewer cells than the grid has is
  validated
- **THEN** it is rejected with a message distinguishing too long from too short

### Requirement: Sticks ports the deductive solver and solver-gated generator

Sticks SHALL provide a deductive solver that fills the blank cells with horizontal
or vertical lines consistent with every clue, or reports that the board is
invalid. The solver SHALL work by contradiction on single cells: it SHALL try each
blank cell as one orientation and, when that makes the board provably invalid,
commit the opposite orientation, iterating until no further cell is forced. The
solver SHALL NOT use backtracking, and SHALL classify a board as complete,
unfinished, or invalid.

Validity SHALL be checked against the puzzle rules: a numbered line SHALL have the
stated length, a line SHALL overlap at most one number, and a numbered black cell
SHALL connect to the stated number of lines.

The generator SHALL place black squares under the chosen symmetry, fill and clue
the board, and retain a candidate only while the deductive solver deduces it to a
unique completion; it SHALL then remove clues in a randomised order, keeping each
removal only while the board stays uniquely solvable. Generation from a given seed
SHALL be reproducible.

Sticks offers **one** difficulty tier, so grading it honestly means that tier is
what it claims to be. Every generated board SHALL therefore have **exactly one**
solution, and the shipped deduction SHALL reach it with no guessing anywhere.
Uniqueness SHALL be established by a witness independent of that solver: the
solver returning "complete" reports only on the line of play it followed, and is
not evidence about how many solutions exist. That witness SHALL itself be shown
capable of reporting more than one solution, or the assertion is vacuous.

The two ported look-behind bounds in the segment-reachability computation
(`x > 1` / `y > 1`, where the geometry admits `x > 0` / `y > 0`) SHALL be kept.
They are genuine bugs that make the checker weaker than intended, and they are
retained because correcting them was **measured** to change no verdict on any
board at any offered preset — not merely because upstream wrote them that way.

#### Scenario: The solver completes a soluble board

- **WHEN** a generated board is solved from its clues alone
- **THEN** the solver returns the unique completion, with every numbered line at
  its stated length and every numbered black cell at its stated connection count

#### Scenario: Generation is reproducible from a seed

- **WHEN** the same seed is used twice for the same parameters
- **THEN** both runs produce the identical board description

#### Scenario: A generated board has exactly one solution

- **WHEN** a generated board is enumerated by a search that propagates the shipped
  deduction and branches on the cells it leaves undecided
- **THEN** exactly one solution is found

#### Scenario: The uniqueness witness can report more than one

- **WHEN** that same search is run on a board carrying no clues at all
- **THEN** it reports more than one solution

### Requirement: Sticks input, mistake-checking and completion

Sticks SHALL be played by dragging to draw a line, clicking to place a line
(left-click a vertical line, right-click a horizontal line), or using a keyboard
cursor with keys to place or clear a line. A drag SHALL draw the orientation of
its dominant axis across the cells it passes and SHALL clear matching lines when
started on one. Black cells SHALL never take a line, and placing a line already in
that state SHALL be a no-op that does not reach the undo history.

`findMistakes` SHALL re-solve the board from its fixed clues and flag every cell
whose player-drawn line contradicts the unique solution; a merely missing line
SHALL NOT be flagged. The game SHALL be reported solved when every blank cell
carries a line consistent with all clues, and SHALL flash once on completion.
There SHALL be no interpolated animation of line placement.

#### Scenario: Dragging draws a line

- **WHEN** the pointer is dragged horizontally or vertically within the grid past
  the drag threshold
- **THEN** a line of the dragged orientation is placed in the cells the drag
  crosses

#### Scenario: A contradicting line is flagged as a mistake

- **WHEN** the board is checked and a placed line differs from the unique
  solution's line for that cell
- **THEN** that cell is reported as a mistake

#### Scenario: Completing the grid consistently wins

- **WHEN** every blank cell carries a line consistent with all clues
- **THEN** the game is reported solved and flashes

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

