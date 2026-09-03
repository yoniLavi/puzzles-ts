# declare-deduction-techniques — tasks

## 1. The runner

- [x] 1.1 `DeductionRung = () => number` → `DeductionTechnique = { id, tier, run }`;
      `rungs` → `techniques`, `maxRung` → `maxTier`, `beforeRung` →
      `beforeTechnique` (taking the declaration, not an index).
- [x] 1.2 Grade by `tier`; cap by `tier` (skip, don't truncate — see design D1).
- [x] 1.3 Budget-path firing attribution: count per `id` only when a budget is
      passed; on `StepBudgetExceeded`, rethrow with the counts appended. Wrapped
      around `tick()` alone, not the ladder — see Findings 1.
- [x] 1.4 Rewrite the module header — the no-go list re-derived against the new
      contract (design D4), not repointed.

## 2. Convert the five existing call sites (no behavior change)

- [x] 2.1 `engine/latin.ts` — `tier: i`, `id: latin-level-${i}`, `maxTier: maxdiff`.
- [x] 2.2 `games/filling/solver.ts` — four techniques, all `tier: 0`, named.
- [x] 2.3 `games/magnets/solver.ts` — both ladders; `maxTier: diff` replaces the
      computed `diff < DIFF_TRICKY ? 3 : 7`.
- [x] 2.4 `games/pattern/solver.ts` and `games/undead/solver.ts` — hint ladders.
- [x] 2.5 Each converted game's own suite green, and its frozen differential
      **byte-unchanged**: the eleven Latin games + `latin*.test.ts` (39 files,
      842 tests) and magnets/filling/pattern/undead (16 files, 195 tests).

## 3. Adopt Unruly — the no-go this change dissolves

- [x] 3.1 `solveGame` onto the runner: `bump()` → tier grading, the two
      mid-ladder `break`s → `maxTier: diff`, `maxdiff = -1` → `baseGrade: -1`.
- [x] 3.2 The `view.unique` guard stays inside its technique's `run` (design D2).
- [x] 3.3 Unruly's byte-match differential green and **unchanged** — all 8
      fixtures across all three difficulties and both `unique` modes; hint,
      render and unit suites green.

## 4. Guards

- [x] 4.1 `deduction-fixpoint.test.ts`: two techniques sharing a tier grade
      alike; a cap excludes by tier not position (non-monotone ladder); the
      budget error names the runaway technique and orders it first; no counting
      without a budget; a non-budget error passes through unchanged.
- [x] 4.2 **Each new guard proved to fail.** Regrading by index reddens
      "grades two techniques sharing one tier alike" (4 ms); capping by index
      reddens "keeps a cheap technique that sits after an expensive one under a
      low cap" (7 ms). Both restored and re-run green. The second test's
      `hard` technique was made *bounded* after the first attempt: against the
      index-capping mutant it originally spun for 5.3 s before failing, and a
      guard that hangs is not a guard.
- [x] 4.3 Probe corpus: two anchors re-anchored on the lines that genuinely
      changed, one case **added** for the new defect class ("the grade is the
      technique's position, not its declared tier"). `--verify` clean at 176
      cases / 18 modules; `feedback-probe deduction-fixpoint` scores 8/8 caught
      locally.
- [x] 4.4 **`scripts/feedback-probe.mjs` rejects an unknown flag.** Found the
      hard way — see Findings 2.

## 5. Docs and close-out

- [x] 5.1 `docs/games/solver-and-generator.md` § "The deduction fixpoint" and
      § "Where the fixpoint does not fit" — the technique contract, the tier
      rules, the re-derived no-go table (now with the hook each survivor would
      need), and a **Tell** for distinguishing a dissolved no-go from a
      dissolvable-looking one.
- [x] 5.2 `docs/games/engine-catalog.md` § `deduction-fixpoint.ts` and
      § `step-budget.ts`.
- [x] 5.3 `docs/framework-rdd/deduction.md` — `id` and `tier` marked SHIPPED
      with a pointer to the live guide; Unruly removed from the fiction's own
      no-go list, with the general lesson stated. The `find`/`apply`/`narrate`
      split is explicitly still fiction.
- [x] 5.4 Full gate green (279 test files, 7829 passed, production build clean);
      commit.
- [ ] 5.5 Browser check of Unruly, then archive.

## Findings

1. **A diagnostic that re-indents the loop is pushing against the grain.** The
   first cut wrapped the whole fixpoint in `try`/`catch` to attribute a budget
   trip. It worked — and it moved five probe anchors that had nothing to do with
   the change, because every line of the loop gained two spaces. AGENTS.md names
   exactly that as a signal ("it duplicates source lines the probe corpus anchors
   on, forcing unrelated re-anchoring"), and taking the signal seriously produced
   a *better* design rather than a compromise: wrap `budget.tick()` alone, which
   is the only thing that throws. The loop's shape is untouched, so only the two
   genuinely-changed anchors moved — and the narrower catch is also more correct,
   since a `StepBudgetExceeded` raised by a game's own nested sub-solve now
   passes through unattributed instead of being blamed on this ladder.

2. **`node scripts/feedback-probe.mjs --help` ran the whole corpus.** The parser
   recognized `--verify` and dropped every other `--`-prefixed argument, so an
   unknown flag left the module filter empty — which means *all modules* — and
   started the 30-45 minute planting run. It got killed mid-flight and left a
   real planted defect (`Dsf.size` returning `classSize[i]`) sitting in the
   working tree. The gate caught it exactly as the module header promises it
   would, via the anchor check rather than a test failure. Fixed here: `--help`
   prints usage, and any other unrecognized flag exits 2. The module header
   records it beside the import-time footgun it rhymes with — *an option parser
   that answers an unknown question by editing `src/` is the same footgun,
   wearing a flag.*

3. **The change's reach is one no-go out of six, and saying so is the point.**
   Unruly is the only entry the tier semantics dissolve; Loopy, Singles, Spokes,
   Clusters and Lightup each still need a *new runner hook*, and the no-go table
   now names which one, so the next reader can tell "not yet adopted" from "will
   never fit" without re-reading five solvers. Overclaiming this module's scope
   is the recorded defect that table exists to prevent recurring, and a change
   that dissolves one entry is not license to imply it dissolved the class.

4. **Two of the five converted ladders have no tiers at all** (Filling, Pattern,
   Undead's hint recorder), so `tier: 0` repeats and the grade is discarded.
   That is not noise to design away: the ladder is an *order* there, not a
   grading, and writing the tier out makes a reader ask which it is instead of
   assuming. A defaulted tier would have hidden the question.
