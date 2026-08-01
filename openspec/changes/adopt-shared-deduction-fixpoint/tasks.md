# adopt-shared-deduction-fixpoint — tasks

Depends on `establish-refactor-baseline` and `unify-border-grid-games`.

## 1. Establish the real candidate list

- [ ] 1.1 Read `engine/deduction-fixpoint.ts` and its four existing call sites
      (`engine/latin.ts`, `filling`, `undead`, `pattern`) to fix the target shape
      in mind before judging anything against it.
- [ ] 1.2 Go through all 46 `solver.ts` files. For each, record: is it a
      **deduction ladder** (ordered techniques, restart on firing, difficulty
      cap) or a **search** (backtracking, BFS, planning)? The grep heuristic that
      produced "~29 candidates" wrongly includes movement games — flood, fifteen,
      inertia, net, signpost, slide — whose solvers are searches. **Do not carry
      that number forward unverified.**
- [ ] 1.3 For each genuine ladder, record whether it matches the runner's
      outcome convention (`-1` impossible / `0` nothing / `>0` fired) or
      translates cleanly to it.
- [ ] 1.4 Publish the resulting table in the change directory as `audit.md`:
      game, verdict (adopt / no-go), reason. The no-go reasons are the durable
      artefact — Loopy already cost two wrong handoffs for want of one.

## 2. Establish the conversion pattern

- [ ] 2.1 Pick the simplest genuine ladder from §1 and convert it first, where a
      failure is cheap to diagnose.
- [ ] 2.2 Add the cap-monotonicity property test (design D5): for every
      difficulty cap `d`, a board solvable at `d` is solvable at every cap above
      `d`.
- [ ] 2.3 Run that game's differential. **Fixture unmodified.** If it moves,
      stop: diagnose whether the adoption or the hand-rolled loop was wrong,
      before converting anything else.
- [ ] 2.4 Write the conversion pattern into
      `docs/porting/game-port-playbook.md` once it has survived one real game.

## 3. Convert, one game at a time

- [ ] 3.1 For each game on the adopt list: move its loop to the shared runner,
      leave its techniques untouched, add the cap-monotonicity property test, run
      its differential and its hint tests.
- [ ] 3.2 **Run the differential before moving to the next game.** A batch
      conversion with one test run at the end cannot attribute a failure.
- [ ] 3.3 Verify the game's file got shorter *and* no technique acquired a
      parameter it only has because another game needed one (design D1).
- [ ] 3.4 For any game with an explained `hint()`, re-run its hint tests: the
      runner's restart-on-first-firing rule is what keeps one deduction firing
      equal to one hint journey, and a conversion that breaks the grouping breaks
      the hint quality bar.

## 4. Report what the conversions found

- [ ] 4.1 Record every cap-monotonicity failure found. This is the Boats defect
      class and each instance is a shipped bug.
- [ ] 4.2 Fix each one. Each fix is a deliberate behaviour change: state it, and
      re-found the affected differential explicitly rather than re-recording it.
- [ ] 4.3 If zero are found, report that too — "28 solvers checked, all monotone
      in the difficulty cap" is a real result.

## 5. No-gos

- [ ] 5.1 Record each no-go in `audit.md` with its reason.
- [ ] 5.2 Correct `engine/deduction-fixpoint.ts`'s header if the audit
      contradicts its claim to be "the one ordered-rung loop every logic game's
      solver/hint hand-rolled" — a module that documents itself as universal and
      fits six games is misleading the next reader.
- [ ] 5.3 Update the header's call-site list, which is already stale relative to
      whatever this change lands.

## 6. Close out

- [ ] 6.1 Re-run `npm run metrics`. Report the complexity distribution against
      baseline (814 functions over 15; median 30, p90 83, p95 108).
- [ ] 6.2 **Lower the complexity ratchet** to whatever was earned — and only that.
- [ ] 6.3 Full gate green; all differentials green.
- [ ] 6.4 Owner acceptance: play a sample of the converted games, including at
      least one with an explained hint, before archiving.
