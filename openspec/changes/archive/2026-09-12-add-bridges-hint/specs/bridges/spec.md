# bridges

## ADDED Requirements

### Requirement: Bridges explains the next deduction

`hint(state)` SHALL refuse through `commonHintRefusal` when the board is solved
or `findMistakes` reports a wrong bridge, and otherwise return the forced
deductions from the player's own bridges as an ordered plan, each step narrating
**why** its moves are forced from premises the sentence itself states.

The plan SHALL be produced by the *same three* `DeductionTechnique` objects
`solveFromScratch` runs, through one `runDeductionFixpoint` call, with a recorder
attached to the `Solver`: no rung is reimplemented for the hint, and the
generator's solve path SHALL remain byte-identical, which
`bridges-differential.test.ts` proves. The ladder SHALL be capped at the board's
own difficulty rather than the top rung, since that is the tier the generator
certified it soluble at.

One firing SHALL be one step: a stage SHALL stop at the first island that moved
when a recorder is attached, and a rung holding more than one teachable rule
SHALL return at the first of them that changed the board, so a stage that sweeps
sixty-seven islands cannot pile several independent deductions into one step. A
step's move MAY carry several bridges when one premise forces them all, and
`hintKeepTrack` SHALL then verdict `"onTrack"` and shrink the step in place —
judging a bridge count as progress when it moves toward what the step asks for,
because one drag adds one bridge rather than the whole count, and accepting the
span from either end, because the player drags from whichever island they like.

The working copy SHALL resume from the player's bridges rather than clearing
them, and SHALL first mark every island whose bridges already meet its clue, so
a resumed position is the position the certified ladder was certified on.

Every change a rung makes SHALL be recorded, and the plan SHALL hide — apply to
its working board, but never show — a firing that declares no reason. Exactly
one rule declares none: stage 1's *this island now has all its bridges, mark it
complete*, which is bookkeeping the fork's own auto-mark aid already draws and
which the win condition does not read. Stage 3's per-direction **maximum** is
likewise applied without being offered, because upstream gives the player no way
to write one down; it emits no move at all, and the ladder runs on until it has
one.

Where a rung can be forced by more than one cause, the firing SHALL carry which:
stage 3's block is narrated as a finished group sealed off or as a named island
left short of its clue, read while the trial still stands, because rolling it
back destroys both answers.

#### Scenario: A hint explains an island with exactly enough room left

- **WHEN** an island's remaining count equals the bridges it can still take and a
  hint is requested
- **THEN** the step's narration states that count, its move draws exactly that
  many bridges, and the island it names is the one the hint recolors

#### Scenario: A bookkeeping mark is never a step

- **WHEN** a deduction satisfies an island and the solver marks it complete
- **THEN** no step in the plan asks the player to mark it, and the plan still
  reaches a solved board

#### Scenario: A hint runs from the player's own bridges

- **WHEN** the player has drawn correct bridges of their own and asks for a hint
- **THEN** the plan is deduced from those bridges and its first step is a
  deduction that follows from them

#### Scenario: A hint refuses rather than reasoning from a wrong board

- **WHEN** a bridge contradicts the unique solution and a hint is requested
- **THEN** the hint refuses with the collection's shared mistakes wording and
  produces no plan

#### Scenario: A hint says so honestly when the annotation is what is wrong

- **WHEN** an island is marked complete before it is, so `findMistakes` reports
  nothing and the deduction still contradicts itself
- **THEN** the hint refuses with the collection's unlocalized-contradiction
  wording, which asks the player to undo rather than promising a highlight

#### Scenario: Following the plan solves the board at every tier

- **WHEN** a hint is requested, its first step applied, and the hint requested
  again, repeatedly, on a board of any tier
- **THEN** deduction never runs out before the board is solved

### Requirement: Bridges marks a hint in its own vocabulary

`redraw` SHALL draw the displayed step's marks from `BridgesHighlights` using
the game's own shapes recolored, because neither element a Bridges deduction
points at is a cell: an island is a circle wider than its own tile, and a bridge
is a **span** between two islands, which is no cell's border. Nothing here comes
from `engine/hint-mark.ts`, whose every mark is a band on a cell's border box.

A span the step decides SHALL be drawn as the bridge bundle it would become,
with the bars the step *adds* in `COL_HINT` and the bars already there in the
board's own color, or as the game's own pair of crosses in `COL_HINT` when the
step blocks it. An island SHALL be marked by recoloring its own rim and clue
digit, which is a ring rather than a fill: `COL_HINT` for the island a sentence
names, `COL_HINT_CELL` for one it merely counts, and never both for one island.

**A step SHALL recolor the island in the action color only when its sentence
names it.** The three premises that count a *group* the island belongs to SHALL
mark every member alike, so a sentence counting "these N islands" points at N
marks of one color rather than at one mark of each.

The per-cell hint marks SHALL be carried in an `Int32Array` compared in the tile
cache's diff key, in the same island/line layout the packed descriptor uses, so
that a hint requested a frame after the move that drew the board still repaints
and an island's recolored rim reaches the four tiles its arcs intrude into.

#### Scenario: A displayed hint repaints an otherwise unchanged frame

- **WHEN** the board is painted, a hint is displayed, and `redraw` runs again
  with nothing else changed
- **THEN** the frame carries the step's marks

#### Scenario: Raising a span leaves the bridges already there in board ink

- **WHEN** a step raises a span that already carries a bridge
- **THEN** the frame draws the bundle at the new count with only the added bars
  in the action color

#### Scenario: No hint mark is a fill

- **WHEN** any frame of a hint plan is captured
- **THEN** no rect in either hint color is tile-sized in both directions
