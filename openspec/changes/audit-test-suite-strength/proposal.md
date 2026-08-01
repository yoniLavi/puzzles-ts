# audit-test-suite-strength

## Why

**Every safety claim this project makes rests on the test suite, and nothing has
ever measured whether the suite would actually catch a regression.**

That is not a rhetorical worry. The whole post-C strategy is *"the 48 per-game
differentials are the net for this"* — they import frozen JSON fixtures, and a
refactor that changes a solver's verdict changes which boards exist. Four
refactoring changes in a row have now been declared no-ops on the strength of
"the fixture did not move". That reasoning is only as good as the fixtures'
*coverage*, and coverage of the deduction paths inside a solver is exactly what a
frozen desc-level fixture does not tell you.

Two findings from the 2026-08-01 round sharpen it:

- **An instrument can pass while measuring nothing.** Adding 19 suppression
  comments moved the reported maximum complexity from 234 to 145 with a
  byte-identical tree. The same failure mode is available to a test suite: a
  snapshot re-baselined with `vitest -u` still passes, and the guarantee is gone.
  The repo already warns about this ("pair every snapshot with a few targeted
  assertions so a careless `-u` can't erase the guarantee") — but nothing checks
  that the pairing is load-bearing.
- **Line coverage would not answer it.** The suite executes the solvers heavily;
  every deduction rung is *run*. The question is whether a rung that returned the
  wrong answer would be *noticed*, which is a different question and the one
  mutation testing asks.

**This is the one genuinely new tool worth adding**, and the reason is that it
answers a question no existing tool here does. The static analysers were all
evaluated in `establish-refactor-baseline` and mostly rejected on measurement;
this is not another of those.

## What Changes

- **Run Stryker over `src/native/engine/` as a one-off audit**, not a gate. The
  engine is the right scope: ~30 modules that all 57 games depend on, where a
  silently-untested branch has the widest blast radius, and small enough to be
  affordable.
- **Start with the highest-leverage modules** — `midend.ts`, `save.ts`,
  `latin.ts`, `deduction-fixpoint.ts`, `border-grid.ts`, `dsf.ts`, `grid.ts` —
  and widen only if the first pass is informative.
- **Act on survivors, not on the score.** A surviving mutant is a specific
  statement: *"this line could be wrong and every one of 6,478 tests would still
  pass."* Each one is triaged into a missing assertion, a genuinely unreachable
  branch, or an equivalent mutant. The percentage is not a target and gets no
  ratchet.
- **Report the shape of what survives**, which is the transferable result: if
  survivors cluster in the code the differentials are supposed to protect, the
  fixture net is thinner than the project believes and that changes how the next
  refactor is justified.

## What this is deliberately not

**Not a CI gate and not a ratchet.** Mutation testing is expensive — every mutant
re-runs the tests that cover it — and the `build-pipeline` spec is explicit that
the gate's wall-clock is defended. It belongs with the type-aware lint: a
periodic audit run from the metrics harness, acted on, not gated.

**Not a coverage-percentage exercise.** A mutation score is a number that invites
being maximised, and maximising it means writing tests against mutants rather
than against behaviour. The deliverable is a triaged survivor list.

**Not extended to the 57 games in this change.** Mutating 57 solvers would take
far longer and mostly re-discover that generation is fixture-pinned. If the engine
pass is informative, a follow-up can pick specific games.

## The recommendation this change embodies

The owner asked whether another big refactoring pass — possibly with new tooling
— would pay. **On the evidence, a broad tooling-driven pass would not, and this is
the targeted alternative.** After the 2026-08-01 round: duplication is 1.89% and
what remains is largely the deliberate similar-shape/different-content class;
knip is clean; runtime cycles are zero; `any` is effectively absent. The one
metric still poor — 811 functions over cognitive complexity 15 — was examined and
is mostly irreducible solver logic, and `adopt-shared-deduction-fixpoint` D2
concluded that refactoring a function *because its score is high* produces an
unreviewable diff in exchange for a metric.

So the remaining work splits three ways, and only one of them is new tooling:

1. `add-game-difficulty-contract` — enables a cross-game correctness guard.
2. `adopt-declarative-config-helpers` — the last cheap, provable-no-op duplication.
3. **this change** — the one question nothing currently answers.

Everything beyond that is product work the owner already has queued
(`grade-difficulty-tiers-honestly` and the tier changes), and it will do more for
the collection than another sweep of the same code.

## Impact

- Affected specs: `repo-layout` (the testing-tiers requirement gains a periodic
  strength audit).
- Affected code: one dev dependency and a scoped config; **no source change**
  except the tests that survivors turn out to justify.
- Cost: the audit is measured in hours of machine time, not developer time, and
  runs detached. Bound it explicitly and report what was and was not covered — a
  partial run reported as complete is the "no silent caps" failure.
