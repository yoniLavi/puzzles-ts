# Design: Strengthen Undead's deductive solver

## Context

Undead's solver (`undead/solver.ts`) has a two-rung ladder — arc-consistency
(`solveIterative`) then full backtracking (`solveBruteforce`) — and grades difficulty
by *how much brute force a board needs* (`generator.ts:316-338`). Under the fork's
guess-free generation policy (`hint-authoring.md` §1A) that makes Normal/Tricky
non-compliant: measured, 73–100% of their boards can't be solved by arc-consistency
alone (see proposal table). The collection's other hard puzzles avoid this with a
graduated deductive ladder; Undead never built the middle rungs. This change adds
them. Read `hint-authoring.md` §1A and the `add-undead-hint` design first.

## Goals / Non-Goals

- **Goals:** Undead's Easy/Normal/Tricky tiers solvable by pure deduction; difficulty
  graded by deductive rung; generation gated so non-`Unreasonable` boards never need
  recursion; the recursion-only residual either dropped or moved to a sanctioned
  `Unreasonable` tier, decided by measurement; the strengthened solver doubles as the
  hint's deduction source.
- **Non-Goals:** path-consistency (follow-up); changing the move/render/UX surface;
  matching upstream's grading (we deliberately diverge); implementing in this change.

## Decisions

### D1 — Two new rungs: exact counting, then single-level forcing

The deductive ladder becomes: **arc-consistency** (existing `solveIterative`) →
**counting** → **forcing**, run to a combined fixpoint.

- **Counting.** `checkNumbers` currently enforces `placed ≤ target` *inside* a single
  path's enumeration. Lift totals to a standalone global constraint: because the three
  targets sum to the cell count, they are effectively equalities, which licenses
  Hall-type deductions — type fully placed ⇒ strike it from every undecided cell;
  type's remaining-need equals its candidate-cell count ⇒ force them all; candidate
  cells fewer than remaining-need ⇒ contradiction. Apply between arc-consistency
  passes so the two cascade.
- **Forcing (the load-bearing rung).** For each undecided cell, for each remaining
  candidate: hypothesise it, run the arc-consistency + counting fixpoint on a copy,
  and if that yields a contradiction (an emptied candidate set, an unsatisfiable
  clue, or a violated total) eliminate the candidate from the real grid. Depth-1
  only. This is the standard forcing technique (`DIFF_EXTREME` in the Latin solver),
  classed as deduction. **The guess/deduction line:** a single hypothesis resolved by
  pure propagation is deduction; a hypothesis that itself requires a *further*
  hypothesis to resolve is recursion → `Unreasonable` only. Enforce the line by not
  nesting forcing (the inner fixpoint runs arc-consistency + counting, never forcing).

### D2 — Re-grade by rung; gate generation guess-free

Replace the brute-force-amount grading (`generator.ts:316-338`) with rung-based
grading: Easy = solved by arc-consistency (within the existing pass cap); Normal =
needs counting; Tricky = needs forcing. A board is **accepted for a non-`Unreasonable`
tier only if the deductive ladder (no recursion) solves it uniquely** — the guess-free
gate. Keep the existing uniqueness guarantee via the brute-force oracle as a
*verification* step (a deductively-solved board must also be the brute-force solver's
unique solution), not as a *solve* step.

### D3 — The recursion-only residual: a measured keep-or-drop gate

After D1/D2 land, re-grade the current generator population (the proposal's 5 tiers,
larger N) and measure the fraction of boards the deductive ladder *cannot* solve
(still need recursion). Decision rule, settled with the owner from the numbers:

- **Residual negligible** (≈0 for Normal; small for Tricky) → reject those boards at
  generation. Undead is fully guess-free; no `Unreasonable` tier; `state.ts`
  `Difficulty` unchanged.
- **Residual meaningful** (the data hints high-ambiguity Tricky boards may survive) →
  add an explicit `Undead Unreasonable` difficulty (`state.ts` `Difficulty` +
  presets) carrying exactly those boards, under the sanctioned exception. Its hint is
  then allowed to be non-deductive on those boards (the only place the `add-undead-hint`
  solution-walk would survive — scoped to `Unreasonable`).

Because the expected outcome is "keep for Tricky", design the solver/grader so adding
the tier is a small delta (the brute-force solver already exists; the tier is just the
grade bucket for "needs recursion").

### D4 — Differential check role narrows to soundness

Undead's differential (`undead-differential.test.ts`) already records
order-independent solver *verdicts* (not byte-match — `qsort` tie-order, design D1 of
the port). With the new rungs Undead's grading deliberately diverges from upstream
(no forcing layer there), so the differential keeps the **soundness** assertions — a
generated board is uniquely solvable; the deductive ladder never accepts a board the
brute-force oracle finds non-unique or inconsistent — and drops any "grades like
upstream" expectation. Add a property test: every board accepted for a guess-free tier
is solved by the deductive ladder with **zero** forcing-hypothesis survivors beyond
one (i.e. no recursion was used).

### D5 — Performance

Forcing is O(cells × candidates × fixpoint), wrapped in the generator's
accept/regenerate loop, so it can be hot. Mitigations: run forcing only after
arc-consistency + counting reach fixpoint (most cells already decided); short-circuit
the inner fixpoint on first contradiction; reuse scratch typed arrays. Keep the
existing `MAX_REGENERATE` backstop. Measure generation wall-time in the re-grade step;
if a tier is too slow to generate, that informs the D3 decision (a tier that needs
forcing on most cells *and* is rare is a candidate for `Unreasonable` instead).

## Risks / Trade-offs

- **Forcing may not crack every Tricky board** → D3's `Unreasonable` branch absorbs
  the residual; we don't claim full guess-free until measured.
- **Generation slowdown** from forcing in the accept loop → D5 mitigations + measure.
- **Weaker hardest tier than upstream** if we drop the residual → acceptable per the
  policy (deliberate divergence); the `Unreasonable` branch preserves it if wanted.

## Migration Plan

1. Implement counting + forcing rungs (`solver.ts`), recorder-gated off so the path
   stays available to the hint later.
2. Re-grade generation by rung; add the guess-free accept gate (`generator.ts`).
3. Re-grade measurement across tiers (larger N); take the D3 decision with the owner.
4. If keeping: add the `Unreasonable` `Difficulty` + presets (`state.ts`/`index.ts`).
5. Update the differential to the soundness role (D4); add the no-recursion property
   test.
6. Revise `add-undead-hint`: drop D3 (solution-walk), narrate counting/forcing.

## Open Questions

- Final keep-vs-drop and the `Unreasonable` preset list — **deferred to the re-grade
  measurement** (D3), settled with the owner.
- Whether counting is needed as a *distinct* rung or subsumed by forcing — likely
  distinct (counting catches cheap total deductions forcing would re-derive
  expensively, and narrates more naturally). Confirm during implementation.
- Path-consistency as a further rung — out of scope, revisit only if the residual is
  large enough to matter (proposal "Out of scope").
