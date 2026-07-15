# Tasks — optimize-test-suite-performance

## 1. Baseline + D1 (parallelize independent gate steps)

- [ ] 1.1 Record the current gate baseline (per-step wall-clock, machine) so
      the win is measurable.
- [ ] 1.2 Rework `.husky/pre-commit`: `tsc` → `biome` (fast serial prefix),
      then run `vitest run` and `vite build` **concurrently**, wait on both,
      fail the commit if either fails; capture each branch's output and print
      it on failure. Confirm blocking semantics unchanged (break each step,
      verify the commit is rejected).
- [ ] 1.3 Measure the new gate wall-clock; expect ≈ `max(vitest, build)` for
      the parallel tail.

## 2. D2 (vitest module-load overhead) — evaluate then apply the safe subset

- [ ] 2.1 Try `poolOptions.forks.isolate: false` (or `pool: "threads"`);
      measure `vitest run` wall-clock 3× and diff against baseline.
- [ ] 2.2 Prove determinism: full run green 3× under the new pool, and audit
      module-level mutable state (registry, prefs stores, recording harness)
      for cross-file leakage. If any nondeterminism/leak appears, **revert D2**
      and record the no-go with its reason.
- [ ] 2.3 Apply only the proven-safe configuration; document the verdict in the
      `repo-layout` design notes.

## 3. D3 (optional fast/heavy split) — design decision only unless justified

- [ ] 3.1 Decide, from D1+D2 results, whether a fast/heavy vitest split is still
      warranted. If not, record the decision and stop. If yes, design the
      heavy-tier home (pre-push hook / CI) so it remains a blocking gate before
      push — never opt-in — and get owner sign-off before implementing.

## 4. Close out

- [ ] 4.1 Update the `repo-layout` spec's gate requirement; full gate green
      under the new orchestration; archive.
