# declare-deduction-techniques — design

## D1. Why tier-capping is byte-equivalent to index-capping here

`maxRung` selects the array **prefix** `0..maxRung`. `maxTier` selects the
**subset** `{ t : t.tier <= maxTier }`. These are the same set exactly when the
ladder's tiers are non-decreasing and the cap falls on a tier boundary. Checked
per call site rather than assumed:

| Call site | Tiers along the ladder | Cap today | Cap after | Same set? |
| --- | --- | --- | --- | --- |
| `latinSolverTop` | `0,1,2,…,maxdiff` (tier *is* the difficulty level) | `maxRung: maxdiff` | `maxTier: maxdiff` | identical — the ladder is built `for i <= maxdiff` |
| `FillingSolver.run` | `0,0,0,0` (untiered game) | none | none | vacuously |
| `MagnetsSolver.solve` | `E,E,E,E,T,T,T,T` (`DIFF_EASY=0`, `DIFF_TRICKY=1`) | `maxRung: diff < DIFF_TRICKY ? 3 : 7` | `maxTier: diff` | yes — index 3 is the last `EASY` |
| `MagnetsSolver.solveUnnumbered` | `0,0` | none | none | vacuously |
| `deduceHintPlan` (pattern) | `0,0` | none | none | vacuously |
| `recordUndeadDeductions` | `0,0` | none | none | vacuously |
| **Unruly (adopting)** | `Tr,Tr,E,E,N` (`0,0,1,1,2`) | `if (diff < X) break` mid-ladder | `maxTier: diff` | yes — see D2 |

Magnets' cap is the only one that was a *computed* index, and it is exactly the
translation `diff < DIFF_TRICKY ? 3 : 7` → `diff`, which is what makes the new
form strictly more readable: the cap is now the difficulty the caller was handed,
not an index a reader has to re-derive by counting the ladder.

**Non-monotone tiers are permitted and are strictly better under the new rule.**
A `tier: 0` technique sitting *after* a `tier: 2` one (Loopy's `loopDeductions`
is exactly this) is skipped by index-capping and kept by tier-capping — and
keeping it is the correct reading of "this technique belongs to Easy". No
current call site has this shape, so nothing moves; the rule is stated so a
future ladder is not silently truncated.

## D2. Unruly's `break` is a cap, and its `bump` is the grade

Today:

```
while (true) {
  budget?.tick();
  if (checkAllThrees(…))      { bump(DIFF_TRIVIAL); continue; }
  if (checkAllSingleGap(…))   { bump(DIFF_TRIVIAL); continue; }
  if (diff < DIFF_EASY) break;
  if (checkAllCompleteNums(…)){ bump(DIFF_EASY);    continue; }
  if (view.unique && checkAllUniques(…)) { bump(DIFF_EASY); continue; }
  if (diff < DIFF_NORMAL) break;
  if (checkAllNearComplete(…)){ bump(DIFF_NORMAL);  continue; }
  break;
}
return maxdiff;   // starts at -1
```

Every clause maps with nothing left over: `continue` is the runner's
restart-on-first-firing, `bump(d)` is `grade = max(grade, tier)`, the two
`break`s are `maxTier: diff`, `maxdiff = -1` is `baseGrade: -1`, and
`budget?.tick()` is the runner's own tick. Unruly signals no contradiction, so
every `run` returns `1 | 0` and `impossible` is never set — asserted, not
assumed, by keeping Unruly's return contract (`-1` never produced) unchanged.

**The `view.unique` guard stays inside the technique's `run`**, as
`() => (view.unique && checkAllUniques(…)) ? 1 : 0`. It is a rule of the game
(the "no two identical rows" variant), not a rung ordering question, and the
runner must not grow a `when?` predicate for it — that is the configuration
language Finding 2 warns about.

**A trap the translation must not fall into.** The two `break`s are *not*
equivalent to truncating the array before the loop, because Unruly's `diff` can
exceed every tier (`deduceHintPlan` passes `Number.MAX_SAFE_INTEGER`).
`maxTier: diff` handles both ends without a clamp; an index computed from `diff`
would need one.

## D3. Why `id` is required, and what consumes it today

An unconsumed field is a promise nobody reads (AGENTS.md, "Nothing is sacred" —
*complexity spent preserving a promise nothing consumes*). `id` has a consumer
in this change, and it is the diagnostic `step-budget.ts` already gestures at:

> `"…did not terminate within 1000000 steps (a hint rule is reporting progress
> without changing the board?)"`

The runner can now answer that question. On the **recording path only** it keeps
a per-id firing count, and when `tick()` throws `StepBudgetExceeded` it rethrows
with the counts appended, most-fired first — the runaway technique is the one
with ~the whole budget against its name. The counting is guarded on `budget`
being present, so the generator path allocates nothing and stays byte-for-byte
unchanged, which is the property every frozen differential depends on.

Beyond the diagnostic, `id` is what makes a ladder readable at a glance and
greppable across games — the framework vision's stated reason for it
(`docs/framework-rdd/deduction.md`, "stable, greppable") and the AI-native
principle that agents navigate by grep. `latinSolverTop`'s dynamically-built
rungs get `latin-level-${i}`, which is honest: rung *i* there genuinely is
"whatever techniques difficulty level *i* unlocks".

## D4. Re-auditing the no-go table against the new contract

The table must be re-derived, not repointed (AGENTS.md, "Don't repoint a dead
recipe — retire it"): its entries were reasons a game did not fit an
*index-grading* runner, and the runner is no longer that. Each remaining entry
was re-read for this change:

| Game | Still a no-go because | Would it need a new hook? |
| --- | --- | --- |
| Loopy | its `(thresholdDiff, thresholdIndex)` pair makes each firing report *the cheapest rung that could use the new information*, and skips rungs below it — a skip protocol, not a cap. Load-bearing for which boards generate. | yes: a per-firing "restart from" return |
| Singles | drains an op queue at the top of each iteration and signals contradiction through `state.impossible`, not a `< 0` return; it also runs four techniques *once*, before the loop | yes: an `impossible?` predicate and a per-iteration pre-pass |
| Spokes | its tier is an accumulated action **count**, so no per-technique `tier` can produce it | yes: a cost accumulator |
| Clusters | its early-out is the three-valued `clustersValidate` verdict, which is also the function's return value | yes: a `settled?` returning the caller's own verdict type |
| Lightup | its rungs are fused into one pass in upstream's scan order, load-bearing for generation — there is no ladder to declare | no hook would help; it is not a ladder |

Unruly is the only entry the tier semantics dissolve, and that is the honest
measure of this change's reach: **one of six**. Stating it that way is
deliberate — the module's self-description overclaiming universality is the
recorded defect this table exists to prevent recurring.

## D5. Verification

- **Every frozen differential stays byte-clean.** Unruly, Magnets and the Latin
  family carry byte-match desc fixtures that run in the ordinary gate (not
  `test:slow`); Filling, Pattern and Undead gate generation on their solvers.
  A moved fixture means the conversion is wrong, and is never fixed by
  re-recording.
- **The new grading rule is proved to fail.** Per AGENTS.md ("Prove a new guard
  fails before trusting it"), the tier-grading and tier-capping tests are run
  against a deliberately broken runner before being trusted: grading by index
  must make the two-techniques-share-a-tier test go red, and capping by index
  must make the non-monotone-ladder test go red.
- **The budget diagnostic is exercised**, including the negative: no counting
  and no message change when no budget is passed.
