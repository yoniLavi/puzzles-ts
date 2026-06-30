# Tasks: Candidate-elimination hints clean obvious candidates at populate

> Behaviour-shaping (changes the hint plan), not behaviour-preserving. Gate: each game's
> hint suite + `hint-resume.test.ts` stay green (plans replay/refresh); owner playtest.

- [x] 1.0 Add shared `emitObviousCleanStep(steps, grid, pencil, w, regionsOf, text)` to
  `candidate-hint.ts`: strike `obviousCandidateMarks` as one `pencilStrike`, apply to the
  working notes, flag `continuesPrevious` iff it follows the populate fill, return whether a
  step was emitted (caller gates it to fire once). One-shot **in the walk** so it also cleans
  a pre-noted board (a clean inside `ensurePopulated` regresses that case).
- [x] 1.1 **Towers first.** Emit the one-shot clean step (`rowColRegions`) after populate;
  add `CLEAN_OBVIOUS_TEXT`; tier-1 test asserting populate→clean with genuinely-obvious marks.
- [x] 1.2 Towers hint suite + `hint-resume.test.ts` green; dev-server playtest (Playwright):
  auto-hint places the extreme-clue lines, populates, then bulk-clears the obvious 5s in one
  narrated step, then teaches real deductions. Owner acceptance on Towers — pending owner.
- [x] 1.3 **Roll out to Unequal/Keen/Solo.** Replace each game's per-given step-3
  `findRegionDuplicate` opening loop with the one-shot `emitObviousCleanStep` (Unequal/Keen:
  `rowColRegions`; Solo: its `regionsOf`); drop the now-dead `findRegionDuplicate` import and
  Unequal's now-unused `myGroup`. Re-ran each hint suite + `hint-resume.test.ts`; updated the
  Solo strike-split test and Unequal necessity-voice test to exempt the setup clean step.
  Dev-verified Unequal live (clean notes maintained, correct narration, 0 console errors).
- [x] 1.4 Updated `docs/porting/hint-authoring.md` §9.2 (the basic-region opening is now the
  bulk `emitObviousCleanStep`, run as a one-shot in the walk) + the §9/§9.5 cross-refs.
- [ ] 1.5 Full gate green → owner acceptance → commit + archive.
