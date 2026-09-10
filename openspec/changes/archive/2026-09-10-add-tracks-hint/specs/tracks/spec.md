# tracks

## ADDED Requirements

### Requirement: Tracks explains the next deduction

`hint(state)` SHALL refuse through `commonHintRefusal` when the board is solved
or `findMistakes` reports any mark, and otherwise return the forced deductions
from the player's current marks as an ordered plan, each step narrating **why**
its moves are forced from premises the sentence itself states.

The plan SHALL be produced by the *same* eight `DeductionTechnique` objects
`tracksSolve` runs, through one `runDeductionFixpoint` call, with a recorder
attached to the working `Board`: no rung is reimplemented for the hint, and the
generator's solve path SHALL remain byte-identical, which
`tracks-differential.test.ts` proves. The ladder SHALL be capped at the board's
own difficulty rather than `DIFF_COUNT`, since that is the tier the generator
certified it soluble at.

One firing SHALL be one step: a rung SHALL return at its first premise that
changed the board when a recorder is attached, so a rung that scans the whole
grid cannot pile several independent deductions into one step. A step's move
MAY carry several ops when one premise forces them all, and `hintKeepTrack`
SHALL then verdict `"onTrack"` and shrink the step in place until the last of
them is placed.

Every change a rung makes SHALL be recorded, and the plan SHALL hide — apply to
its working board, but not show — a firing that declares no reason or whose
every change the player's board already decides, through the shared plan loop's
`showable` hook. A change is already decided when the game would refuse the
player its contrary: track on a side of a square marked empty or of the rim,
track as a third side of a finished piece, or "no track" on a square showing a
rail. Three rules of `update-flags` declare no reason for exactly that cause —
*a square with a track side is a track square*, *a blocked square's four sides
are blocked*, and *a finished piece's other two sides are blocked* — and every
reason-less firing SHALL be evident by that test.

#### Scenario: A hint explains a clue that is already met

- **WHEN** a line holds as many track squares as its clue allows and a hint is
  requested
- **THEN** the step's narration names that count, its move marks every other
  square in the line empty, and its evidence is exactly the clue's own track
  squares with the clue's digit recolored

#### Scenario: A finished piece's sides are never a step

- **WHEN** a finished piece's two free sides border squares the player has
  marked empty and a hint is requested
- **THEN** no step in the plan asks for either side to be blocked

#### Scenario: A hint runs from the player's own marks

- **WHEN** the player has made correct marks of their own and asks for a hint
- **THEN** the plan is deduced from those marks and its first step is a
  deduction that follows from them

#### Scenario: A hint refuses rather than reasoning from a wrong board

- **WHEN** a mark contradicts the unique solution and a hint is requested
- **THEN** the hint refuses with the collection's shared mistakes wording and
  produces no plan

#### Scenario: Following the plan solves the board at every tier

- **WHEN** a hint is requested, its first step applied, and the hint requested
  again, repeatedly, on a board of any tier
- **THEN** deduction never runs out before the board is solved

### Requirement: Tracks marks a hint in its own vocabulary

`redraw` SHALL draw the displayed step's marks from `TracksHighlights`, using
the shape of the action rather than color alone to say which action is meant: a
square the step decides is **ringed** in `COL_HINT` and additionally carries the
game's own center cross in that color when the move marks it empty; a side that
must carry track is drawn as the game's own rail **stubs**; a side that must be
blocked is drawn as the game's own edge **cross**. Nothing is a fill.

Evidence SHALL be drawn in `COL_HINT_CELL`: a contour round the squares the
deduction reasons from, painted per side wherever the neighbor across it is not
also evidence, and a bar on a cited side. Because half of most Tracks deductions
is a clue rather than anything on the grid, a clue the step counts with SHALL
have its digit recolored in the margin, which requires the hint to be part of
the clue row's cache key as well as the per-tile one.

The per-square hint marks SHALL be carried in an `Int32Array` compared in the
tile cache's diff key, so a hint requested a frame after the move that drew the
board still repaints.

#### Scenario: A displayed hint repaints an otherwise unchanged frame

- **WHEN** the board is painted, a hint is displayed, and `redraw` runs again
  with nothing else changed
- **THEN** the frame carries the step's marks

#### Scenario: A forced side is drawn as the action it asks for

- **WHEN** a step forces one side to carry track and another to be blocked
- **THEN** the first is drawn as rail stubs and the second as a cross, both in
  the action color, and neither renders the finished piece
