# crossing Specification Delta — add-crossing-hint

## ADDED Requirements

### Requirement: Crossing explains its next deduction

Crossing SHALL provide an explained hint that computes a plan of forced moves
from the player's current board and narrates each one by the deduction that
forces it, meeting the project's hint quality bar: the narration SHALL state
*why* the move is forced — the premise that singles out this conclusion — and not
merely what to enter.

The hint SHALL be derived from the same deduction engine as the solver, replayed
one firing at a time, and SHALL NOT alter the solver, the generator or the
description codec.

Because the solver reports *which* candidates a run's still-fitting numbers rule
out but carries no name for the technique that did so, the hint SHALL re-derive
the named technique — that only one listed number still fits the run, that every
still-fitting number agrees on a digit in this position, or that the across and
down numbers crossing in a square admit only one digit in common — rather than
narrating the bare candidate elimination.

A premise the player can check against the board — which listed numbers match the
lengths and digits they can see — SHALL be preferred to one that depends on
constraints propagated through crossing numbers, and where only the latter is
available the narration SHALL say so rather than asserting the checkable form of
the claim.

Where one named technique can be forced by more than one kind of elimination, the
narration SHALL state the one that actually rules the other candidates out, and
SHALL NOT cite entries the board does not carry.

Crossing admits no guessing at any difficulty, so every step SHALL be narratable
and the hint SHALL NOT fall back on an unexplained "this is the only possibility"
step.

#### Scenario: A run determined by a single remaining number is offered whole

- **WHEN** exactly one unplaced listed number matches a run's length and agrees
  with the digits already entered in it
- **THEN** the hint offers that number as a single placement filling the whole
  run, and the explanation states that only one number still fits

#### Scenario: A positional deduction names what the fitting numbers agree on

- **WHEN** every listed number that still fits a run carries the same digit at
  one position
- **THEN** that cell is offered as that digit, and the explanation states that
  every number still fitting the run agrees on it

#### Scenario: Two crossing numbers agreeing on one digit is offered as its own deduction

- **WHEN** the numbers that can still go in a square's across run admit one set of
  digits there, the numbers that can still go in its down run admit another, and
  the two sets share exactly one digit
- **THEN** that square is offered as that digit, and the explanation names what
  each of the two runs allows

#### Scenario: A premise that needs the crossing numbers says so

- **WHEN** a deduction holds only once constraints propagated through crossing
  numbers have ruled the other candidates out, so a player checking the clue list
  against the board would still see several numbers fitting
- **THEN** the explanation states that the crossing numbers are what rules them
  out, rather than claiming the numbers visibly fail to fit

#### Scenario: The evidence includes the numbers the deduction reasons over

- **WHEN** a hint is displayed whose premise is which listed numbers still fit a
  run
- **THEN** those numbers are highlighted in the clue list as well as the run
  being highlighted on the grid, so the premise the narration cites is visible

### Requirement: One deduction is one hint

A single deduction that forces several cells SHALL be presented as **one** hint
rather than as one hint per cell — most importantly a whole run determined by the
single remaining number that fits it.

The three kinds of action Crossing admits — placing a whole number into a run,
entering a single digit, and ruling a candidate out of a cell's notes — SHALL
each be marked in the shape of the action it represents, so that one hint colour
cannot stand for two different actions. A ruled-out candidate SHALL be marked on
the candidate itself rather than on the whole cell.

#### Scenario: A run filled by one deduction is a single hint

- **WHEN** a deduction determines every cell of a run at once
- **THEN** one hint is presented covering the whole run, not one hint per cell

### Requirement: A displayed hint gives the board back as soon as the player acts

A displayed hint SHALL be dismissed, and the board's ordinary colouring restored, by
any interaction that changes the display without making a move — selecting a square,
moving the cursor, switching to pencil marks, or picking a clue up from the list —
**unless** that interaction puts the selection on one of the squares the hint is
about, in which case the hint SHALL remain displayed.

This is required rather than cosmetic because a displayed hint owns the board's
colouring, suppressing the wash that marks the runs through the selected square so
that a washed square never means two things at once. Without dismissal, an
interaction with the board would produce no visible change at all; without the
exception, selecting a hinted square in order to type its number in by hand would
delete the explanation of what to type.

Because the hint owns the background of the squares it marks, a selection on such a
square SHALL still be shown by a cue that remains legible against the hint's own
colours.

#### Scenario: Clicking away from the hint puts it away

- **WHEN** a hint is displayed and the player selects a square the hint does not mark
- **THEN** the hint is dismissed and the board returns to showing the runs through
  the selected square

#### Scenario: Clicking into the hint keeps it, and shows where the cursor is

- **WHEN** a hint is displayed and the player selects one of the squares it marks, in
  order to enter the answer by hand
- **THEN** the hint remains displayed, and the selected square shows a cursor cue
  that is legible against the hint's highlight

