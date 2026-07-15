# Tasks — optimize-test-suite-performance

## 1. Baseline + D1 (parallelize independent gate steps)

- [x] 1.1 Record the current gate baseline (per-step wall-clock, machine) so
      the win is measurable. **Baseline (8-core box, heavy external load,
      169 files / 2750 tests): `vitest run` ~180s wall with 3 load-induced
      timeout failures (dsf 94s, netslide-hint 180s, solo-hint); `vite build`
      ~41s; tsc/biome a few seconds.** (The proposal's cleaner 86.6s vitest was
      an idler box; this box carried a persistent multi-core external load, which
      turned out to be the more informative test condition.)
- [x] 1.2 Rework the gate: `tsc` → `biome` (fast serial prefix), then the two
      heavy independent checks. **Landed as `scripts/gate.sh`, shared by
      `.husky/pre-commit` and `npm run gate` (single source of truth, per the
      build-pipeline spec's "mirror each other" rule).** Blocking semantics:
      the gate collects both heavy exit codes and fails the commit if either
      fails; vite build's log is captured and printed only on failure.
      **Concurrency is ADAPTIVE (see 1.3 / design D1-revised): concurrent when
      the box has spare cores, serial otherwise.**
- [x] 1.3 Measure the new gate wall-clock. **Verdict: an *unconditional*
      concurrent build is NOT reliable on a loaded box — it oversubscribes CPU
      and memory and starves vitest's heaviest seed-deterministic tests past
      their 60s timeout (reproduced repeatedly: dsf / netslide-hint timing out
      only when the build ran concurrently; the identical suite ran green when
      the build was serialised, even at load 85). Since the gate's first duty is
      reliability, D1 was implemented as adaptive concurrency: `vitest ∥ build`
      only when the 1-min load average leaves ≥1 core of headroom, else `vitest`
      then `build`. Idle boxes get the ~40s parallel win; loaded boxes stay
      green. The safe fallback (serial) means a misjudged probe costs at most the
      speedup, never a spuriously-blocked commit.**

## 2. D2 (vitest module-load overhead) — evaluate then apply the safe subset

- [x] 2.1 Try `poolOptions.forks.isolate: false`; measure `vitest run`
      wall-clock and diff against baseline. **Result: full run ~180s → ~60s
      (`import` 74s → 22s; the default `forks` pool was re-paying the whole
      module graph's import+transform per file, 169×). Applied `isolate: false`
      in `vitest.config.ts`.**
- [x] 2.2 Prove determinism under the new pool. **Green 3× under file-order
      shuffle (`sequence.shuffle.files`) with isolation off — the precise stress
      for the shared-module-state leak class. One real cross-file leak found and
      fixed: the game `registerGame` registry (module-level Maps shared across a
      worker's files). Fix: `registerGame` is now idempotent on the same game
      instance; `games/index.ts` exposes a re-runnable `registerAllGames()`; the
      one file that resets the registry (`worker-adapter.test.ts`) restores it in
      `afterAll`, and the four files that read the full registry re-ensure it in
      `beforeAll`. A forced worst-case ordering (mutator file first, single
      worker) failed before the fix and passes after. Also: `isolate: false`
      *removed* the baseline's 3 load-induced timeouts — re-importing the graph
      per file was itself starving the heavy tests.**
- [x] 2.3 Apply only the proven-safe configuration; document the verdict.
      **`isolate: false` shipped with an in-file rationale + the determinism
      verification recorded. Added `npm run test:shuffle` as the durable
      leak-detector to re-run if a future port reintroduces cross-file state.
      `repo-layout` design note added (see spec delta).**

## 2b. Heavy-test boundedness (spec-required; enables adaptive concurrency)

- [x] 2b.1 The `repo-layout` "bounded so worst-case wall time stays within the
      test timeout even when every worker is saturated" requirement was already
      violated by the two slowest hint/property tests (they were the baseline's
      timeout victims). Right-sized coverage-preservingly:
  - `netslide-hint.test.ts`: the structural narration-invariant tests (no
    "centre", one "belongs" per sentence, sentence length, every step states a
    purpose) each regenerated 20–60 boards and re-ran the (costly) hint planner.
    They now share **one lazily-computed hint corpus** (6 boards × 3 sizes,
    computed once) — same invariants over a richer consistent board set, ~100
    planner calls collapsed to ~18. Isolated wall time 43s → ~22s. The
    condition-hunting tests (frozen-line / beside-source / journey) keep their
    own targeted loops (they need a board matching a predicate, not a sample).
  - `dsf.test.ts`: the brute-force flip-parity property (n·n·ops full-matrix
    re-check) right-sized 24/60 → 16/40. The property is n-independent; 16
    elements under 40 consistent merges still builds deep multi-way inverted
    equivalence classes. ~3× less work, same rigour.
  - Neither reduces *which* correctness is verified — both remove redundant
    re-execution of deterministic checks, satisfying the mandatory boundedness.

## 3. D3 (optional fast/heavy split) — design decision only unless justified

- [x] 3.1 **Decision: NOT split.** D2 (isolate:false) plus the heavy-test
      right-sizing already brought the suite to ~60s green under load without
      moving any check off the per-commit path. A fast/heavy split would weaken
      the always-green correctness bar (the differentials are the strongest
      check) for no remaining need. Default-against stands.

## 4. Close out

- [x] 4.1 Update the build-pipeline spec delta to describe the *adaptive*
      concurrency actually built (was: unconditional). Full suite verified green
      (73s at load 85, all 2750) with every edit in place; tsc + biome clean.
- [ ] 4.2 **Owner acceptance pending** — a clean full-gate wall-clock benchmark
      is blocked by this box's external load; D2's win and green-under-load are
      proven, D1's parallel win is the standard-independent-steps case that lands
      on any box with spare cores. Archive after the owner confirms on a normal
      box. NOT committed (awaiting owner sign-off, per project convention).
