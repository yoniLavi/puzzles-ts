# Tasks — add-subsets-hint

## 0. Audit (design D2 — before any prose)

- [ ] 0.1 Sweep N fixed seeds × M random correct-prefix positions; confirm
      `deduceHintPlan` completes from every one (no reset — from-position).
      Record the numbers in design.md.
- [ ] 0.2 Measure plan shape: journeys per board, letters per journey,
      collapse-evidence sizes (feeds D3's compression call and D4's pacing).

## 1. Recorder (solver.ts)

- [ ] 1.1 `deduceHintPlan(state): SubsetsDeduction[]` as a parallel recorder
      over the existing rule primitives; `subsetsSolveGame`/`subsetsValidate`
      untouched (differential unaffected by construction — assert it stays
      green).
- [ ] 1.2 Letter-level firings with reasons (`arrowKnown` / `arrowMask` /
      `collapse` / `singlePosition`) and minimal-sufficient evidence (D3).
- [ ] 1.3 Tier-1 tests: plan from givens matches the solver's verdict; plan
      from a mid-position continues (not restarts); deterministic order.

## 2. hint() / hintKeepTrack() (index.ts)

- [ ] 2.1 Narration per reason kind (premise → conclusion, necessity voice;
      D3 wording; read every narration aloud against its board).
- [ ] 2.2 One firing = one journey; multi-letter firings as
      `continuesPrevious` legs (D4).
- [ ] 2.3 Refusal: `findMistakes` banner; wrong-but-locally-clean via
      solution comparison (D5); solved-board refusal.
- [ ] 2.4 `hintKeepTrack`: exact letter-toggle completion; off-plan
      recompute (D6).

## 3. Rendering

- [ ] 3.1 `COL_HINT` / `COL_HINT_CELL` palette + `OverlaySidecar` in the
      cache-miss test (playbook §3.2).
- [ ] 3.2 Enrol in `testing/hint-games.ts` (overlay guard) and
      `hint-resume.test.ts`.
- [ ] 3.3 Tier-2.5 render scenario: a hint frame with target + evidence
      shading, targeted assertions + snapshot.

## 4. Close out

- [ ] 4.1 Full gate green; `openspec validate add-subsets-hint --strict`.
- [ ] 4.2 Dev-verify in the browser: hint display, auto-hint pacing, journey
      continuity, refusal banner on a mistaken board.
- [ ] 4.3 Update hint-authoring.md if the cube→letter projection (D3) taught
      a pattern the guide lacks.
- [ ] 4.4 Owner acceptance (incl. D3 wording question) → archive, commit
      together.
