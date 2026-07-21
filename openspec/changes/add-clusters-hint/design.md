# Design — add-clusters-hint

## Context

Clusters (`add-clusters-ts-port`, archived 2026-07-21) is a two-colour
grid-shading logic puzzle with a **contradiction solver**: for each empty cell it
tentatively sets a colour and, if that makes the board `INVALID`, forces the
opposite colour. The three invalidity rules (from `clustersValidate` /
`cellInError`) are the vocabulary a hint narrates:

- **wholly-surrounded** — a cell whose every orthogonal neighbour is the other
  colour (`other === max`);
- **dot-overcount** — a *given dot* (`F_SINGLE`) touching more than one
  same-colour neighbour (`same > 1`);
- **can't-reach-two** — a non-dot cell that can no longer reach two same-colour
  neighbours (`other === max - 1`).

The engine side is entirely in place (hint hooks, `ActiveHint` lifecycle,
`AUTO_HINT_STEP_MS` pacing, `OverlaySidecar`, the `hint-overlay.test.ts` guard).
This change only makes Clusters an *implementer*. The exemplars to mirror are
[`range/`](../../../src/native/games/range/) (deductive, solver-records → `hint`
→ render) and, for the forcing-chain legs, the Palisade grouped multi-leg
journey (quality-bar rule 2) — see
[`hint-authoring.md`](../../../docs/porting/hint-authoring.md) §1–§3.

## Decisions

### D1 — The solver *is* the hint engine: add a recording pass

