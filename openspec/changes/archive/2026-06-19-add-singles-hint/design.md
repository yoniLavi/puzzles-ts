# Design: Singles hint

## Recording through the op queue (vs Range's direct rules)

Range's rules call `makeMove` and record inline, so threading a `record`
callback was local. Singles is different: the once-only rules (sandwich,
doubles, corners, offset-pair) **queue** ops, and `solverOpsDo` later **applies**
them while **cascading** new ops (a new black circles its neighbours; a new
circle blackens line-mates). The cause of a cell is therefore known at *two*
sites: the rule that queued it, and (for cascade ops) the apply step that
queued the follow-on.

Decision: **attach the `SinglesReason` to the `Op` at queue time** and **record
each op when it actually changes a flag** inside `solverOpsDo`. The primary
rules attach their reason when queuing; `solverOpsDo` builds the cascade reason
(`adjBlack` / `sameLine`, referencing the just-decided source cell) when it
queues the follow-on circles/blackens. Recording order is op-application order,
which is a valid deduction order (each applied op was forced by the state
before it).

Gating: the recorder lives on `SolverState` (`records?: HintRecord[]`,
`group?: number`). When absent — the generator's path — no reason objects are
built and `solverOpsDo` records nothing, so the hot solve path is unchanged.
`solveSpecific` gains an optional `ss` param (default: a fresh non-recording
state); `deduceHintPlan` passes a recording one and returns `ss.records`.

## Grouping: by firing id, not by adjacency

Quality-bar rule 2 (one firing = one journey) applies to the two deductions
that force **two cells simultaneously**: the 4-in-a-corner case (blacken the
far corner *and* the inner diagonal) and an offset-pair firing (two forced
whites). Each such firing assigns one `group` id shared by its two ops; every
other op (including each cascade op) gets a fresh group. The two ops of a
grouped firing are queued consecutively and so are applied consecutively
(cascades append *after* them), so records sharing a group are contiguous.
`hint()` merges records by group into one multi-cell `HintStep`.

The cascade is deliberately **not** grouped: a black forcing four neighbours
white, each then blackening line-mates, is a chain of separate, individually
teachable local deductions — emitted one per step, like Range.

## Reason taxonomy → narration + evidence

| `kind` | fires | forces | evidence (shade=undecided number, ring=decided) |
|---|---|---|---|
| `sandwich` | two equal numbers two apart | middle white | the two equal numbers (shade) |
| `pair` | adjacent equal pair | other copy in line black | the pair (shade) |
| `corner4` | 2×2 all same | this diagonal black (2 cells) | the 2×2 block (shade) |
| `corner3` | 3-in-corner same | apex black | the 2×2 block (shade) |
| `corner2` | 2-in-corner same | other neighbour white | the 2×2 block (shade) |
| `offset` | offset pair pattern | two whites (2 cells) | the four pattern cells (shade) |
| `adjBlack` | cascade: next to a new black | white | the black square (ring) |
| `sameLine` | cascade: shares a line with a new circle | black | the circled white (ring) |
| `boxedIn` | white cell, one non-black neighbour | that neighbour white | the boxed-in cell (shade) |
| `split` | black here would split white region | white | the cell's non-black neighbours (shade) |

The corner cases are a compound connectivity/no-repeat argument (a white corner
must route through one of its two neighbours; the matching numbers block the
other). Narration is kept to one faithful sentence; the shaded 2×2 block
carries the premise visually. Evidence cells are computed from the reason's
captured coordinates (no per-step grid snapshot needed — unlike Range's growing
runs, Singles premises are fixed small cell sets).

## hint plan completeness

`deduceHintPlan` runs the solver at `DIFF_ANY` (all rules, no sneaky) — the
same level `findMistakes`/`solve` use — from the player's current marks. A
generated board is uniquely solvable by these rules; adding the player's
correct marks only gives the solver more to work with, so the recorded plan
always reaches the full solution. A test asserts the plan solves the board.

## hintKeepTrack

Single-cell step: `"completed"` iff the move sets exactly the hinted cell to
the hinted value. Multi-cell (grouped) step: a move that sets the hinted value
into a **subset** of the step's cells (and nothing else) is `"onTrack"` with
the step shrunk in place to the remaining cells (the interface permits mutating
`step.move`/`highlights` on `"onTrack"`), `"completed"` when it fills the last,
`"off"` on any other cell or value.