### Requirement: Crossing refuses to hint a board it cannot honestly advise

The hint SHALL refuse, with a reason, when the board is already solved, when the
player has entered a digit or ruled out a candidate that contradicts the puzzle's
unique solution, or when no further deduction is available. On the mistake
refusal it SHALL surface the offending cells through the existing mistake
overlay.

Because a note set that excludes the solution's digit is already treated as a
mistake, the hint SHALL refuse on such a board too, rather than reasoning onward
from a position the player has made unsolvable through their notes.

#### Scenario: A note that rules out the right digit is refused rather than reasoned from

- **WHEN** a hint is requested on a board where a cell's pencil notes exclude the
  digit the unique solution places there
- **THEN** the hint refuses and the offending cell is highlighted, rather than a
  plan being computed from the contradicted position

## MODIFIED Requirements

### Requirement: Crossing places whole clue numbers from the list

The clue list SHALL be interactive. Clicking a clue SHALL pick it up, previewing
it in every run that can still take it; clicking such a run SHALL write the whole
clue in as a single move. With a cell already selected, clicking a clue that can
go in its run SHALL place it immediately.

Where **both** runs through the selected cell can take the clue, it SHALL be
placed in the run whose squares are already the more written-in, and only a tie
SHALL be settled by the current fill direction. Agreeing with digits the player
has entered is evidence of which run they meant; a blank run admits every unused
clue of its length and so is no evidence at all. The clue list SHALL be coloured
by the same rule, so that the colour a clue is written in always names the run a
click would actually send it to.

Selecting a cell SHALL indicate which clues can still go in **either** run
through it, since clicking either places it in the corresponding run. Horizontal
and vertical runs SHALL be distinguished by colour, and the same two colours
SHALL be used both to mark a run on the board and to write the clues that fit it,
so that the correspondence needs no legend. The colour SHALL denote the run's
direction rather than whether it is the one being filled, so that changing the
fill direction does not change what any colour means. The two colours SHALL be
of equal strength, so that neither direction reads as more important — equal in
perceived lightness and colourfulness, not merely in their colour components,
and verified against the colours actually rendered.

A clue already written into the grid SHALL remain distinguishable from one that
merely cannot go in the selected run.

Marking the runs on the board and colouring the clue list SHALL be separately
available as preferences, both enabled by default.

A clue can go in a run when it is the run's length, agrees with every digit
already entered there, and is not already written into another run. Availability
SHALL be decided from the player's own entries alone, and SHALL NOT take the
solution or the satisfiability of crossing runs into account, so that the aid
does not perform the puzzle's deduction. The aid SHALL be available as a
preference, enabled by default.

#### Scenario: A clue is placed into the selected cell's run

- **WHEN** a cell is selected and a clue that can go in its run is clicked
- **THEN** the whole clue is written into that run as one move

#### Scenario: A clue completes the partly-written run rather than the blank one

- **WHEN** one run through the selected cell already carries digits the clue
  agrees with, the crossing run is blank, and both could take the clue
- **THEN** the clue is written into the partly-written run, whichever way the
  fill direction happens to be pointing, and the clue list shows it in that
  run's colour

The preview SHALL distinguish what it knows from what it is guessing: every run
that could take the clue SHALL be indicated, but the clue's digits SHALL be shown
in place only when exactly one such run remains. A clue already written into the
board SHALL indicate the run it occupies.

#### Scenario: A picked-up clue shows every run it could go in

- **WHEN** a clue is clicked with no cell selected
- **THEN** it is shown as held, and every run that could still take it is
  indicated, without its digits being written into any of them

#### Scenario: A clue with one remaining run is previewed in place

- **WHEN** only one run can still take the held clue
- **THEN** its digits are previewed in that run's empty cells

#### Scenario: A clue already on the board shows where it is

- **WHEN** a clue that has been written into a run is clicked
- **THEN** the run it occupies is indicated

#### Scenario: Both runs through the selected cell are answered for

- **WHEN** a cell lying in both a horizontal and a vertical run is selected
- **THEN** both runs are marked on the board, each in its direction's colour,
  and each clue is written in the colour of the run it fits — or dimmed when it
  fits neither

#### Scenario: Neither direction's colour is stronger than the other's

- **WHEN** the colours the renderer emits for the two directions are measured
  perceptually
- **THEN** they have the same lightness and the same colourfulness

#### Scenario: The board marking and the list colouring are independent

- **WHEN** the preference for marking runs on the board is turned off
- **THEN** the board is no longer marked, and the clue list is still coloured

#### Scenario: A clue on the board stays distinguishable from an unavailable one

- **WHEN** one clue has been written into the grid and another simply cannot go
  in the selected run
- **THEN** the two are shown differently

#### Scenario: A clue used elsewhere is not offered again

- **WHEN** a clue has been written into one run
- **THEN** no other run offers or accepts it
