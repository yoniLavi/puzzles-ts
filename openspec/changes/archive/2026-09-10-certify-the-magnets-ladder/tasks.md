# certify-the-magnets-ladder — tasks

Scaffolded by `characterize-the-hint-assessment-corpus` (2026-09-09).
Implemented 2026-09-10; the two findings are in `design.md`.

## 0. Order

- [x] 0.1 **Settled** — `return-the-firing-tally-from-the-runner` shipped on
      2026-09-09, so there is no seam to write and no ordering hazard left.

## 1. Recover the oracle

- [x] 1.1 Both loops taken verbatim from `74037570`'s parent
      (`src/native/games/magnets/solver.ts` at that commit) and kept as
      `MagnetsSolver.solveLegacy` / `solveUnnumberedLegacy` — methods rather
      than free functions, because every rung is a private method of the class.
- [x] 1.2 Read the commit: the "claim" it fixed was `deduction-fixpoint.ts`'s
      own header overclaiming its scope, not anything in Magnets. Nothing there
      for the oracle to re-break.

## 2. Declare the ladder

- [x] 2.1 `firings?: FiringTally` on `solve` and `solveUnnumbered`, forwarded to
      each runner call.
- [x] 2.2 `src/games/magnets/magnets-ladder.test.ts`: **two blocks**, one per
      call site. The unnumbered corpus is built the way the generator builds
      its boards — no counts, a seeded prefix of the solution laid through
      `set`, then the solve.
- [x] 2.3 Both caps walked on the clued ladder (the unnumbered one has none).
- [x] 2.4 `key` is the scratch grid plus the whole flag word per cell.
- [x] 2.5 Both strip modes, both tiers, all three preset sizes.

## 3. The unreached ledger

- [x] 3.1 One entry, `neither`, in both ladders — argued against `magnets.c`
      (`design.md` D1): structurally subsumed by `force` through `unflag`'s
      mirrored write, in the C exactly as in the port.
- [x] 3.2 Not empty, and not a corpus shortfall either: no corpus can reach a
      rung the primitive beneath it forecloses. The entry says so.

## 4. Prove the guard fails

- [x] 4.1 Deleted `oddlength`: red.
- [x] 4.2 Mis-tiered each of the four Tricky rungs in turn: **the first plant
      stayed green on the original 15-board corpus** while the differential
      caught it on one fixture (`design.md` D2). Widened to 40 boards; all four
      plants now red (`advancedfull` on 8 boards, `nonneutral` on 40,
      `count-dominoes-neutral` and `-nonneutral` on 12 each). Restored; the
      diff to the ladder is additions only.

## 5. Close

- [x] 5.1 Frozen differential byte-unchanged; the whole Magnets suite (281
      tests) passes.
- [x] 5.2 Runtime: **~0.35 s** for the file at 40 clued boards × 2 caps + 120
      unnumbered boards (idle machine, 2026-09-10). What it catches that
      nothing cheaper does is stated in `ladder-equivalence.ts`'s header, and
      D2 is a measured instance: a mis-tiered rung the byte-match saw on one
      fixture in twenty.
- [x] 5.3 Self-archived.
