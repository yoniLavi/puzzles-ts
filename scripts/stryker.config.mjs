/**
 * Mutation-testing audit (`npm run mutation`), from `audit-test-suite-strength`.
 *
 * This is an **on-demand audit, deliberately not a gate and deliberately not
 * ratcheted** — the same standing as `scripts/metrics.sh`, and for the same
 * reason: the value is in reading the survivors, not in a number. It is NOT
 * folded into `metrics.sh`, because that harness finishes in a couple of minutes
 * and this takes the better part of an hour; silently making `npm run metrics`
 * forty times slower would get it stopped rather than read.
 *
 * It answers the one question line coverage cannot: the suite *executes* every
 * deduction rung, but would a rung that returned the wrong answer be *noticed*?
 *
 * ## Three settings that are not preferences
 *
 * Each was measured, and each is the difference between "runs" and "does not".
 *
 * - **`coverageAnalysis: "perTest"`.** Without it every mutant re-runs all 6,490
 *   tests. With it, Stryker learns from one instrumented dry run which tests
 *   touch which statement and runs only those. Narrowing by *its own* coverage is
 *   honest; hand-picking test files would not be — a mutant would then "survive"
 *   because the test that kills it was excluded.
 *
 * - **`dryRunTimeoutMinutes: 45`** (default 5). Stryker's vitest runner forces
 *   `pool: "threads"`, `maxThreads: 1`, `maxWorkers: 1`, so the dry run is the
 *   suite run **serially**: measured at **4,466 tests in 20 min 54 s**, against
 *   ~116 s for vitest's own parallel run. The default cannot complete here.
 *
 * - **`ignoreStatic: true`, which is a deliberate and *reported* gap.** A
 *   "static" mutant lives in code that runs at **module load** — a top-level
 *   table, a constant initialiser — so per-test coverage cannot be attributed to
 *   it and Stryker must re-run the whole suite for each one. Of 2,168 mutants in
 *   these seven modules, **836 (39%) are static, and Stryker estimates them at
 *   97% of the total time**: the observed ETA including them was **~678 hours**,
 *   versus minutes for the rest. So they are skipped — and any report of a run
 *   from this config MUST say so, because a partial run presented as complete is
 *   exactly the "no silent caps" failure this repository has named before.
 *
 *   The general form, worth remembering before reaching for mutation testing
 *   anywhere else: its cost per mutant is one test-suite run for module-scope
 *   code and one *covering-test* run for everything else. Whether it is
 *   affordable is decided by how much of the target is module scope, multiplied
 *   by how slow the suite is with parallelism switched off.
 *
 * Findings and the survivor triage:
 * `openspec/changes/archive/*-audit-test-suite-strength/findings.md`.
 */
export default {
  packageManager: "npm",
  testRunner: "vitest",
  vitest: { configFile: "vitest.config.ts" },
  coverageAnalysis: "perTest",

  // The shared engine is the right scope: every one of the 57 games depends on
  // it, so a silently-untested branch here has the widest blast radius. The 57
  // games' own solvers are out of scope — mutating them would mostly rediscover
  // that generation is fixture-pinned, which §2 of the findings sampled directly.
  mutate: [
    "src/native/engine/midend.ts",
    "src/native/engine/save.ts",
    "src/native/engine/latin.ts",
    "src/native/engine/deduction-fixpoint.ts",
    "src/native/engine/border-grid.ts",
    "src/native/engine/dsf.ts",
    "src/native/engine/grid.ts",
  ],

  ignoreStatic: true,
  dryRunTimeoutMinutes: 45,

  reporters: ["json", "progress-append-only"],
  jsonReporter: { fileName: "metrics/mutation/report.json" },
  tempDirName: ".stryker-tmp",
  cleanTempDir: true,
  concurrency: 6,
  // Generous, but no longer absurd. Stryker's budget is
  // `baseline * timeoutFactor + timeoutMS`, and a timeout counts as *killed*, so
  // a tight value costs information rather than correctness. It was 120 s when
  // the suite's worst single test was ~240 s; `right-size-the-test-gate` brought
  // that to ~10 s, and 57 timeouts at 120 s each had become a large share of the
  // run's wall clock.
  timeoutMS: 30_000,
  timeoutFactor: 2,
  // Mutations routinely produce type errors (a `string` where a `number` went);
  // the audit is about runtime behaviour, so the sandbox copies are `@ts-nocheck`d.
  disableTypeChecks: true,
  // No ratchet, ever. A score that invites maximising invites tests written
  // against mutants rather than against behaviour; the deliverable is the
  // triaged survivor list.
  thresholds: { high: 100, low: 0, break: null },
};
