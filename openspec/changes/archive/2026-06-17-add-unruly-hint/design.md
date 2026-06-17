# Design: Unruly hint + placement animation

## Recording the deduction (mirrors Range)

The Range exemplar threads an optional `record(cell, value, reason)` callback
through its rules and exposes `deduceHintPlan`. Unruly follows the same shape,
but its solver fills cells inside five batch techniques rather than a single
`applyRules`. We thread `rec?: Recorder` through each technique and through the
shared `fillRow`. Each fill site, after mutating the working grid and bumping the
counts, calls `rec`. The generation path passes no recorder, so generation pays
nothing.

`deduceHintPlan` runs the same loop as `solveGame` (same technique priority
order) at unlimited difficulty over a copy of the player's grid, collecting the
recorded moves. Because the loop restarts at the easiest technique after any
progress, the recorded order is naturally easiest-first — the first recorded move
is the hint to surface next.

## Grouping: one firing = one journey

The quality bar wants a single deduction that forces several cells to read as one
multi-leg journey (`continuesPrevious`). The natural seam is `fillRow`: a single
complete-counts / single-gap / near-complete firing fills a whole row through one
`fillRow` call, so `fillRow`'s first recorded cell starts a journey
(`continuesPrevious: false`) and the rest continue it (`true`). The per-cell
techniques — impending threes and unique-rows — each force one cell per firing,
so every such move is its own step. This matches the model the midend already
implements: completing leg 1 advances to leg 2, which stays displayed because it
carries `continuesPrevious`.

## Highlighting filled evidence: ring, don't shade

Range shades its evidence as a light-blue *area* because its evidence cells are
usually undecided (a clue's line of sight, a reach run). Unruly is the opposite:
most evidence is **already filled** — the two same-colour cells that force a
threes deduction, the completed counts that drive complete/near-complete. A
light-blue fill over a black or white tile would hide the very colour that *is*
the evidence. So Unruly splits the highlight:

- **area** (light-blue `COL_HINT_CELL`, applied only to EMPTY cells): the
  *sibling* cells the same journey will fill — so the player sees "this whole row
  becomes white" at a glance, the equivalent-moves-share-appearance idea made
  visible without pre-applying the moves.
- **ring** (`COL_HINT` outline, on filled cells): the filled premise cells whose
  colour is the reason — the same-colour pair (threes), the fill cell + the
  reserved two-cell window (near-complete) where the last odd-colour cell must go.

Render filters `area` by current emptiness against the live `state`, so as legs
apply, already-filled siblings simply stop shading — no per-step grid snapshot is
needed (unlike Range, whose area *grows* and so needed snapshots).

## Per-technique highlight payload

- **threes**: target = the forced empty cell; ring = the two same-colour cells;
  area = [].
- **single-gap**: target = the lone gap; area/ring minimal (narration carries
  "already has all its <colour>").
- **complete**: target = the current leg's forced cell; area = the line's *other*
  empty cells (the journey's siblings).
- **unique**: target = the forced cell; area = the empty cells of the two rows
  involved.
- **near-complete**: target = the current forced fill; area = the line's other
  forced empties (excluding the reserved window); ring = the fill cell + the
  reserved window pair.

## Placement animation: geometric grow

The drawing API takes palette **indices**, not arbitrary RGB, so a colour
cross-fade would need many intermediate palette entries. Instead the animation is
geometric: a changed cell draws its **previous** colour as the full tile, then
the **new** colour as a centred square scaled `0 → full` by `animTime /
animLength`. At rest it is the plain new colour (cache fast-path). Animating cells
use the Flip idiom: a `255` cache sentinel forces a redraw every frame, and the
cell is re-cached cleanly when the animation settles.

`animLength` returns a short base duration (≈0.13s) for a `place` that changes a
cell, `0` for `solve` and no-ops. Because the base is > 0, the midend's hint path
stretches it to the uniform `HINT_ANIM_S` (1s), so each auto-hint step plays as a
visible fill with no frozen gap — the animation *is* the hint motion the owner
asked for, on top of working for ordinary manual placement.

Completion flash and placement animation coexist: the midend tracks `animTime`
and `flashTime` independently, and `redraw` already reads them separately (the
final completing placement both grows and, a frame later, flashes).

## Palette indices

The port mirrors the C colour enum at indices 0–10 so the app's dark-mode
`paletteOverrides` (keyed `{3..8: false}`) keep working. The two hint colours are
appended at 11 (`COL_HINT`) and 12 (`COL_HINT_CELL`) — beyond the override range,
so dark mode leaves them at their light-on-dark-friendly blues unchanged.
