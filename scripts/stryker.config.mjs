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
 *   table, a constant initializer — so per-test coverage cannot always be
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
  // IN-TREE, AND IT HAS TO BE — do not "fix" this by pointing it at the OS temp
  // directory. That was tried (`refile-misplaced-artefacts`, 2026-08-02) and it
  // runs, but the dry run then finds **no tests at all**: the vitest runner
  // resolves `vitest.related` against the mutated files, and from a sandbox
  // outside the project root nothing matches, so Stryker exits with "No tests
  // were executed" after ~13 s. The warning it prints offers `vitest.related:
  // false` as the escape, and that is a much worse trade than the disk it saves:
  // with `related` off, every one of the 2,168 mutant runs globs and *loads* all
  // 252 test files and filters only by test-name regex afterwards, instead of
  // loading the handful that import the mutated module. On a run already
  // budgeted at ~400 minutes that risks a multiple, not a margin.
  //
  // The disk problem it was meant to solve is real but smaller: each sandbox is
  // a ~38 MB copy of the repository, `cleanTempDir` removes it only when a run
  // *finishes*, and an interrupted 400-minute run is the norm rather than the
  // exception — five had accumulated by 2026-08-02, 192 MB. `npm run mutation`
  // therefore clears the directory before it starts, so at worst one interrupted
  // run's copy sits here until the next run, never five.
  //
  // That cleanup is not only about disk: Stryker's project reader walks whatever
  // is in the tree, so with the five copies present it reported "Found 7 of
  // 15233 file(s) to be mutated" and without them "7 of 2563". A stale sandbox
  // is a cost paid again on every subsequent run.
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
  // the audit is about runtime behavior, so the sandbox copies are `@ts-nocheck`d.
  disableTypeChecks: true,
  // No ratchet, ever. A score that invites maximizing invites tests written
  // against mutants rather than against behavior; the deliverable is the
  // triaged survivor list.
  thresholds: { high: 100, low: 0, break: null },
};
