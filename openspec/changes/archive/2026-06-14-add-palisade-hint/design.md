## Context

Palisade's solver (`solver.ts`) is six DSF deductions run to a fixpoint. Its
*output* is the wall set (`disconnect` → `borders` low-nibble bits) plus a
final `isSolved` check; the "these two cells are one region" facts it derives
live **only in its DSF** (`connect`), never as a visible mark. A hint must turn
both halves into something the player can see and act on:

- a `disconnect` (forced wall) → tell the player to draw a wall;
- a forced `connect` (two cells provably one region) → tell the player to mark
  the shared edge "no wall" (right-click).

The note left in memory flagged the two tricky bits, both addressed here:
**connect deductions live only in the DSF** (so we record the specific edge at
the call site, not by diffing the DSF), and **seeding from the player's marks**
(their no-wall marks must pre-merge into the solver's DSF so the hint reasons
from where they actually are).

## Goals / Non-Goals

- Goals: a logically-sound next-deduction hint, seeded from the player's
  progress, narrated per rule, with an edge + clue highlight; wired to the
  existing plan hook so manual-follow and auto-hint both work.
- Non-Goals: a search-based or guessing hint (the deductive solver is the
  authority); animating the hinted edit (edges don't animate); a prefs toggle.

## Decisions

### D1 — Seed the solver from the player's state, not the bare rim

`hint()` builds a `SolverCtx` whose `borders` is a **copy of the player's
borders** (so their walls are fixed) and whose DSF is **pre-merged across every
no-wall mark** (`DISABLED` high-nibble bit) via a new `seedNoWall` step
mirroring `buildDsf(black=false)`. Because every seeded fact is true and a
subset of the unique solution, the solver is monotonic: it makes *at least* as
much progress as from the rim (which the generator guarantees fully solves), so
a mistake-free, unsolved board always yields a next deduction — no stall.

### D2 — Record forced edges at the deduction call sites, not by DSF diff

A DSF merge of two regions makes many cell-pairs newly equivalent; the *visible*
forced no-wall is only the specific adjacent edge the rule reasoned about, and
in the "region grows across two edges" case **no single edge is forced**.
Diffing the DSF cannot distinguish these. Instead the `SolverCtx` gains an
optional `record: ForcedEdge[]`:

- `disconnect(i, dir)` records `{kind:"wall"}` when it sets a *new* wall bit.
- a new `connectEdge(i, dir)` (used by `numberExhausted`'s exhausted branch and
  `equivalentEdges`' connect branch — the rules that force a *specific* edge to
  be no-wall) records `{kind:"nowall"}` when the edge is not already
  known-connected.
- `notTooSmall` keeps its canonical-rep `connect` for the merge, but records a
  no-wall edge **only when the region's single growth target is reached by
  exactly one maybe-edge** (then that edge is individually forced).

The `newConn` guard (`!connectedDir`) means an edge the player already marked
no-wall — already merged in the seeded DSF — is never re-surfaced. When
`record` is absent the deductions behave byte-for-byte as before, so
`solve`/`findMistakes`/the generator are untouched.

### D3 — The whole remaining chain as a multi-step plan

`hint()` returns every forced edge from the seeded fixpoint, in discovery
order, as one `HintStep` each — matching Flood/Fifteen/Sixteen (the full plan,
computed once). One hint request shows the next step; manually completing it
advances the plan but hides the banner until the next request (no
`continuesPrevious`); `executeHint` (auto-hint) plays the whole chain in slow
motion. Steps stay valid because they apply in the exact order the solver
derived them.

### D4 — Mistake/solved guard

If `findMistakes(state)` is non-empty (a wrong wall or no-wall mark), or the
board is solved, `hint()` returns `{ok:false}` with a readable reason rather
than reasoning from a wrong premise. `findMistakes` already returns `[]` for a
non-uniquely-solvable custom desc, so that case falls through to the generic
"no deduction found" error.

### D5 — `hintKeepTrack` by inspecting the edit, not re-executing

The displayed step carries the target `{x,y,dir,kind}` in its highlights. A
player `edges` move "completes" the step iff its edit on cell `(x,y)` toggles
the hinted bit *on* (`(borders ^ flag) & bit`). Because the shared edge is
always recorded on cell `(x,y)`'s `dir` side regardless of which side the
player clicked, this is side-agnostic and distinguishes a wrong-button click
(sets the other bit → `"off"`). No `executeMove` needed.

### D6 — Render: `COL_HINT` + two packed bits

`render.ts` adds `COL_HINT` (a clear blue) and two cache bits above the cursor
mask: `HINT_EDGE(border)` (bits 23–26, which edge slot to paint `COL_HINT`) and
`F_HINT_CLUE` (bit 27, outline the driving clue cell). Folding these into the
per-tile packed flags before the cache compare means the hint draws when shown
and clears when the midend drops it — no separate invalidation path. The
hinted edge is marked on both sharing tiles (same pixels) for cache symmetry.

## Risks / Trade-offs

- A connect deduction that isn't individually forced (two-edge region growth)
  yields no hint *that step*; the fixpoint still records the wall/other no-wall
  deductions around it, so the plan is non-empty whenever the board is
  unsolved → mitigated by D2's unique-edge rule + D1's monotonic progress.
- Seeding from a *correct but unusual* player state can't regress progress
  (D1), so the only "no hint" outcomes are solved, mistaken, or
  not-uniquely-solvable — all reported with a clear message.

## Open Questions

None blocking. (A future option: also flag the *driving* mistake when a hint is
refused — deferred; `findMistakes` already highlights them via Check & Save.)
