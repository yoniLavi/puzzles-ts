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
the named technique — that only one listed number still fits the run, or that
every still-fitting number agrees on a digit in this position — rather than
narrating the bare candidate elimination.

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
