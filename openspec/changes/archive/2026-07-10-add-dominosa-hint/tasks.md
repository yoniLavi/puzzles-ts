# Tasks — add-dominosa-hint

## 1. Recording solver
- [x] 1.1 Add a gated recorder + `HintFiring` type to `solver.ts`; capture the
  firing technique + affected placements + per-technique evidence at each
  deduction's firing point (gated on the recorder so `runSolver` is unchanged).
- [x] 1.2 `seedFromDominoes(grid)`: force each placed domino's placement.
- [x] 1.3 `firstFiring(maxDiff)`: run deductions in `run_solver` order, return
  after the first firing (or an unplaced determined domino → `onlySpot`).

## 2. hint + narration + render
- [x] 2.1 `hint(state)`: refuse if solved / has mistakes / Ambiguous
  (non-unique); else build the plan over one persistent scratch, skipping
  already-drawn barriers.
- [x] 2.2 `narrate` per technique (necessity voice, indication-first, terse).
- [x] 2.3 `hintKeepTrack`: domino/edge move matches the step ⇒ advance, else off.
- [x] 2.4 `render.ts`: `COL_HINT` targets + suggested edge, `COL_HINT_CELL`
  evidence, hint bits in the packed diff key; palette appended past the enum.

## 3. Tests + verify
- [x] 3.1 Register `dominosaGame` in `hint-resume.test.ts`.
- [x] 3.2 Tier-1 `dominosa-hint.test.ts`: refusal (solved/mistake), narration
  voice guard, a placement + a barrier firing, plan completeness from empty.
- [x] 3.3 Tier-2.5 hint render scenario (target + evidence colours present).
- [x] 3.4 Full gate green; Playwright dev verify (manual step, auto-hint solves,
  0 console errors).

## 4. Close
- [x] 4.1 Update hint-authoring.md with any new lesson; keep the change current.
- [x] 4.2 **On owner acceptance:** commit + `openspec archive add-dominosa-hint`.
</content>
