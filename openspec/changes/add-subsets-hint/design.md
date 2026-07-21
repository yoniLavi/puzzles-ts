# Design — add-subsets-hint

## Context

Subsets (`add-subsets-ts-port`, archived 2026-07-21) solves with a six-rule
candidate-elimination fixpoint over a cube `cube[cell][value]` of possible
set-values per cell (`solver.ts`). The player, however, never sees the cube:
the UI is per-**letter** tri-state marks (Known / Unknown / Cleared), and a
hint's moves must be `{ kind: "set", type, pos, bit }` letter toggles. The
central design problem is the projection: **cube-level eliminations must
surface as letter-level conclusions with their evidence intact.**

The rule vocabulary available for narration:

- **Arrow (containment)** — an arrow from cell S to cell T means
  `set(T) ⊆ set(S)`: every letter confirmed in T is in S
  (`known[S] |= known[T]`), and every letter ruled out of S is out of T
  (`mask[T] &= mask[S]`). These are *direct* letter deductions — the cleanest
  narration in the game.
- **Missing arrow (incomparability)** — no arrow either way between adjacent
  cells means neither set contains the other; in particular neither cell can
  be the empty or the full set, and next to a *decided* cell every candidate
  comparable with it is eliminated.
- **Exactly-once (counting)** — a set-value already placed is no candidate
  elsewhere; a set-value with exactly one remaining possible cell must go
  there.
- **Candidate collapse** — when every surviving candidate value for a cell
  contains letter L, L is Known; when none does, L is Cleared (the
  `bitsFromCube` projection — how cube-only rules become letter moves).

The engine side is entirely in place (hint hooks, `ActiveHint`,
`AUTO_HINT_STEP_MS`, `OverlaySidecar`, `hint-overlay.test.ts`). Exemplars to
mirror: Clusters (parallel recorder, honest refusal from the plan verdict),
Range (deductive narrate shape), Palisade (grouped multi-leg journey,
quality-bar rule 2); [`hint-authoring.md`](../../../docs/porting/hint-authoring.md)
§1–§3, §6.3.

## Decisions

### D1 — Parallel recorder over the same primitives; solve path untouched

Add `deduceHintPlan(state): SubsetsDeduction[]` to `solver.ts` as a *parallel*
recording pass (Clusters F1): it reuses the six rule functions' logic but
records each firing before applying it, and — unlike `subsetsSolveGame` — it
**does not reset the player's marks**: the plan continues from where the
player is. `subsetsSolveGame` / `subsetsValidate` are untouched, so the frozen
byte-match differential is unaffected by construction.

A recorded firing is letter-level:

```ts
interface SubsetsDeduction {
  pos: number;                       // the cell acted on
  sets: { bit: number; type: "known" | "cleared" }[];  // letters decided together
  reason:
    | { kind: "arrowKnown"; from: number; to: number }     // subset's letters propagate up
    | { kind: "arrowMask"; from: number; to: number }      // superset's exclusions propagate down
    | { kind: "collapse"; eliminated: EliminationEvidence } // bitsFromCube projection (D3)
    | { kind: "singlePosition"; value: number };            // last place for an unplaced set
}
```

### D2 — Audit BEFORE prose: the fixpoint must close from any correct position

The generator gates on the solver completing **from the givens**. A hint runs
**from the player's partial marks**; correct extra marks only add information,
so the fixpoint should still complete — but "should" is not "measured".
Before writing prose, sweep N seeds × M random correct-prefix positions and
confirm `deduceHintPlan` reaches a complete plan from every one (and record
the numbers here, per the Clusters D2 precedent). If some position stalls,
the resolution is scoped to this change: find the missing *narratable* step
or refuse with an honest "no further deduction from these marks — try
unmarking" message — never an un-narrated fallback.

Also audit **plan length pacing**: 16 cells × 4 letters is ≤ 64 letter moves;
grouped by firing this is expected to be ~15–25 journeys. Confirm auto-hint
pacing feels right at `AUTO_HINT_STEP_MS`.

