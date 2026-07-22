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

## Owner-driven redesign (2026-07-21): per-slot narration + a Dominosa-style spotlight

Two rounds of owner review reshaped the hint from the first cut (D1–D7 below
describe the recorder mechanics, which stand; the *presentation* is superseded
here):

- **Per-slot steps toward a sub-goal (like every other candidate game).** A
  cell becoming a set is a **sub-goal journey**; each leg decides **one letter**
  with its own specific string ("The highlighted set contains C, so mark C
  present") — never a shared "for the same reason". This makes Subsets
  consistent with Towers/Undead/Solo (one note per step) while keeping the
  quality-bar "one deduction = one journey" grouping.

- **The set→placement spotlight (Dominosa `highlightPair` analog), player-facing.**
  Subsets already ships half of Dominosa's reference aid — the **tally band** is
  the "every set with placed/unplaced/duplicated status" checklist. The missing
  half is the **spotlight**: selecting a set lights up every cell it can still
  legally go in. Added as a real player affordance (`ui.highlightSet`, click a
  tally entry) **and** reused by hints. Candidate cells are computed *shallowly
  from the board* (marks + arrows/adjacency to decided neighbours + not placed
  elsewhere — `candidateCells` in `solver.ts`), the Dominosa "no solver, no
  solution leak" rule, so the aid never solves for the player and a hidden-single
  hint's "only this cell" claim is verifiable against the same spotlight.

- **Two counting directions, each with its visual.** *Hidden single* ("this
  set fits only one cell" — `candidateCells(S).length === 1`) is the crisp,
  spotlight-shaped deduction and is tried **before** the naked-single collapse
  ("this cell fits only one set" — the cube `bitsFromCube`, tally-shaped). The
  ordering (arrows → hidden-single → collapse) surfaces the most teachable form
  first.

  **Measured shift (60 seeds):** with the reorder the mix is arrowKnown 254,
  arrowMask 378, **hiddenSingle 319**, collapse 501, singlePosition 9 — against
  a pre-reorder counting split of collapse ≈ 603 / singlePosition ≈ 25. So
  **~319 counting deductions (≈38% of all counting) moved into the verifiable
  hidden-single form**, even though the shallow candidate test is strictly
  weaker than the cube's. 60/60 boards still solve, so completeness is
  unaffected — the collapse remains the fallback for the naked-single cases
  where no set has a single spot.

- **Highlight matches the claim.** A per-slot step highlights the acted **slot**
  (`COL_HINT`), plus its evidence: the spotlit candidate cell(s) for a hidden
  single, the surviving set(s) in the tally for a collapse, or the neighbour
  cell for an arrow. The whole-cell-vs-slot confusion is gone because each
  string is now about one slot.

Final narration shapes (attention → deduction → action, per slot):
- **arrow:** "The highlighted cell's set lies inside this one, and its A is
  marked — so A must be here too. Mark A present."
- **hidden single:** "The highlighted set can go nowhere but this cell. It
  contains A — so mark A present." (+ its later letters: "It also contains C —
  mark C present." / "It has no B — clear B.")
- **collapse:** "Only the highlighted set can still go in this cell. It contains
  A — so mark A present." (+ later letters likewise.)

## Further owner enhancements (2026-07-21, round 2)

- **Reverse reference aid (cell→sets).** The tally→cells spotlight gained a
  dual: focusing a cell (touching a slot, or the keyboard cursor) tints in the
  tally every set that cell could still hold (`candidateSets`, the inverse of
  `candidateCells` over the shared `whyCantPlace` predicate). The two directions
  are one `ui` focus (`highlightSet` xor `highlightCell`), and are suppressed
  while a hint is displayed so they never fight the hint overlay.
- **Collapse "why not X" (`pickExclusion`).** A collapse lead now names one
  excluded competitor and the *visible* rule that blocks it — clearest first:
  already-placed (concrete counting, and the reason that actually explains the
  collapse), then a horseshoe, then a missing horseshoe. The blocker cell is
  highlighted so "the highlighted cell/neighbour" (or "(highlighted)" for a
  placed competitor) has a referent. Measured: the placed reason dominates (a
  competitor is almost always already on the board), which is exactly the
  exactly-once logic the collapse rests on.
- **Placed-set distinct colour (`COL_HINT_PLACED`).** Clicking an *already
  placed* set lights its home amber — "where it *is*" — versus the green "where
  it could still go" spotlight, so the aid distinguishes placement from
  possibility. Implemented by colouring a candidate cell that is *decided*
  differently, so a placed set (whose only candidate is its decided home) is
  amber for free.

## Round 3 (owner, 2026-07-21/22)

- **Dedicated inspect icon, touch-sized, inspect-only.** The first cut focused
  a cell as a *side effect* of touching a slot, which conflated inspecting with
  editing. Replaced by a per-cell **inspect badge** in the margin *above* the
  block (outside it, so it belongs to the whole cell, not one slot). It does
  nothing but toggle the cell→sets aid. Its tap target can't grow down into the
  block (that would steal slot taps) or right past the block mid-line (a
  horseshoe sits there), so it is a **strip widened along the block's top edge**
  to a touch-reasonable size within the available margin. The keyboard cursor
  still inspects, for parity.
- **Sub-goal-clear continuations.** Continuation legs named the referent with a
  bare pronoun ("None of *them* has D"), which was unclear. Every continuation
  now names its referent in full and signals the sub-goal — "Still filling this
  cell — the highlighted set also contains C, so mark C present here" — matching
  the Towers "Continuing …" convention (hint-authoring §9.4a).

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

**Audit results (40 seeds × 5 random correct-prefix positions, `_audit`):**

- **Completeness:** 40/40 boards complete from the givens; **200/200
  from-position prefixes** reach a complete board. The recorder never stalls
  from a correct partial position — D2's precondition holds by measurement.
- **Plan shape:** avg **27.1 journeys/board** (17–37), avg **1.59
  legs/journey** (max 4). One request = one journey; auto-hint pacing at
  `AUTO_HINT_STEP_MS` plays a journey's legs back-to-back.
- **Reason mix (per firing):** arrowKnown 178, arrowMask 278, **collapse 603
  (~55%)**, singlePosition 25. **Collapse is the dominant reason, not rare** —
  so its narration is first-class, not a fallback.
- **Collapse evidence — the D3 resolution the data chose:** the *eliminated*
  evidence is large (avg 4.4, max 14 placed-elsewhere sets) — enumerating it
  is out. But the *surviving* candidates are few: avg **1.64**, and **≤3 in
  564/603 (94%)** collapses (max 6). So the premise that forces the letter is
  "every set still available for this cell agrees on it" — a statement about
  the *surviving* sets, not the eliminated ones.

**Owner revision (2026-07-21) — structure + the "highlighted set".** On owner
review of the first cut, two changes: (a) **every** narration is structured
**attention → deduction → action** ("what to look at → what it forces → the
board change"); (b) the surviving/placed sets are not *named inline* ("leave
this cell only {A,C,D}" read confusingly) but **highlighted in the tally band**
and referred to as "the highlighted set(s)" — the word "elsewhere" is gone. A
set lives only in the tally when it is unplaced, so that is where "the
highlighted set" is shown (`COL_HINT_CELL` tint on the tally entry). Arrows
instead highlight the neighbour *cell* ("the highlighted cell"), and collapse/
single-position highlight the *set(s)* — never both, so the reference is
unambiguous. Final shapes, all attention→deduction→action:
  - **arrowKnown:** "The highlighted cell's set lies inside this cell's. Its A
    is marked, so A must be present here too. Mark A present."
  - **arrowMask:** "This cell's set lies inside the highlighted cell's. B is
    ruled out of the highlighted cell, so B can't be here either. Clear B."
  - **collapse:** "Only the highlighted set(s) can still go in this cell. It
    contains A and C but lacks B. So mark A and C present and clear B."
  - **singlePosition:** "The highlighted set has only this cell left to go in.
    It contains C but lacks D. So mark C present and clear D."

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
