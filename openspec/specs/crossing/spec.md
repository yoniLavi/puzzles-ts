# crossing Specification

## Purpose
Crossing (Nansuke), the puzzle of writing a list of numbers into a grid
crossword-fashion, so that each appears exactly once reading across or down.
This capability specifies its port to the TS engine, with entry that places
whole numbers and follows the one being filled, generation that leaves no cell a
clue cannot reach, and a hint that explains one deduction at a time.

## Requirements

### Requirement: Crossing game implements the Game interface

The engine SHALL provide `src/games/crossing/` implementing the `Game`
interface for Crossing (Nansuke / Number Skeleton), registered so the puzzle is
served by the TypeScript engine.

Parameters SHALL be a width, a height, and a symmetric-walls flag. Validation
SHALL require both dimensions at least 2 and at least one dimension at least 4,
matching upstream. A game ID SHALL encode the width, height and symmetry and
round-trip through decode, with a square board when the height is omitted.

Because Crossing has a unique, purely-deducible solution, it SHALL implement
`findMistakes`, so that Check & Save can hard-block a save while a wrong digit or
note is present. It SHALL restore the on-screen digit keypad and support pencil
marks.

#### Scenario: Every preset produces a uniquely-solvable board

- **WHEN** a new game is generated for any preset or legal size
- **THEN** a board is produced whose walls and number list admit exactly one
  solution reachable by the deductive solver

#### Scenario: A game ID round-trips through the parameters

- **WHEN** a parameter set is encoded to a game ID and decoded
- **THEN** the same width, height and symmetric-walls flag are recovered, and a
  game ID omitting the height is read as a square board

#### Scenario: A dimension below the minimum is rejected

- **WHEN** parameters are validated with both width and height below 4, or with
  either dimension below 2
- **THEN** validation fails with the corresponding upstream message

### Requirement: Crossing descriptions use the upstream run-length encoding

A Crossing description SHALL encode the walls in row-major order as alternating
runs — a decimal count for a run of open cells and a letter `a`–`z` for a run of
1 to 26 wall cells — followed by a comma and the list of clue numbers as decimal
digits separated by commas. The clue numbers SHALL be stored sorted by length and
then lexicographically, matching the order the description emits.

Validation SHALL reject a description containing an unknown wall character, a
description that supplies more cell data than the board holds, a clue number
longer than the maximum row length, and a duplicate clue number. Validation SHALL
reproduce upstream's behavior, including its deliberately absent checks (it does
not reject an over-short description or an invalid digit character).

#### Scenario: A generated description round-trips

- **WHEN** a description is generated and then decoded into a board and re-encoded
- **THEN** the resulting description is identical

#### Scenario: A description with an unknown wall character is rejected

- **WHEN** a description whose wall section contains a character outside the
  digit and `a`–`z` runs is validated
- **THEN** it is rejected as containing an invalid character

#### Scenario: A description with a duplicate clue number is rejected

- **WHEN** a description whose clue list repeats a number is validated
- **THEN** it is rejected as containing a duplicate number

### Requirement: Crossing ports the deductive solver and solver-gated generator

Crossing SHALL provide a solver that determines the unique solution, or reports
that the board is not fully determined or is contradictory. The solver SHALL work
by constraint propagation over the grid's maximal horizontal and vertical runs of
length at least 2: for each run it SHALL intersect each open cell's candidate
digits with the digits some still-fitting clue number places there, then confirm
any cell whose candidates collapse to a single digit, iterating to a fixpoint. It
SHALL report a board valid only when every run matches exactly one clue number and
each clue number is used exactly once.

The generator SHALL use the solver to keep every board uniquely solvable: it SHALL
grow open cells from a single shuffled pass until no 2×2 block is fully closed and
all open cells are connected, fill a candidate solution with random digits, read
the runs into the clue list, and accept the board only when the solver reports it
valid — retrying otherwise. Generation from a given seed SHALL be reproducible.

#### Scenario: The solver finds the unique solution

- **WHEN** a generated board is solved
- **THEN** the solver fills every open cell so that each clue number appears
  exactly once across the runs, and reports the board valid

#### Scenario: Generation is reproducible from a seed

- **WHEN** the same seed and parameters are used twice to generate a game
- **THEN** both runs produce the identical description

### Requirement: Crossing input, marking, mistakes and completion

