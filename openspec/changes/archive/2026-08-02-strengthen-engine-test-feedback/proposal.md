# strengthen-engine-test-feedback

> ## ⚠️ The table below is an artefact. Read [`findings.md`](findings.md) §1.
>
> Everything in this proposal that rests on the **"killed by its own test file"**
> column is wrong, because **Stryker bails the test run on the first failure** —
> so the column names the first covering test to fail, not the tests capable of
> catching the defect. Every one of that report's 1,437 killed mutants has
> exactly one `killedBy` entry, and vitest orders files roughly alphabetically.
>
> Measured properly (`npm run probe`, planting a defect and running only the
> module's own tests): **`grid.ts` catches 6 of 6** — the "3%" module needed
> nothing at all — and the genuinely worst was **`midend.ts`**, which the column
> rated a comfortable mid-table 39%. `latin.ts` was a real gap, but for a reason
> the number did not carry.
>
> The text is kept as written, banner and all, because *the correction is the
> change's main result* and a rewritten premise would hide how far a plausible
> number travelled — into a proposal, a task list and a spec delta — before
> anyone planted a defect and looked.

## Why

**The goal is a fast suite that gives enough confidence to keep refactoring. The
speed half is done; this is the confidence half, and the audit says exactly where
it is thin.**

`right-size-the-test-gate` cut the gate from ~606 s to 285 s of CPU. Then
`audit-test-suite-strength` mutation-tested the seven highest-leverage engine
modules — 2,168 mutants, 398 minutes — and the result was not "the tests are
weak". It was something more specific and more useful:

| module | survivors | **killed by its own test file** |
| --- | --- | --- |
| `latin.ts` | 117 / 944 | **9 / 593 (2%)** |
| `grid.ts` | **0** / 40 | **1 / 40 (3%)** |
| `save.ts` | 30 / 85 → fixed | 8 / 54 (15%) |
| `midend.ts` | 122 / 741 | 208 / 531 (39%) |
| `border-grid.ts` | 51 / 259 | 150 / 168 (89%) |
| `deduction-fixpoint.ts` | **0** / 34 | 19 / 27 (70%) |

**The engine is well protected and badly instrumented.** `grid.ts` has zero
surviving mutants and is killed by its own tests once in forty; `latin.ts` nine
times in 593. A defect in either is caught — by a game's differential, minutes
later, reported as a differing description string. That is fine for a release
gate and poor for a refactor, because the developer changing `latin.ts` runs
`latin.test.ts`, sees green, and is misled. It is the exact workflow the
repository's own test-run economy recommends.

So the confidence gap is not coverage. It is **feedback locality**, and it is
measurable: the "killed by its own test file" column is the metric this change
moves.

## What Changes

- **Raise local kill rates for `latin.ts` and `grid.ts` first** — the two extremes
  — by asserting the rules their doc comments already claim, in their own test
  files. Target the *clusters* the audit found, not individual mutants.
- **Cover the 48 statements no test executes**, 41 of them in `midend.ts`: the
  `catch` arms that build user-facing messages (`Invalid parameters`, `Could not
  read save`), the "this game does not support solving/hints" refusals, and the
  adapter-facing `getColourPalette` / `darkPalette` / `preferredSize` / `delete`.
  These are cheap, and several are strings a player can see.
- **Answer the timeout question**: 346 mutants (16%) timed out, 227 in
  `latin.ts`. Stryker scores a timeout as killed, so the *result* is unaffected —
  but whether they are genuine non-termination or contention artefacts decides
  whether a large share of 398 minutes was wasted, and therefore what a re-run
  should cost. Establish which, once, and record it.
- **Re-measure after**, on the same config, so the claim is a number and not a
  feeling.

## What this is deliberately not

**Not chasing the mutation score.** ~250 of the 331 survivors cluster as
`ConditionalExpression` and `BooleanLiteral` in orchestration and solver
plumbing, which is where behaviour-preserving mutants live. They are triaged by
cluster and mostly left. A test written to kill a mutant rather than to state a
behaviour is a worse test than none.

**Not extending mutation testing to the 57 games.** The audit measured why:
cost per mutant is the size of its covering set, and a game's solver is already
fixture-pinned by a differential. The engine was the right scope and remains it.

**Not slowing the gate back down.** Everything here is tier-1 unit work on
modules that are already fast; the `build-pipeline` requirement that a saving be
quoted in CPU time applies in reverse too — report what this costs.

## Impact

- Affected specs: `repo-layout` (the testing tiers gain feedback locality as a
  stated property, not just coverage).
- Affected code: `latin.test.ts`, `grid.test.ts`, `midend.test.ts`,
  `border-grid.test.ts`, `dsf.test.ts`. **No production code** — unless a
  survivor turns out to be a real defect, which is the outcome worth hoping for.
- Every test added SHALL be verified to discriminate by breaking the line it
  covers. The failure mode of this change is a file that raises a number without
  raising confidence.
