# return-the-firing-tally-from-the-runner

**Readiness: ready.** Seven identical instances exist in the tree, the
replacement already exists inside the runner, and there is no design decision
left in it.

Found by `adopt-the-deduction-runner-where-it-rewires` (2026-09-09), which
created the duplication and declined to fix it there for a stated reason: that
change's own first rule was that the runner's contract does not move.

## The finding

**Seven solvers now carry an optional `onFiring` callback that exists only for a
test.** Tracks, Seismic, Subsets, Rome, Ascent, Galaxies and Bridges each grew
the same seam and the same six-line wrapper:

```ts
techniques: onFiring
  ? ladder.map((t) => ({ ...t, run: () => { const did = t.run(); if (did > 0) onFiring(t.id); return did; } }))
  : ladder,
```

It is there because `ladder-equivalence.ts` has to prove its corpus reaches every
rung — an equivalence test that only ever exercised the easiest rung would
certify one rung and look like it certified eight. That is a good reason for the
census; it is not a good reason for seven copies of a wrapper in production
files.

**And the runner already counts exactly this.** `runDeductionFixpoint` keeps a
`firings` map for the step budget's non-termination attribution — *"a runaway
technique holds ~the whole budget against its name"* — but allocates it only when
a budget is present, and never returns it.

## What this change is

Return the tally from `runDeductionFixpoint` and delete all seven seams.

The one real decision is **whether to count always or only on request**, and the
existing code answers it: the runner deliberately allocates nothing on the
generator path (*"the generator path allocates nothing and runs the loop it
always ran"*). Keep that. The shape that respects it is an opt-in — a
`countFirings` flag, or a caller-supplied sink — resolved in `design.md` at
implementation, not here.

## Why it was not done in the adoption

Recorded because the restraint was deliberate rather than an oversight: the
adoption's rule 1 was *no new option on the runner*, precisely so that "does this
game fit?" could not be answered by widening the contract. A test-observability
improvement is not that — but bundling it would have made every one of the seven
adoptions harder to argue, since each would then have moved the runner too.

**One instance is a seam; seven is a duplication.** That is the threshold this
repo's own refactoring directive names, and it is now met.

## Impact

- Affected specs: none — the returned value is additive, and no existing caller
  reads it.
- Affected code: `src/engine/deduction-fixpoint.ts`,
  `src/engine/testing/ladder-equivalence.ts`, and the seven adopters' solvers
  plus their ladder tests.
- **Behavior must not change**: the seven ladder-equivalence tests and every
  frozen differential are the proof, and they already exist.
