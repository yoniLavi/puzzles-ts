# right-size-the-test-gate — tasks

## 1. Measure first

- [x] 1.1 Per-file and per-test timings via `vitest --reporter=json`. Baseline:
      **1,178 s of test time across 250 files**; five files 66%; ~10 individual
      tests ~54%.

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

## 4. Verify the cheaper tests still catch things

- [x] 4.1 Spokes: assertion volume measured at both seed counts (375 vs 2,998),
      rather than assuming the reduction was safe.
- [x] 4.2 Boats: the treatment is a pure search short-circuit, so the guarantee
      is unchanged by construction — all 41 tests still pass.
- [x] 4.3 Deferred fixtures verified to actually run under `npm run test:slow`,
      and the **whole** slow tier run green.
- [x] 4.4 Gate green: 6,510 passing, 0 failing, exactly 5 deferred.

## 5. Close out

- [x] 5.1 Result: **1,178 s → 381 s of test time, −68%**, and the distribution is
      now flat — the worst file is 30 s where it was 297 s. No single test is
      more than ~8% of the suite.
- [x] 5.2 Playbook updated: the three treatments, and the rule that a test made
      cheaper must be re-checked for discrimination.
- [x] 5.3 Full gate green.