Crossing SHALL be played by selecting an open cell and entering a digit, with a
separate pencil-mark mode for candidate notes. A left click SHALL select a cell
for digit entry and a right click for pencil marking; the arrow keys SHALL move a
keyboard cursor and Enter SHALL toggle between digit and pencil entry; a digit key
SHALL place a digit or toggle a note, and Backspace, Space or `0` SHALL clear.
Walls SHALL not be editable, and a move that changes nothing SHALL produce no
history entry.

Crossing SHALL flag a completed run that matches no clue number with a live error
highlight, independently of `findMistakes`. `findMistakes` SHALL re-solve to the
unique solution and flag every placed digit that contradicts it and every empty
cell whose pencil notes have crossed out its solution digit, returning nothing
when the board is not yet uniquely determined. The game SHALL be reported complete
when every run matches exactly one clue number and each clue number is used once,
and SHALL flash on that completion. Rendering SHALL draw walls and placed digits as
beveled tiles with per-digit colors, pencil marks, the run-error highlights, and
a number-list panel below the grid colored by how many times each clue is placed.

#### Scenario: Entering the wrong digit is caught by Check & Save

- **WHEN** the player places a digit that contradicts the unique solution and
  invokes Check & Save
- **THEN** the cell is flagged as a mistake and the save is refused

#### Scenario: A no-op entry makes no move

- **WHEN** the player enters into a cell the digit it already holds, or edits a
  wall cell
- **THEN** no move is made and the history is unchanged

#### Scenario: Placing every clue exactly once wins

- **WHEN** a move fills the grid so every run matches exactly one clue number and
  each clue number is used once
- **THEN** the game is reported solved and flashes

### Requirement: Crossing advances the selection along the number being filled

Entering a digit SHALL move the selection to the next cell of the run being
filled, so that a complete number can be typed without selecting each cell — the
enhancement the game's own documentation asks for. The behavior SHALL be
available as a preference, enabled by default.

The direction SHALL be remembered between entries, and SHALL be set by: the
arrow key last used; selecting a cell that belongs to only one run (which snaps
it to that run, there being no alternative); and clicking an already-selected
cell that belongs to both a horizontal and a vertical run, which toggles it.
Where a repeat click has no direction to toggle, it SHALL deselect the cell as
before. The selection SHALL NOT advance after clearing a cell or after a pencil
mark.

#### Scenario: A whole number is typed after one selection

- **WHEN** a cell at the start of a run is selected and digits are typed
- **THEN** each digit fills the next cell of that run in turn, and the selection
  remains visible throughout

#### Scenario: The selection stops at the end of the run

- **WHEN** a digit is entered in the last cell of a run
- **THEN** the selection stays on that cell rather than leaving the run

#### Scenario: Clicking a crossing cell again changes direction

- **WHEN** the already-selected cell lies in both a horizontal and a vertical run
  and is clicked again
- **THEN** the fill direction changes between across and down and the cell stays
  selected

### Requirement: Crossing rejects board sizes it cannot generate

Parameter validation SHALL reject, when validating for generation, any board
larger than the measured generable maximum, giving a reason — rather than
retrying indefinitely as upstream does. Generation retries until every run reads
as a distinct listed number, so the chance of success falls to zero as the board
grows. Validation SHALL NOT apply the ceiling when a description is already
supplied, so an existing puzzle of any size remains playable.

#### Scenario: An ungenerable size is refused with a reason

- **WHEN** parameters larger than the generable maximum are validated for
  generation
- **THEN** validation fails with a message naming the maximum

#### Scenario: An existing large description still loads

- **WHEN** parameters larger than the generable maximum accompany a supplied
  description
- **THEN** validation succeeds

### Requirement: Crossing generates no cell that a clue cannot reach

Generation SHALL reject a candidate board containing an open cell that belongs
to no run, since no clue number can reach it: it would stay blank on a finished
board, and — the completion check inspecting only runs — would accept any digit
the player put there. Upstream produces such boards and records the fault as a
generator TODO.

Reproducing upstream's descriptions byte-for-byte SHALL remain possible through
an explicit generator option, so that the C-reference differential keeps
validating the generator, solver and codec together.

#### Scenario: Every open cell of a generated board lies in a run

- **WHEN** a board is generated for any preset or legal size
- **THEN** every cell that is not a wall belongs to at least one horizontal or
  vertical run

