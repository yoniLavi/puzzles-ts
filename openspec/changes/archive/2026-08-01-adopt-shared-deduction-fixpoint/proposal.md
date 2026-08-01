# adopt-shared-deduction-fixpoint

## Why

**The abstraction already exists, is documented as universal, and almost nobody
uses it.** `src/native/engine/deduction-fixpoint.ts` opens by describing itself
as *"the shared deduction-fixpoint runner: the one ordered-rung loop every logic
game's solver/hint hand-rolled before this"*. Its call sites, as its own header
lists them, are `engine/latin.ts`, `games/filling/solver.ts`,
`games/undead/solver.ts` and `games/pattern/solver.ts` — three games directly,
plus the eleven latin-family games that reach it through `latin.ts`.

The collection has **46 solvers**. A scan on 2026-08-01 found roughly **29 logic
games still hand-rolling an ordered-rung restart-on-firing loop** with no import
of the shared runner. (That figure is a grep heuristic and includes some games
whose "solver" is a search, not a deduction ladder — establishing the real number
is the first task of this change, not an assumption of it.)

**This is where cognitive complexity actually comes from, and where reducing it
has a reason rather than a metric.** The baseline measurement found **814
functions over complexity 15, median 30, p90 83, p95 108** — concentrated in
exactly these files: `subsets/solver.ts` (14 functions over threshold),
`singles/solver.ts` (12), `boats/solver.ts` and `boats/hint-solver.ts` (11 each),
`loopy/solver.ts` (10), `undead/solver.ts` (10), `spokes/solver.ts` (9),
`tracks/solver.ts` (9).

Much of that is irreducible: a nonogram overlap deduction is genuinely intricate,
and the generic cleanup plan reviewed on 2026-08-01 is right that "the residue is
genuine algorithmic complexity... that's the part that deserves human judgement,
not another metric". **But the loop wrapped around the techniques is not
algorithmic complexity — it is the same loop, 29 times.** It carries the
difficulty cap, the restart-from-the-top-on-first-firing rule that keeps one
firing equal to one hint group, the recorder-gated step budget that makes a
non-progressing rung fail loud instead of hanging, and the grade bookkeeping.
Every one of those is a place a hand-rolled copy can be subtly wrong.

**And at least one hand-rolled copy has already been wrong in a way that
shipped.** The Boats port found that *a solver may not be monotone in its
difficulty cap* — capping the ladder lower made it solve boards the uncapped run
could not — which silently broke Check & Save on Easy boards. That is precisely
the bookkeeping the shared runner centralises. The question this change asks of
the other 28 candidates is whether any of them has the same defect and nobody has
looked.

## What Changes

- **Audit every logic-game solver** against the shared runner: does its loop have
  the same shape (ordered rungs, restart on first firing, difficulty cap,
  `-1 / 0 / >0` outcome convention)?
- **Adopt the shared runner wherever the shape matches**, keeping the techniques
  themselves entirely per-game — the module's own header is explicit that *"the
  techniques stay per-game; only this loop, the difficulty cap, the
  recorder-gated budget, and the grade bookkeeping live here."*
- **Record every no-go with its reason**, following the `unify-hint-framework`
  precedent. Loopy is the known one: `add-loopy-ts-port` established that it
  "does **not** fit the shared `runDeductionFixpoint`, contrary to two handoffs —
  its `(thresholdDiff, thresholdIndex)` bookkeeping decides which puzzles exist."
  A second wrong handoff on this point is exactly what a written no-go prevents.
- **Check each adopted solver for the Boats non-monotonicity defect** as it is
  converted, since the conversion puts a human in the difficulty-cap logic
  anyway. This is the change's best chance to find that class of bug.
- **Lower the complexity ratchet** by whatever the adoption earns, per the
  `establish-refactor-baseline` discipline that a threshold moves only when a
  change does the work.

Explicitly **not** in this change: unifying any *technique*, changing any
difficulty tier's meaning, or reducing complexity in functions that are complex
because the deduction is. Those are separate questions and two of them already
have their own changes (`grade-difficulty-tiers-honestly`, and the three
`add-*-difficulty-tiers` proposals).

## Impact

- Affected specs: `ts-migration` (the narratable-deduction requirement gains the
  expectation that the shared runner is adopted or its rejection recorded).
- Affected code: up to ~29 `solver.ts` files, each losing its loop and keeping
  its techniques.
- **Behaviour must not change.** Every affected game has a frozen differential;
  a solver that reaches the same verdicts generates the same boards. Any
  differential that moves means either the adoption is wrong **or** the
  hand-rolled loop was — and distinguishing those two is required before the
  change proceeds, never resolved by re-recording the fixture.
- **Except where the Boats defect is found**, in which case the fix is a
  deliberate behaviour change, stated as one, with its differential re-founded
  explicitly.
- Risk is materially higher than `unify-border-grid-games`, because this touches
  generation. It is sequenced after it for that reason, and proceeds one game at
  a time.
