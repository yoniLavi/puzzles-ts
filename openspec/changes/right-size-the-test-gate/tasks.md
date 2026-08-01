# right-size-the-test-gate — tasks

## 1. Measure first

- [x] 1.1 Per-file and per-test timings via `vitest --reporter=json`, to find
      *where* the cost is: **1,178 s of summed test duration across 250 files**;
      five files 66%; ~10 individual tests ~54%. That located the targets, which
      is all a relative measure needs to do.
- [x] 1.2 **Re-measured the saving in CPU time, and the first number was wrong.**
      Summed per-test `duration` is *wall clock per test*, so on a box running
      other work the heaviest tests inflate most and cutting them flatters the
      result. `/usr/bin/time` on the whole run (`user + sys`, which includes
      reaped children, so the worker pool is counted) is contention-robust.
      Measured on the six changed files: **372.7 s -> 51.3 s of CPU**, and the
      whole gate-tier suite **~606 s -> 285 s of CPU — a real saving of 53%**,
      not the 68-70% the duration sums suggested. The lesson is the one this
      session met twice already: an instrument's *unit* is part of its
      correctness, and "summed per-test duration" measures how long tests
      appeared to take, not what they cost.
- [x] 1.3 Gate CPU after, for where the next lever is: **vitest 285 s (76%)**,
      vite build 46 s (12%), `tsc -b` 33 s (9%), `biome ci .` 12 s (3%).
      Tests are still three quarters of the gate, but the remaining test cost is
      spread — no single test is over ~7% — so further cutting has real leverage
      but no cheap targets left.

## 2. The opt-in tier

- [x] 2.1 `src/native/engine/testing/slow.ts` — `SLOW_TESTS_ENABLED`,
      `describeSlow`, `itSlow`, and `seedBudget(gate, full)`.
      `describeDescDifferential` gains a `slow` option.
- [x] 2.2 `npm run test:slow` (`PUZZLES_SLOW_TESTS=1 vitest run`). Verified
      end-to-end: the bricks file runs 11 tests in the gate and **12 in the slow
      tier**, so the deferred fixture is genuinely reachable and not skipped for
      ever.

## 3. Apply, one justification per case

- [x] 3.1 **Seismic 7×7 differential → deferred.** 272 s (23% of the whole
      suite). Its four fixtures cover mode 0/1 × difficulty 0/1, **every one of
      which is already asserted** by the 4×4, 5×5 and 6×6 fixtures in the same
      file. What they add is board size over identical code paths.
- [x] 3.2 **Bricks 12×8 Tricky differential → deferred.** 100 s, 87% of its
      file. Difficulty 2 is already carried by the 7×6, 8×5 and 10×8 Tricky
      fixtures.
- [x] 3.3 **Spokes "no useless rule-out" → seed dial 60 → 8.** Was **238 s, 20%
      of the entire suite**. The property is an invariant of the deduction rules,
      so a violation would be systematic. Measured rather than assumed: the gate's
      8 seeds still execute **375 independent rule-out assertions** (60 seeds
      execute 2,998).
- [x] 3.4 **Boats narration searches → pinned start, no dial at all.** The scan
      is ordered and deterministic, so its first hit for a technique is a fixed
      (preset, seed) pair; recording it returns the *identical* firing without
      grinding through every earlier preset. `refuted` and `sharedDiagonal` both
      live at preset 8, behind four full presets of generation and plan-walking.
      **63 s → 6.4 s with zero loss**, and a stale pin falls back to the scan.
- [x] 3.5 **Netslide convergence → 4 seeds → 2, for the 5×5 wrapping cases
      only.** The 3×3 boards are cheap and keep all four. Both of Netslide's
      original failures (wandering plans, an outright loop) presented on
      essentially any board.

- [x] 3.6 **Second pass, and where it stops.** Re-measuring showed the top test
      had fallen from 25% of the suite to 7%, so the remaining candidates were
      weighed individually rather than swept:
      - **Pearl `pearl-4` (10×10 Easy) → deferred.** 27 s, 7% of the suite and
        more than the 12×8 fixture beside it. Easy stays asserted every commit by
        the 6×6, 7×7 and 8×8 fixtures plus the 6×6 `nosolve` variant — the same
        full ladder that made Seismic's case clean. 30 s → 6.4 s.
      - **Spokes 6×6 Tricky/Hard → NO-GO** (15 s left on the table). Deferring
        them would leave those two difficulties covered *only* by 4×4 and 2×2
        boards: the 6×6 is their only mid-size case, so this is a materially
        thinner net rather than a free saving. The rule is "the largest board of
        a family whose configurations are covered by *smaller boards*", not "the
        largest board, full stop".
      - **Slide 8×6 / 6×8 → NO-GO** (16 s), same reason: `maxmoves = -1` at that
        size is the top of its ladder, not a duplicate rung.

## 4. Verify the cheaper tests still catch things

- [x] 4.1 Spokes: assertion volume measured at both seed counts (375 vs 2,998),
      rather than assuming the reduction was safe.
- [x] 4.2 Boats: the treatment is a pure search short-circuit, so the guarantee
      is unchanged by construction — all 41 tests still pass.
- [x] 4.3 Deferred fixtures verified to actually run under `npm run test:slow`,
      and the **whole** slow tier run green.
- [x] 4.4 Gate green: 6,509 passing, 0 failing, exactly 6 deferred (4 Seismic
      7×7, 1 Bricks 12×8, 1 Pearl 10×10); slow tier 6,515 passing.

## 5. Close out

- [x] 5.1 Result: **~606 s → 285 s of suite CPU, −53%** (task 1.2 — the
      duration-sum figure of −70% was contention-inflated and is not the one to
      quote). The distribution is also flat now, which matters as much as the
      total: the worst file is 30 s where it was 297 s, and the worst single test
      ~7% where it was 20%.
- [x] 5.2 Playbook updated: the three treatments, and the rule that a test made
      cheaper must be re-checked for discrimination.
- [x] 5.3 Full gate green.
