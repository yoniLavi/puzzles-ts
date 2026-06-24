# Tasks: Strengthen Undead's deductive solver

> Implementation deferred to a follow-up session. This change is the approved design;
> the boxes below are the implementation checklist.

## 1. Deductive rungs (`undead/solver.ts`)
- [ ] 1.1 **Counting rung**: promote totals to a global equality constraint —
  type-fully-placed strike, remaining-need-equals-candidates force, too-few-candidates
  contradiction. Apply between arc-consistency passes to a combined fixpoint.
- [ ] 1.2 **Forcing rung**: depth-1 hypothesise-each-candidate, run the
  arc-consistency + counting fixpoint on a copy, eliminate on contradiction. No nested
  forcing (the inner fixpoint never forces — that is the deduction/recursion line).
- [ ] 1.3 A `solveDeductive(common, guess)` entry running arc-consistency → counting →
  forcing to fixpoint, returning solved / stuck / inconsistent **without** recursion;
  keep `solveBruteforce` as the oracle.

## 2. Re-grade + guess-free gate (`undead/generator.ts`)
- [ ] 2.1 Grade by rung needed (Easy = arc-consistency, Normal = counting,
  Tricky = forcing), replacing the brute-force-amount grading.
- [ ] 2.2 Accept a non-`Unreasonable` board only if `solveDeductive` solves it uniquely
  (no recursion); verify uniqueness against the brute-force oracle.
- [ ] 2.3 Confirm generation converges within `MAX_REGENERATE` per tier; record
  wall-time (feeds the D3 decision).

## 3. Re-grade measurement + the keep-or-drop decision (D3)
- [ ] 3.1 Re-grade the current population (the 5 proposal tiers, larger N): fraction of
  boards still needing recursion after the deductive ladder; generation wall-time.
- [ ] 3.2 Owner decision from the numbers: **drop** the residual (fully guess-free, no
  new tier) **or keep** it as a sanctioned `Unreasonable` tier.

## 4. `Unreasonable` tier — only if 3.2 says keep (`state.ts`, `index.ts`)
- [ ] 4.1 Add `"unreasonable"` to `Difficulty` (+ `DIFFS`, `diffToLevel`/`diffName`,
  encode/decode); the grade bucket for "needs recursion".
- [ ] 4.2 Add the `Unreasonable` preset(s) to `PRESETS`; generation accepts
  recursion-only boards there.

## 5. Differential + tests (D4)
- [ ] 5.1 Narrow `undead-differential.test.ts` to the soundness role: accepted boards
  uniquely solvable; the deductive ladder never accepts a non-unique/inconsistent
  board.
- [ ] 5.2 Property test: every board accepted for a guess-free tier is solved by
  `solveDeductive` with **no** recursion.
- [ ] 5.3 Per-rung unit tests: a counting deduction, a forcing deduction, the
  no-nested-forcing boundary.

## 6. Cross-change + close-out
- [ ] 6.1 Revise `add-undead-hint`: drop the solution-walk fallback (its D3); narrate
  the counting/forcing deductions; if a `Unreasonable` tier exists, scope any
  non-deductive hint behaviour to it alone.
- [ ] 6.2 Full gate green (`tsc -b --noEmit` → `biome lint` → `vitest run` →
  `vite build`); update `hint-authoring.md` §1A / the port playbook with what the
  ladder surfaced (the counting/forcing rungs as a reusable pattern for a non-Latin
  candidate game).
- [ ] 6.3 Owner acceptance: play-test the strengthened tiers (and `Unreasonable` if
  kept); on sign-off, commit + `openspec archive strengthen-undead-deduction --yes`.
