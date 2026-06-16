# Design: Range explained hint

## D1 — Hint from the player's current marks, refuse on mistakes

The hint deduces the next forced cell(s) from the player's *current* grid
(clues + their blacks/whites), not from the clues alone — so it always points
at the next thing to do from where they are. This is sound **only if the
player's marks are all correct**: a wrong black/white would make the deduction
draw false conclusions. We therefore refuse the hint when
`findMistakes(state)` is non-empty (and when the board is already solved),
exactly as Palisade refuses on mistakes. With no mistakes, every player mark
agrees with the unique solution, so seeding the deductive rules with them is
safe, and — because a generated board is no-recursion-solvable from the clues
alone — it stays no-recursion-solvable from any correct partial state. The
plan thus always reaches the full solution with no guessing.

## D2 — Recording the *why*, computed only on the hint path

The three deductive rules already exist and run on the solve/generate hot
path, where evidence would be pure overhead. They gain an optional
`record(r, c, value, reason)` callback invoked at each successful `makeMove`;
the reason object is built at the call site (each rule knows its own premise)
and is constructed only when `record` is supplied. `applyRules` passes the
callback through; `deduceHintPlan` collects the ordered list. Same pattern as
Palisade's `ctx.record` evidence (zero cost off the hint path).

`HintReason` is discriminated by the firing rule, each carrying the premise
cells the narration and the highlight need:

```ts
type HintReason =
  | { kind: "adjacency"; from: Cell }          // the black square next door
  | { kind: "satisfied"; clue: Cell; n: number }
  | { kind: "overrun"; clue: Cell; n: number }
  | { kind: "reach"; clue: Cell; n: number }
  | { kind: "connect" };                        // cut-vertex of the white graph
```

## D3 — One forced cell = one step (no grouping this change)

Each forced cell becomes one `HintStep` narrating its own local premise. A
firing that forces several cells (adjacency whitening four neighbours of a
black; a satisfied clue capping several directions) emits several steps rather
than one grouped `continuesPrevious` journey. This is a deliberate, documented
deviation from the "one deduction = one journey" convention: in Range every
forced cell *does* have a self-contained local reason ("this specific cell is
next to that black", "this specific cell would overrun clue N"), so per-cell
narration is itself complete and arguably clearer for a learner. Grouping is a
possible later refinement, not needed to meet the explain-why bar. The plan is
the whole remaining solution; the player follows it one cell at a time and the
midend keeps it displayed across steps.

## D4 — Rendering: target preview + premise shading

The displayed step's target cell is currently EMPTY (the player hasn't applied
it). `redraw` fills it `COL_HINT` (blue) and draws a preview of the forced
mark — a black inset square for a forced black, a `COL_GRID` dot for a forced
white — so the player sees both *where* and *what*. The premise cells (the
clue cell for the clue rules, the adjacent black for adjacency) are
light-shaded `COL_HINT_CELL`, leaving clue numbers readable. New hint bits in
the per-cell `Int32Array` cache (`F_HINT_TARGET`, `F_HINT_WHITE`,
`F_HINT_REF`) fold into the existing cache-miss check so the highlight appears
and clears with no full repaint. The shell's Hint/Auto-Hint buttons and
`AUTO_HINT_STEP_MS` pacing drive the reveal/step-through unchanged — that is
the "animation"; Range has no move animation upstream and `animLength` stays 0.

## D5 — keep-track

`hintKeepTrack(m, step, state)` returns `"completed"` iff `m` sets the hinted
cell to the hinted value (the move's `sets` includes `{r, c, value}` matching
the step's target), else `"off"`. There is no partial-progress `"onTrack"`
state worth modelling: a Range cell reaches the hinted value in one click
(left for black, right for white from empty), and the auto-play `executeHint`
applies `step.move` directly. A move touching any other cell, or the hinted
cell to the wrong value, drops the plan so the next request recomputes from
the new position.
