# certify-the-magnets-ladder — tasks

Scaffolded by `characterize-the-hint-assessment-corpus` (2026-09-09). Not
started.

## 0. Order

- [x] 0.1 **Settled** — `return-the-firing-tally-from-the-runner` shipped on
      2026-09-09, so there is no seam to write and no ordering hazard left. The
      runner owns the counting; Magnets forwards a `firings?: FiringTally` in one
      line per runner call, and `ladder-equivalence.ts`'s `viaRunner` takes the
      tally directly.

## 1. Recover the oracle

- [ ] 1.1 The pre-adoption loop is in git: Magnets was wired to
      `runDeductionFixpoint` on **2026-08-01** by `adopt-shared-deduction-fixpoint`
      (`74037570`, *"audit the shared deduction runner, adopt Magnets, fix its
      claim"*). Take the hand-written loop from that commit's parent and export
      it as `magnetsSolveLegacy`, the way the other seven do. **Note the
      2026-08-02 tree-wide move** (`retire src/native/`): the file was
      `src/native/games/magnets/solver.ts` at that commit, and a `git log`
      restricted to today's path is blind across the rename.
- [ ] 1.2 Read that commit's message for the *"fix its claim"* half — whatever
      was corrected there is context the oracle must not re-break.

## 2. Declare the ladder

- [ ] 2.1 Add a `firings?: FiringTally` parameter to the solver entry point and
      forward it to both runner calls.
- [ ] 2.2 Write `src/games/magnets/magnets-ladder.test.ts`. **Two runner call
      sites, so two ladders**: `force`/`neither` at the first;
      `force`, `neither`, `checkfull`, `oddlength`, `advancedfull`,
      `nonneutral`, `count-dominoes-neutral`, `count-dominoes-nonneutral` at the
      second. Whether that is one `describeLadderEquivalence` block or two is an
      implementation call.
- [ ] 2.3 Walk **every cap** — the cap is what selects rungs, and a
      mis-declared `tier` shows only there.
- [ ] 2.4 The `key` must cover **every bit of board state the rungs write**, not
      the return value. Tracks' entry documents why: a ladder that reaches the
      same answer by different deductions passes any desc comparison.
- [ ] 2.5 Cover both **strip and non-strip** modes and the neutral/non-neutral
      split — the rung names say the ladder branches on them, and a corpus that
      exercises one half certifies one half.

## 3. The unreached ledger

- [ ] 3.1 Any rung the corpus never fires goes in `unreached` with a reason
      **argued against `magnets.c`**, not asserted. An unreachable deduction is
      exactly the shape a porting bug takes; both existing entries were checked
      line-for-line against the C before being written down.
- [ ] 3.2 **Empty is the goal.** An entry is a live shortfall, not a pass.

## 4. Prove the guard fails

- [ ] 4.1 Delete one Magnets rung. The new test must go **red** while the
      existing Magnets tests stay green. If it does not, the test measures the
      wrong thing and the change is unmet. Restore.
- [ ] 4.2 Mis-declare one rung's `tier`. It must also go red — that is the
      failure mode the cap walk exists for.

## 5. Close

- [ ] 5.1 Frozen differential byte-unchanged; no behavior moves.
- [ ] 5.2 Note the new test's runtime. A ladder walk over every cap and both
      modes is not free, and `AGENTS.md` § "A test earns its runtime" applies —
      say what it catches that no cheaper test would (the answer is written in
      `ladder-equivalence.ts`'s header, so cite it rather than re-deriving it).
- [ ] 5.3 Self-archive.
