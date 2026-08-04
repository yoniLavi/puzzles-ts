# add-clusters-difficulty-tiers

## Why

**Clusters already has two difficulty levels. It just never offers either of
them.** Its author's Status says only *"There are currently no difficulty
settings"*, which reads like missing solver work — and the solver has the work
already done:

- `solverTry` (level 0) forces a cell's colour whenever the opposite colour makes
  the board immediately invalid — a single-cell proof by contradiction;
- `solverRecurse` (level 1) does the same one hypothetical level deep, re-running
  the level-0 fixpoint on a scratch copy.

The generator gates on `solveGame(…, 1)` unconditionally. So every board is
"solvable with one level of hypothetical", and a player who would enjoy the
level-0-only boards, or who wants a guarantee that the recursion is *needed*, has
no way to ask. That is a difficulty parameter's whole job.

This was declined by `audit-author-known-issues` partly on "changes every board,
forfeits the differential"; the owner released that constraint on 2026-08-01.
What is left is unusually cheap for a difficulty feature: **no new deduction has
to be invented.**

## Sequencing (owner decision, 2026-08-01)

**Waits for `retire-c-engine`**, and possibly for a round or two of refactoring
after it, so this lands on a TypeScript-only codebase rather than alongside the
C teardown. Nothing here needs the C build: this game's differential imports a
frozen JSON fixture and keeps working with no C present.

Note the one-way consequence of that order — with no C build there is no
re-baselining a fixture against upstream. Where this change diverges, the fixture
is retired or re-founded on properties, not re-recorded. That is the intended
effect of the released oracle, not an accident of the sequencing.


**Do this one first of the three difficulty-tier changes.** It is the only one where no deduction has to be invented, so it establishes the parameter / preset / game-ID / differential pattern that `add-subsets-difficulty-tiers` and `add-sticks-difficulty-tiers` then reuse.

## What Changes

- **Two tiers: Easy (level 0 suffices) and Tricky (level 1 required).** Easy
  gates on `solveGame(…, 0)`; Tricky gates on solving at 1 **and not** at 0, per
  `grade-difficulty-tiers-honestly`. Naming follows the collection's convention,
  not upstream's (it has none here).
- **Params, presets, Custom dialog, game ID.** A difficulty character joins the
  encoded params; existing IDs without one decode to the tier that reproduces
  today's behaviour, so no shared link breaks.
- **Assurance.** Today's differential fixtures were generated with the
  unconditional level-1 gate; they remain valid for that tier's parameters, and
  the new Easy tier is covered by the property that its boards are uniquely
  solvable at level 0. Whether the *Tricky* fixtures survive depends on the
  and-not-at-0 rejection changing the RNG stream — measure, do not assume.
  **Resolved:** they survive in full, by the `spokes` `upstreamLooseGate` shape —
  no fixture re-founded, nothing re-recorded (design D7).

Two things the proposal did not anticipate, both found by implementing it
(details in `design.md`):

- **A rejected Tricky candidate cannot simply be refused.** The retry loop keeps
  the cells the solver proved and re-randomises only the blanks — so it is a
  hill-climb, not independent sampling. A *completed* candidate has no blanks, so
  refusing one would re-derive it unchanged, draw no randomness, and spin for
  ever. It is perturbed by one cell instead, which both breaks the fixed point and
  keeps the climb: measured 4–8× cheaper than restarting (D4).
- **The generation loop had no retry bound at all** — `MAX_ATTEMPTS` was only the
  `force` cadence. One acceptance test that always leaves progress behind cannot
  reject for ever; two can. It now takes a `retryLimit` like the collection's
  other generators (D5).

Explicitly **not** in this change: inventing a third, deeper tier (level 2
recursion). Two levels exist; ship those honestly first and see whether the game
wants more.

## Impact

- Affected specs: `clusters`.
- Affected code: `src/games/clusters/{state,generator,index}.ts`, presets,
  `paramConfig`, differential.
- Every Tricky board changes if the and-not-at-0 gate moves the RNG stream;
  Easy boards are new. Existing game IDs carrying a description still load.
