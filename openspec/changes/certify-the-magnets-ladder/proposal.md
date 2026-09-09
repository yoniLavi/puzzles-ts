# certify-the-magnets-ladder

**Readiness: ready.** The absence is verifiable by looking (`ls
src/games/magnets/`), the harness exists, and seven games already declare
against it. There is no design decision left.

Found by `characterize-the-hint-assessment-corpus` (2026-09-09) while
characterizing the corpus.

## The finding

**Magnets runs on `runDeductionFixpoint` and has no ladder-equivalence test.**
It declares **ten rungs across two separate runner call sites** — `force`,
`neither` at the first; `force`, `neither`, `checkfull`, `oddlength`,
`advancedfull`, `nonneutral`, `count-dominoes-neutral`,
`count-dominoes-nonneutral` at the second — and **nothing certifies that its
corpus ever reaches any of them but the first.**

It is not an oversight in `adopt-the-deduction-runner-where-it-rewires`: Magnets
was already on the runner before that change, so it was never in that change's
population and never met its bar. `engine/testing/ladder-equivalence.ts` was
built by that change, and the seven games it covers are the seven it adopted.

## Why this is not hygiene

The harness's own header states the case, and it was learned on Tracks:

> **deleting one of its eight rungs entirely, from either version, left all 39
> of its tests green** — not because the differential is weak (mis-declaring a
> rung's *tier* turns eight of its cases red) but because that rung fires on no
> board the generator produces. A corpus certifies only the rungs it fires, and
> nothing in a fixture file tells you which those are.

Magnets has a frozen byte-match differential. By the paragraph above, that
differential says nothing about which of its ten rungs are live. This is
`AGENTS.md` § "Method" exactly — *a guard must measure the thing it claims to
guard* — and the specific shape it names: a check that passes, so nobody looks.

**And Magnets is a hint assessment corpus member** (hintless, on the runner), so
a future hint author would be narrating rungs nobody has established fire.

## What this change is

1. Add `src/games/magnets/magnets-ladder.test.ts` declaring against
   `describeLadderEquivalence`, the way the other seven do.
2. That requires the two things the harness needs and Magnets lacks: a
   **firing seam** and a **hand-written oracle loop** (`magnetsSolveLegacy`) to
   compare against. Recovering the pre-adoption loop from git history is the
   cheap route — find the commit that introduced `runDeductionFixpoint` into
   `src/games/magnets/solver.ts`.
3. **Two call sites, so two ladders**, each certified at every cap its tier
   values allow. The harness takes one `rungs` list; whether that means two
   `describeLadderEquivalence` blocks or one is an implementation detail to
   settle while writing it.
4. Any rung the corpus cannot reach goes in `unreached` **with its reason
   argued against `magnets.c`**, not asserted. Both existing entries (Tracks'
   `check-single`, Rome's `naked-pairs`) were checked line-for-line against the
   C first, because an unreachable deduction is exactly the shape a porting bug
   takes.

## Coordinate with the seam change

`return-the-firing-tally-from-the-runner` deletes the seven `onFiring` seams by
returning the tally from `runDeductionFixpoint` itself. **Do that one first if
both are live** — otherwise this change adds an eighth seam only for it to be
deleted, and the harness's `viaRunner` signature moves underneath it.

## Prove the guard fails before trusting it

`AGENTS.md`: *break the thing deliberately, watch it go red, restore.* Delete one
Magnets rung and confirm the new test goes red where the existing 30-odd Magnets
tests stay green. **If it does not go red, the test is measuring the wrong
thing** and the whole point of the change is unmet.

## Impact

- Affected specs: none — this certifies existing behavior and changes none of it.
- Affected code: `src/games/magnets/magnets-ladder.test.ts` (new),
  `src/games/magnets/solver.ts` (a firing seam and an exported legacy loop).
- **Behavior must not change.** The frozen differential is the proof, and the
  new test is the thing the differential could never be.
- Self-archivable: no player-visible surface, no owner decision.
