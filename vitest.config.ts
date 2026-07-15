import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // The heaviest suites (recording-solver / A* hint planners run across many
    // generated boards) take a few seconds each even unloaded, and far longer when
    // the machine is under heavy external load — the 5s default flakes the husky
    // pre-commit gate. A high per-test ceiling only costs wall-time on a genuinely
    // hung test (and the hint/solver loops are already bounded by `stepBudget`), so
    // raise it well clear of load spikes. Individual tests still set tighter explicit
    // timeouts where a fast bound is meaningful.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Reuse each worker's loaded module graph across test files instead of
    // re-importing it per file. The default `forks` pool isolates every file,
    // re-paying import+transform (~50s cumulative here) 169 times; turning
    // isolation off cut a full run from ~180s to ~60s on an 8-core box AND
    // removed the load-induced 60s-timeout flakes (re-importing was itself
    // starving the seed-deterministic heavy tests). See
    // `optimize-test-suite-performance`.
    //
    // Safe ONLY because the suite is order-independent under shared module
    // state (the `repo-layout` "deterministic under parallel load"
    // requirement). The one shared mutable singleton — the game
    // `registerGame` registry — is populated by an idempotent
    // `registerAllGames()`; the one file that resets it (`worker-adapter`)
    // restores it in `afterAll`, and every file that reads the full registry
    // re-ensures it in `beforeAll`. Verified: full suite green 3× under
    // file-order shuffle (`sequence.shuffle.files`) with isolation off. If a
    // future port reintroduces a cross-file leak, re-run with that shuffle to
    // localise it — do not "fix" it by re-enabling isolation.
    isolate: false,
  },
});