### D3 — Cube-only eliminations narrate at their letter-level collapse

`cubeSingleCount`, `disjoint` and `applyArrowsAdvanced` eliminate candidate
*values*, which the player cannot see. Do **not** narrate those eliminations
as steps of their own (there is no move to attach them to, and the engine's
no-op-step guards forbid moveless steps). Instead, when `bitsFromCube`
collapses candidates into a letter conclusion, the recorded `collapse` reason
carries the elimination evidence that actually drove it — e.g. "the sets
{}, {A}, {A,B} are already placed elsewhere (marked), and every remaining
possibility for this cell contains C — so C is here." The evidence cells
(where the counted sets live / the incomparable neighbour) shade
`COL_HINT_CELL`.

The risk to resolve at implementation: a collapse's honest evidence can span
several eliminations. Prefer the **minimal sufficient evidence** for the
narrated letter (the eliminations that removed the last candidates lacking
the letter), and if a genuinely long tail remains, compress to the strongest
premise plus a count ("…and three sets already placed") rather than a list —
flag wording for owner acceptance (the Clusters §1B.1 precedent).

### D4 — One firing = one journey; letters of one cell as continuation legs

A firing that decides several letters at once (an arrow propagating two
letters; a `singlePosition` deciding a whole cell) emits one journey: the
first letter's move is the lead leg, the remaining letters follow with
`continuesPrevious: true` — auto-play walks them as one coherent hint
(quality-bar rule 2). All of a journey's marks render `COL_HINT` alike
(rule 3: equivalent moves share a colour).

### D5 — Refusal: findMistakes first, then honest solution comparison

`hint()` refuses with the standard banner when `findMistakes` flags anything
(the rule validator: duplicates + violated edges). That misses
wrong-but-locally-clean marks (a letter marked Known that the unique solution
excludes, with no local rule yet violated). Since the unique solution is
derivable (`solveCopy` from the givens — the generator guarantees it), compare
the player's decided letters against it and refuse honestly ("one of your
marks contradicts the solution — check your work") rather than hint into a
dead position. This is Range's re-solve shape; cheap at 16 cells.

### D6 — `hintKeepTrack`

A move completes the current step iff it is exactly the hinted letter toggle
(`pos`, `bit`, `type` all match). A multi-letter journey stays displayed
through its `continuesPrevious` legs. Anything off-plan returns `"off"`
(recompute — the plan restarts from the new position by D1, so recompute
stability per hint-authoring §6.3 is by construction: the rule order is a
deterministic scan, no heuristics).

### D7 — Rendering

Two palette indices appended past `COL_CURSOR = 8` (`COL_HINT = 9`,
`COL_HINT_CELL = 10`); an `OverlaySidecar` on the draw state, packed from the
step's highlights each frame, stale-checked in the per-cell cache-miss test
(playbook §3.2). The target letter slot gets the `COL_HINT` treatment; the
evidence cells shade `COL_HINT_CELL`. No pre-placed marks — the hint shows
*where* and says *which*; the player (or auto-hint) places it. Add Subsets to
`testing/hint-games.ts` for the cross-game overlay guard, and enrol in
`hint-resume.test.ts`.

## Risks

- **Evidence sprawl on collapse firings (D3)** — the honest premise set for a
  cube collapse can be large; wording compression is flagged for owner
  acceptance.
- **From-position completeness (D2)** — unmeasured until the audit runs; the
  change owns the resolution either way.
- **Letter-move granularity** — 4 moves to decide one cell could read as
  padding; D4's journey grouping is the mitigation, and pacing is part of the
  D2 audit.

## Open questions for the owner

- **Collapse evidence wording (D3):** when a letter conclusion rests on
  several placed-elsewhere sets, is "…and N other placed sets (marked)"
  acceptable compression, or should the hint enumerate them all?
  (Recommendation: compress past 3, with all evidence cells still shaded.)