#### Scenario: Upstream's boards remain reproducible on request

- **WHEN** the generator is asked for upstream's isolated-cell behavior on a
  seed where upstream produces such a board
- **THEN** it reproduces that board, and the shipped default produces a
  different one in which every cell is reachable

### Requirement: Crossing places whole clue numbers from the list

The clue list SHALL be interactive. Clicking a clue SHALL pick it up, previewing
it in every run that can still take it; clicking such a run SHALL write the whole
clue in as a single move. With a cell already selected, clicking a clue that can
go in its run SHALL place it immediately.

Where **both** runs through the selected cell can take the clue, it SHALL be
placed in the run whose squares are already the more written-in, and only a tie
SHALL be settled by the current fill direction. Agreeing with digits the player
has entered is evidence of which run they meant; a blank run admits every unused
clue of its length and so is no evidence at all. The clue list SHALL be colored
by the same rule, so that the color a clue is written in always names the run a
click would actually send it to.

Selecting a cell SHALL indicate which clues can still go in **either** run
through it, since clicking either places it in the corresponding run. Horizontal
and vertical runs SHALL be distinguished by color, and the same two colors
SHALL be used both to mark a run on the board and to write the clues that fit it,
so that the correspondence needs no legend. The color SHALL denote the run's
direction rather than whether it is the one being filled, so that changing the
fill direction does not change what any color means. The two colors SHALL be
of equal strength, so that neither direction reads as more important — equal in
perceived lightness and colorfulness, not merely in their color components,
and verified against the colors actually rendered.

A clue already written into the grid SHALL remain distinguishable from one that
merely cannot go in the selected run.

Marking the runs on the board and coloring the clue list SHALL be separately
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
  run's color

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
- **THEN** both runs are marked on the board, each in its direction's color,
  and each clue is written in the color of the run it fits — or dimmed when it
  fits neither

#### Scenario: Neither direction's color is stronger than the other's

- **WHEN** the colors the renderer emits for the two directions are measured
  perceptually
- **THEN** they have the same lightness and the same colorfulness

#### Scenario: The board marking and the list coloring are independent

- **WHEN** the preference for marking runs on the board is turned off
- **THEN** the board is no longer marked, and the clue list is still colored

#### Scenario: A clue on the board stays distinguishable from an unavailable one

- **WHEN** one clue has been written into the grid and another simply cannot go
  in the selected run
- **THEN** the two are shown differently

#### Scenario: A clue used elsewhere is not offered again

- **WHEN** a clue has been written into one run
- **THEN** no other run offers or accepts it

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
each be marked in the shape of the action it represents, so that one hint color
cannot stand for two different actions. A ruled-out candidate SHALL be marked on
the candidate itself rather than on the whole cell.

#### Scenario: A run filled by one deduction is a single hint

- **WHEN** a deduction determines every cell of a run at once
- **THEN** one hint is presented covering the whole run, not one hint per cell

### Requirement: A displayed hint gives the board back as soon as the player acts

A displayed hint SHALL be dismissed, and the board's ordinary coloring restored, by
any interaction that changes the display without making a move — selecting a square,
moving the cursor, switching to pencil marks, or picking a clue up from the list —
**unless** that interaction puts the selection on one of the squares the hint is
about, in which case the hint SHALL remain displayed.

This is required rather than cosmetic because a displayed hint owns the board's
coloring, suppressing the wash that marks the runs through the selected square so
that a washed square never means two things at once. Without dismissal, an
interaction with the board would produce no visible change at all; without the
exception, selecting a hinted square in order to type its number in by hand would
delete the explanation of what to type.

Because the hint owns the background of the squares it marks, a selection on such a
square SHALL still be shown by a cue that remains legible against the hint's own
colors.

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

### Requirement: Crossing's clue panel repaints when the held clue changes
Crossing SHALL treat the held clue as an input to its clue-panel cache, so that
picking a clue up marks it on the next frame and putting it back unmarks it,
whether or not the draw state has painted before.

#### Scenario: picking a clue up on a draw state that has already painted

- **GIVEN** a board whose draw state has painted one frame with nothing held
- **WHEN** the player picks up a clue and the game redraws on that same draw
  state
- **THEN** the panel marks that clue as held
- **AND** putting the clue back removes the mark on the following frame
