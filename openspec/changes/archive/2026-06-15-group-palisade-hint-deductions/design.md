# Design

## Context

The Palisade hint (`add-palisade-hint`, archived) runs the deductive solver
seeded from the player's state and returns every forced edge as a flat,
de-duplicated `ForcedEdge[]`, each mapped 1:1 to a `HintStep`. Two of the six
deductions force more than one edge per firing:

- `equivalentEdges` — a coupled **pair**: two edges of a clue cell that border
  the same connected region must share a fate (both walls or both open), and the
  clue count forces which. It records both via `connectEdge`/`disconnect`.
- `numberExhausted` — **2–3 edges** of one clue: when the clue's walls are all
  placed, every remaining edge is forced open; when only walls can reach the
  clue, every remaining edge is forced to a wall.

The midend already presents several steps as one journey: `HintStep.continuesPrevious`
keeps the display on across a manual leg completion, and `executeHint` plays each
leg as its own (animated) move. The capability is generic; Palisade just doesn't
group.

## Goals / Non-Goals

- **Goal**: a single deduction firing becomes one multi-leg hint journey, with
  narration that states the coupling and "do both/all" framing.
- **Goal**: codify the grouping as a cross-game authoring convention.
- **Non-Goal**: any `Midend`/engine code change — the mechanism exists.
- **Non-Goal**: a Palisade move animation. Edge edits are instantaneous
  (`animLength: () => 0`); auto-hint paces the legs by the loop's
  `currentAnimationMs() + 100` gap. The manual journey-display works regardless.
  A visual edge-beat is a possible later refinement, explicitly out of scope.

## Decisions

### D1 — Firing tag, recorded in the solver, grouped in the hint

Add a `group: number` field to `ForcedEdge`, stamped by the recorder. A
`SolverCtx.firing(fn)` helper bumps a shared counter and runs `fn` so every edge
`fn` records shares that group id; recordings made outside a firing each get a
fresh group (one-edge groups, i.e. ordinary single steps). Only
`equivalentEdges` (its pair) and `numberExhausted` (each multi-edge sweep) wrap
their records in `firing(...)`.

`deduceForcedEdges` keeps its flat return and existing physical-edge dedup; since
a firing's edges are pushed contiguously and dedup keeps the first occurrence,
the survivors stay grouped contiguously. `hint()` splits the flat list into
contiguous runs of equal `group` and builds one journey per run.

*Alternative considered*: return `ForcedEdge[][]` (pre-grouped) from
`deduceForcedEdges`. Rejected — it churns the three existing tests that iterate
the flat list, for no gain over a contiguous-run split in `hint()`.

### D2 — Sibling highlights derived from the group, not the solver

Today only `equivalentEdges` computes a `siblings` evidence object in the solver
(the partner edge). With grouping, the partner is simply the group's other edge,
so `hint()` derives each leg's sibling highlights from group membership: leg `i`
shows the firing's edges at index `> i`, so leg 0 shows the whole set and the
extras drop off as legs complete. This unifies `equivalentEdges` and
`numberExhausted` (which gains siblings) and removes the solver's now-redundant
per-edge sibling plumbing — one source of truth.

`ForcedEdge.cells` (the referenced region for `equivalentEdges`, the clue cell
for `numberExhausted`) stays solver-computed and is shared by every leg of the
group.

### D2a — A firing's edges all paint one colour (orange sibling removed)

Round 2 of the original hint change introduced a distinct `COL_HINT_SIBLING`
(orange) for the *referenced-but-not-acted* edge, to kill the "which one is
'this edge'?" ambiguity when a single deduction had **one** action edge and the
other edge was merely context. Grouping changes that premise: now **both** edges
are acted on (they're the legs of one journey), and the deduction's content is
precisely "these edges share a fate." So colouring them differently would
mislead — they should read as one equivalent set. We therefore render **every**
edge a firing forces in `COL_HINT` (blue) and delete the orange `COL_HINT_SIBLING`
colour, its `sibCache` sidecar, and the `sib` threading through `drawTile`. The
narration is correspondingly order-agnostic ("so neither can be a wall", not
"clear this edge, then the other") since the colour no longer singles one out.
`hintKeepTrack` stays strict on the displayed leg's edge; if the player happens
to act on the other leg's edge first, the plan drops and the next request
recomputes the (now shorter) journey — self-healing, the existing graceful path.

### D3 — Narration

`explain()` takes the leg index and group size:

- **Continuation leg** (`index > 0`): short, kind-specific —
  "…and this edge can't be a wall either." / "…and this edge must be a wall too."
- **First leg of a multi-edge `equivalentEdges` firing** — states the coupling:
  > "Both highlighted edges border the same region (shaded), so they share a
  > fate — either both walls or both open. Walling both would give clue N more
  > walls than it allows, so neither is: clear this edge, then the other."
  > *(wall branch: "Leaving both open would leave clue N short of walls, so both
  > are walls: draw this edge, then the other.")*
- **First leg of a multi-edge `numberExhausted` firing**:
  > "Clue N already has all N of its walls, so its remaining edges can't be
  > walls — clear this one, then the rest."
  > *(wall branch: "Clue N can only reach its count if every remaining edge is a
  > wall — draw this one, then the rest.")*
- **Single-edge groups** keep the existing per-rule narration (improved
  `equivalentEdges` wording for the rare post-dedup singleton).

"both" vs "all" / "the other" vs "the rest" keys off group size (2 vs >2).

### D4 — Test targeting

`palisade-render-scenario.test.ts` scans for an `equivalentEdges` frame by
"has a sibling edge". Now `numberExhausted` legs also have siblings, so the scan
could stop on the wrong rule. Tighten the predicate to require the referenced
cells to be a **region** (`hl.cells.length > 1`) — `equivalentEdges` shades the
whole region (>1 cell) while `numberExhausted` references a single clue cell — so
it still resolves to the intended frame.

## Risks

- **Group contiguity after dedup**: relies on a firing's edges being recorded
  consecutively and dedup keeping the first. True today (the fixpoint runs one
  rule fully before the next, and a firing's inner loop is uninterrupted). A unit
  test asserts a known multi-edge firing produces one journey with the
  continuation flag set.
- **Narration drift**: the render-scenario snapshot pins the opener frame, not
  the equivalentEdges prose; the equivalentEdges narration is asserted by a
  targeted unit test on the step's `explanation`.
