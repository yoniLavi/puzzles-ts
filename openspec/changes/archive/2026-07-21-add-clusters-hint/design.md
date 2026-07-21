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

> **Measured (2026-07-21, 500 boards/preset, fixed seeds).** The lookahead rung
> is *common*, not a tail: **39.4%** of 7×7 boards, **45.6%** of 8×8, **52.4%**
> of 9×9 and **55.8%** of 10×10 need `solverRecurse` beyond a `solverTry`-only
> fixpoint. Under the restart discipline the hint plan uses (single-cell
> firings first, one lookahead firing per stall), a stalling board stalls
> **~1–1.8 times** total. Chain lengths (forced cells inside the hypothetical,
> per-cell early-stopped): first-in-scan-order firing mean 6.4–7.4, max 22–32;
> **shortest-available firing mean 3.2–3.5, median 2–3, p90 5–6, max 11** — so
> the plan picks the shortest chain at each stall and no display cap is needed.
> Sub-question 2 is answered by code inspection: inside `solverRecurse`'s
> hypothetical the scratch board runs `solveGame(…, 0)` — pure `solverTry`,
> which never itself hypothesises — so a lookahead firing is always one
> standing hypothesis plus forced propagation (deduction per §1A), never
> nested speculation. **Reject-at-generation is untenable at these rates**: it
> would re-generate roughly half of all boards, break the byte-match
> differential (the generator would emit different descs), and slow "New Game"
> — so the resolution is to narrate (D3), not to reject.

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

> **OVERTURNED IN IMPLEMENTATION (2026-07-21) — a chain firing is one rich
> step, not a multi-leg journey.** The journey shape below is mechanically
> closed without an engine change this proposal excludes: `HintStep.move` is
> required, auto-play (`executeHint`) applies every leg's move for real, and
> the cross-game guards forbid no-op steps — but a chain's intermediate marks
> are *hypothetical* (true only under the refuted colouring), so they can
> never be legs' moves. The implemented shape follows Slant §5.6b (an
> intrinsically-chain technique the game has no board vocabulary to
> externalise → one honest step, evidence on the board, flagged for owner
> acceptance) plus Undead §9.4 (measure before paying for what-if-walk
> machinery):
>
> - **One `HintStep` per chain firing.** The whole what-if walk is shown
>   *statically* via highlights: the hypothesis cell is the plain `COL_HINT`
>   target (no colour preview, §5.1), each forced cell in the chain shades
>   `COL_HINT_CELL` and carries a **small centre mark of the colour the
>   hypothesis would force it to** (deliberately tile-unlike in size, so it
>   reads as hypothetical, not placed), and the tile where the contradiction
>   lands gets the amber **danger double ring**.
> - **Shortest-chain selection** keeps the §1B damage small: at each stall
>   the plan takes the candidate firing with the shortest per-cell-stopped
>   propagation (median 2–3 forced cells, max 11 — see D2), tie-broken by
>   scan order for recompute stability. No display cap needed.
> - The narration asserts the contradiction and names the rule it lands on
>   ("Suppose this cell were blue: the marked cells would each be forced in
>   turn, until the ringed dot would touch a second tile of its own colour —
>   impossible. So this cell must be red.") — the §1B.1 tension (a chain
>   compressed into one step) is deliberate and **flagged for owner
>   acceptance**, with the marks carrying the walk visually.
>
> The original design below is kept for the record.

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

## Implementation findings (2026-07-21)

- **F1 — D1's shape simplified.** `deduceHintPlan` is a *parallel recorder*
  (the Undead §9.4 / Pattern §5.6a shape): separate functions reusing the
  module's primitives, so `solveGame`/`clustersValidate` carry no recorder
  flag and the generator differential is unaffected by construction. The
  recorded reason is re-derived per firing via `contradictionAround` — after
  filling one cell on an error-free board, a new violation can only sit at
  that cell or an orthogonal neighbour, so no full-board classify is needed.
  The plan discipline deliberately differs from `solveGame`'s pass-sweeps
  (restart after each firing; shortest-chain stalls): confluence makes it
  safe — the three error conditions are **monotone** (filling cells can only
  create violations, never cure them), so a refuted colouring stays refuted
  and any scan order reaches the C solver's verdict.
- **F2 — monotonicity buys position certification for free.** A COMPLETE
  plan verdict proves every tile the player placed is correct (a wrong tile
  can never extend to a zero-error grid, since the unique solution is the
  only such grid). So `hint()` needs no solution comparison: verdict INVALID
  ⇒ refuse honestly ("these colours lead to a contradiction — a tile must be
  wrong") even though `findMistakes` (local rules only) sees nothing; this
  is the wrong-but-locally-clean case Range handles by solving, obtained
  here from the plan itself. Guarded by the "refuses honestly on a
  wrong-but-locally-clean board" test.
- **F3 — D1's `evidence` list dropped; D5's `COL_HINT_REF` premise ring
  dropped.** Reading whole plans aloud (§6.4) showed "the ringed tile" going
  ambiguous the moment two ring roles were on screen — and every premise
  tile of the three local rules sits *orthogonally adjacent* to the target
  or the danger tile, already in view. The final legend is three roles:
  `COL_HINT` target fill, `COL_HINT_DANGER` **double** ring on the tile the
  refuted colouring would break (doubled so it cannot be confused with the
  single red live-error frame — same visual language on purpose: "would
  break" vs "breaks now"), and the chain's shaded what-if marks. "Ringed" in
  a narration refers uniquely to the danger ring (asserted in
  `clusters-hint.test.ts`).
- **F4 — §2.7 degenerate extreme caught in the read-through.** "The ringed
  red tiles hem this cell in" fired with *one* hemming tile at a corner
  (where the board edge does the hemming); reworded count- and edge-neutral:
  "there's no room left around it".
- **F5 — the port's header comment misstated the game rule** ("every tile
  touches at least one same-colour neighbour"); upstream's statement is
  dots = exactly one (all given), every other tile **two or more**. Fixed in
  `index.ts` — the narration depends on the real rule (§2.8: hint vocabulary
  and docs must agree; the help page already states it correctly).
- **F6 — `hintKeepTrack` treats a multi-cell drag as off-plan** even when it
  covers the target: the extra cells are moves the plan didn't account for,
  and "completed" asserts the remaining steps stay valid. Only the exact
  one-cell hinted paint completes a step.

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