Follow the "one deduction engine, two projections" doctrine
(`narratable-deduction-engine`; Range's shape). Add
`deduceHintPlan(grid, w, h): ClustersDeduction[]` to `solver.ts`, where each
`ClustersDeduction` carries:

```ts
interface ClustersDeduction {
  index: number;            // the forced cell
  fill: ClustersFill;       // the colour it is forced to
  reason:                   // why the OTHER colour is impossible
    | { kind: "surrounded"; cell: number }
    | { kind: "dotOvercount"; dot: number }
    | { kind: "reachTwo"; cell: number }
    | { kind: "chain"; steps: ChainStep[] };  // depth-1 lookahead (D3)
  evidence: number[];       // neighbour cells that are the premise (to shade)
}
```

The recording pass reuses the exact `solverTry` logic (single-cell forcing) but,
instead of only mutating, records the firing before applying it — so the plan is
the same sequence of moves the generator's solver would make, in the same order.
The non-recording `solveGame` / `clustersValidate` used by the generator and
`solve()` are untouched (byte-match intact).

**Why per-firing recording, not a diff of before/after grids:** the *reason* (which
rule the opposite colour breaks) is only knowable at the moment of the firing —
recompute `cellInError` on the tentatively-opposite board and read which of the
three clauses tripped. Record that clause and the neighbours it counted.

### D2 — Guess-free audit BEFORE writing prose (the hint's precondition)

Clusters ships **one tier** and gates generation on `solveGame(…, maxdiff = 1)`,
which uses `solverRecurse` (depth-1 lookahead). Per
[`hint-authoring.md`](../../../docs/porting/hint-authoring.md) §1A, before writing
the hint we MUST confirm the *narratable* deduction can crack every board the
generator emits — a hint may never fall back on an un-narrated step.

Two sub-questions to answer with a measurement (a fixed-seed sweep of, say, 500
boards per preset), recorded here before implementation:

1. **How often is `solverRecurse` actually needed?** Run each generated board
   through `solverTry`-only to a fixpoint; count the boards that need the
   lookahead rung to complete. If it is rare, D3's chain narration covers the tail;
   if it is common, D3 must be first-class.
2. **Is `solverRecurse` narratable as deduction, or is it guessing?** Argued yes
   (a *forcing chain*: one hypothetical + forced-only propagation → contradiction,
   which §1A classifies as deduction, not the nested speculation that is
   Unreasonable-only) — but confirm the propagation inside it never itself needs a
   second standing hypothesis. If any board needs true nested speculation, the
   resolution is to **reject it at generation** (retry away), not to ship an
   un-narratable hint — and re-measure generation time.

Record the measured numbers in this file when the change is implemented.

### D3 — Depth-1 firings narrate as a multi-leg forcing-chain journey

A `solverRecurse` firing ("if cell X were blue, propagate the forced consequences
until some cell is wholly surrounded → contradiction → X is red") is **one
deduction that the player should see unfold**, so emit it as one journey
(quality-bar rules 2 + 5):

- **Leg 1** marks the hypothetical (X = blue, shown as a tentative mark) and the
  first forced consequence, narrated "Suppose X were blue; then its neighbour must
  be … ".
- **Continuation legs** (`continuesPrevious: true`) each add the next forced cell
  as a board mark, one inferential step at a time, the accumulated marks carrying
  the chain state — never a single dense sentence.
- **Final leg** reaches the contradiction ("… now this cell has only red
  neighbours, which is impossible — so X must be red") and applies the real move.

The `ChainStep[]` recorded in D1 is the propagation trace (`solverTry`'s forced
cells, in order, until the contradiction). Cap the displayed chain length for
readability; if a chain is pathologically long, prefer rejecting that board at
generation (D2) over an unreadable hint. Single-cell (`solverTry`) firings stay a
**one-leg** journey — the common, cleanest case.

### D4 — Narration: premise → contradiction → conclusion, per rule

Each firing's prose names the rule, in the necessity voice, terse (Range's
`narrate` is the model). Draft strings (to refine in play):

- **surrounded:** "If this cell were {colour}, every neighbour would be the other
  colour and it could never join a cluster — so it must be {other}."
- **dotOvercount:** "This dot must touch exactly one same-colour cell. Colouring
  this cell {colour} would give it a second — so it must be {other}."
- **reachTwo:** "Every non-dot cell needs two same-colour neighbours. If this cell
  were {colour} it could reach only one — so it must be {other}."
- **chain (D3):** the leg-by-leg narration above.

If a narration's conclusion doesn't follow from its stated premises, the coupling
is missing — surface it (the Palisade `equivalentEdges` lesson).

### D5 — Rendering: reuse the `OverlaySidecar`, don't hand-roll

The forced cell is the `COL_HINT` target; the `evidence` neighbours (and, for a
chain, the marked chain cells) shade `COL_HINT_CELL`. Two new palette indices
appended past the existing enum (`COL_CURSOR = 7` → `COL_HINT = 8`,
`COL_HINT_CELL = 9`), an `OverlaySidecar` instance on the draw state packed each
frame (`pack(step?.highlights, index, markBits)`), stale-checked in the cache-miss
branch, committed after draw (§3.2). Do **not** pre-place the forced colour — the
hint highlights *where* and the prose says *which*; the player (or auto-hint)
places it (the Range/owner convention, hint-authoring §3). The cross-game
`hint-overlay.test.ts` covers it automatically once Clusters is in
`testing/hint-games.ts`.

### D6 — `hintKeepTrack`

A move completes the current step iff it sets the hinted cell to the hinted colour
(mirror Range's target check). A multi-leg chain journey stays displayed through
its `continuesPrevious` legs; only an unflagged next firing waits to be asked for.
Anything off-plan returns `"off"` to recompute.

## Risks

- **Chain readability (D3).** A depth-1 forcing chain can be long. Mitigations:
  cap the displayed length, prefer the single-cell firings first (order the plan so
  `solverTry` deductions lead), and — if measurement (D2) shows long chains are
  common — reconsider rejecting those boards at generation.
- **Guess-free precondition (D2).** If some shipped board genuinely needs nested
  speculation, this change must resolve it (reject-at-generation) rather than ship
  an un-narrated hint — that is scope this change owns, not a follow-up.
- **Order stability.** The plan must be recompute-stable (hint-authoring §6.3):
  the deduction order is deterministic (row-major cell scan), so a recompute after
  the player's own move yields a consistent next firing — but re-verify against
  `hint-resume.test.ts`.

## Open questions for the owner

- **Depth-1 chains: narrate or reject?** D2's measurement decides. If the lookahead
  is needed on only a tiny fraction of boards, is a capped forcing-chain narration
  acceptable, or would you rather reject those boards at generation for a uniformly
  single-step hint experience? (Recommendation: narrate — it teaches the strongest
  technique the puzzle has — with a reject fallback only for pathologically long
  chains.)
