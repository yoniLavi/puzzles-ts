# Design: Filling hint

This follows the Range hint design (`add-range-hint`) closely — Range is the
recording-deduction exemplar — so this note only records the Filling-specific
decisions.

## D1. Deduce from the player's board, not the clues

`deduceHintPlan` runs the solver from `state.board` (clues + the player's
fills), so the first recorded move is the next deduction from where the player
actually is. A generated Filling board is solvable to a unique solution by the
four techniques from the clues; any *correct* partial is a superset of the
clues with correct values, so the techniques still drive it to completion. The
hint therefore refuses when `findMistakes(state)` is non-empty (deducing from a
wrong board would mislead) — this couples to the same overlay Check & Save uses
via the engine's `computeHintPlan` → `findMistakes` refusal path (already
generic).

## D2. Evidence is *shaded*, not ringed — Filling's premise is a number

The hint-authoring guide notes two evidence styles: shade undecided cells
(Range), or ring already-*filled* premise cells whose colour a fill would hide
(Unruly's black/white tiles). Filling is the first case where the filled
premise carries a **number**, not a colour — and a light-blue background does
*not* hide a digit (the digit draws on top, exactly as Range's clue numbers
draw on their shaded line of sight). So Filling **shades** its evidence
(`COL_HINT_CELL`) even though the evidence cells are filled, and the region's
numbers stay readable. This keeps the picture clean (no per-cell ring noise over
an already bold-bordered region) while satisfying quality-bar rule 1 (show the
evidence as an area).

## D3. Each fill is its own deduction — no `continuesPrevious` grouping

Palisade groups one firing that forces several edges into one journey. Filling
has no such structure: every forced cell has a self-contained local premise (a
distinct region that must grow, or a distinct cell pinned by its neighbours).
Even a region growing by several cells fills one cell per pass, each a fresh
"only one legal square" deduction about the region as it then stands. So every
step is independent (`continuesPrevious` unset). This is honest and
pedagogically right — each step teaches one application of a technique.

## D4. The bitmap technique's evidence may be non-local

Three of the four techniques (blocked expansion, region capacity, lonely cell)
have clean local evidence — the region, or the pinning neighbours. The fourth,
`learn_bitmap_deductions` (candidate elimination), reasons globally: a number is
ruled out of a cell because an orthogonal neighbour equals it **or** because no
region of that size can reach the cell. The adjacency eliminations are local
(the filled orthogonal neighbours), and those are what the hint shades; the
reachability eliminations are not cleanly localisable, and the narration says so
honestly ("it would touch an equal number, or no region of that size could reach
here"). A bitmap step therefore shades its filled orthogonal neighbours; if a
cell is forced purely by reachability it may have none, so the visible-evidence
invariant is asserted for the three local techniques and relaxed (explanation +
target only) for bitmap. This is the one technique whose "why" is genuinely
non-local; surfacing it honestly beats omitting the step (which would leave a
gap that breaks the plan's path to the solution).

## D5. Cache packing

The forced digit must repaint when the displayed step changes, so it is packed
into the per-cell `Int32Array` cache word alongside the existing flags (the
target cell's board value is 0, so the digit can't ride the value field). New
flags `HINT_TARGET` / `HINT_AREA` plus a 4-bit forced-digit field sit above
`FF_MISTAKE`, well within `Int32`'s signed range. Bg precedence: hint target >
hint area > selection > completed/overfull/error > background.
