# Tasks: Strengthen Undead's deductive solver

> Implementation deferred to a follow-up session. This change is the approved design;
> the boxes below are the implementation checklist.

## 1. Deductive rungs (`undead/solver.ts`)
- [x] 1.1 **Counting rung**: promote totals to a global equality constraint —
  type-fully-placed strike, remaining-need-equals-candidates force, too-few-candidates
  contradiction. Apply between arc-consistency passes to a combined fixpoint.
  (`countingPass` + `arcCountFixpoint`.)
- [x] 1.2 **Forcing rung**: depth-1 hypothesise-each-candidate, run the
  arc-consistency + counting fixpoint on a copy, eliminate on contradiction. No nested
  forcing (the inner fixpoint never forces — that is the deduction/recursion line).
  (`forcingPass` + `forcingFixpoint`.)
- [x] 1.3 A `solveDeductive(common, guess)` entry running arc-consistency → counting →
  forcing to fixpoint, returning solved / stuck / inconsistent **without** recursion;
  keep `solveBruteforce` as the oracle. (Added a `maxRung` cap for tier-graded speed.)

## 2. Re-grade + guess-free gate (`undead/generator.ts`)
- [x] 2.1 Grade by rung needed (Easy = arc-consistency ≤3 passes, Normal = arc beyond
  the cap or counting, Tricky = forcing), replacing the brute-force-amount grading.
  (`gradeMatchesTier`.)
- [x] 2.2 Accept a board only if `solveDeductive` solves it uniquely (no recursion);
  verify uniqueness against the brute-force oracle (`isUniquelySolvable`).
- [x] 2.3 Confirm generation converges within `MAX_REGENERATE` per tier; record
  wall-time. 0 failures across all 8 tiers; <25ms/board avg, ≤78ms worst (the
  `maxRung` cap dropped 7×7 Normal ~145ms→23ms).

## 3. Re-grade measurement + the keep-or-drop decision (D3)
- [x] 3.1 Re-grade the population (8 tiers, ~6,800 full-ladder-graded candidates):
  **uniquely-solvable recursion residual = 0 on every tier** — the ladder cracks every
  unique board; the boards it can't solve are all non-unique (rejected by the oracle).
- [x] 3.2 Owner decision from the numbers: **DROP** the residual — Undead is fully
  guess-free, no `Unreasonable` tier (owner-confirmed; the data gave a zero residual).

## 4. `Unreasonable` tier — only if 3.2 says keep (`state.ts`, `index.ts`)
- [x] 4.1 N/A — 3.2 said **drop**. No `Difficulty` member added; the
  `DIFF_UNREASONABLE` scaffolding was reverted to a documenting comment in `state.ts`.
- [x] 4.2 N/A — no `Unreasonable` preset.

## 5. Differential + tests (D4)
- [x] 5.1 Narrowed `undead-differential.test.ts` to the soundness role: the deductive
  ladder solves every published (unique) board to *the* unique solution; the
  `gradeUndead`-vs-C assertions documented as ported-solver correctness, not a grade
  match.
- [x] 5.2 Property test (`undead-deduction.test.ts`): every accepted board (per tier,
  multiple seeds) is solved by `solveDeductive` at its tier's rung with **no** recursion
  and is independently unique.
- [x] 5.3 Per-rung unit tests (`undead-deduction.test.ts`): counting (fully-placed
  strike + Hall force, and zero-total strike), forcing (required for a Tricky board),
  and the no-guess boundary (a genuinely ambiguous board is left unsolved, not guessed).

## 6. Cross-change + close-out
- [x] 6.1 Revised `add-undead-hint`: removed the stale solution-walk parentheticals and
  the `Unreasonable`-conditional (proposal + design D3 + tasks); the hint plan is
  deductive across every shipped tier (the residual came out zero, so no tier is
  exempt).
- [x] 6.2 Full gate green (`tsc -b --noEmit` → `biome lint` → `vitest run` →
  `vite build`); updated `hint-authoring.md` §1A with the worked "strengthen a
  non-Latin solver" example (counting + forcing rungs, the `maxRung` grading cap, and
  the "measure the residual before shipping an Unreasonable tier" lesson).
- [x] 6.3 Owner acceptance: play-test the strengthened tiers; on sign-off, commit +
  `openspec archive strengthen-undead-deduction --yes`. **Owner-accepted 2026-06-27.**
  (The cognitive-load follow-up for Tricky's forcing *hint* is deferred to
  `add-undead-hint` D8 — a separate change; it does not block this solver/generator
  acceptance.)
