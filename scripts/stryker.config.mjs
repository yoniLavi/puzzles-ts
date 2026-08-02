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
 * - **`ignoreStatic: true`, and it skips far less than its name suggests.** A
 *   "static" mutant lives in code that runs at **module load** — a top-level
 *   table, a constant initialiser — so per-test coverage cannot always be
 *   attributed to it. Of 2,168 mutants here, 836 are static; with this flag on,
 *   **831 of them were still evaluated** and only **5** were ignored (the ones
 *   Stryker could attribute no coverage to at all). What the flag actually
 *   prevents is Stryker *budgeting a whole-suite run per static mutant*, which
 *   is what produced an observed ETA of ~678 hours with it off. With it on, the
 *   same set finished in 398 minutes.
 *
 *   Do not restate this as "836 mutants were skipped" — an earlier revision of
 *   this comment did, and it understated the audit's coverage by two orders of
 *   magnitude until the completed report contradicted it.
 *
 *   The general form, worth remembering before reaching for mutation testing
 *   anywhere else: cost per mutant is one *covering-test* run normally, and one
 *   whole-suite run when coverage cannot be attributed. Affordability is decided
 *   by how much of the target is module-scope, by how slow the suite is with
 *   parallelism off, and by how broad the target's covering set is — `midend.ts`
 *   dominated this run because nearly every test constructs a `Midend`.
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
    "src/engine/midend.ts",
    "src/engine/save.ts",
    "src/engine/latin.ts",
    "src/engine/deduction-fixpoint.ts",
    "src/engine/border-grid.ts",
    "src/engine/dsf.ts",
    "src/engine/grid/index.ts",
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
