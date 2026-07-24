import { availableParallelism } from "node:os";
import { defineConfig } from "vitest/config";

/**
 * How many worker processes the suite may take.
 *
 * This box **runs deliberately busy with the developer's own work**, and vitest
 * otherwise spawns one worker per logical core at normal priority — so a full
 * run (or even an ad-hoc single-file run) saturates the machine and slows
 * everything else down. Leaving two cores free costs a quiet box very little
 * wall clock (the pool is already sharing a warm module graph, `isolate: false`
 * below) and stops a test run from being the thing that makes the box
 * unusable.
 *
 * It also protects the run itself. `scripts/gate.sh` used to argue that
 * contention can only make a test *slower*, never *failed*, now that nothing is
 * clock-gated — but that is only true up to the 600s ceiling below, and at load
 * ~81 on 8 cores two Sixteen hint tests (~50s each solo) blew straight through
 * it and failed the gate. Not oversubscribing in the first place is the fix
 * that does not involve re-guessing a timeout.
 *
 * `VITEST_MAX_WORKERS` overrides it — set it to the core count in CI, where the
 * box is dedicated and wall clock is what matters.
 */
function maxWorkers(): number {
  const override = Number(process.env.VITEST_MAX_WORKERS);
  if (Number.isInteger(override) && override > 0) return override;
  return Math.max(2, availableParallelism() - 2);
}

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    maxWorkers: maxWorkers(),
    // ONE generous ceiling for the whole suite; no test sets its own.
    //
    // A timeout here is a backstop against a runaway test, NOT a performance
    // assertion — the `repo-layout` determinism requirement forbids failing a
    // test as a function of CPU contention, and this box is deliberately busy,
    // so an otherwise-good commit must never be rejected merely for elapsed
    // time. The heaviest suites are correct-but-slow by nature (Sixteen's exact
    // bidirectional BFS explores ~1.5M states; the hint planners and generators
    // run over many boards), and every one of them already asserts its real
    // guarantee deterministically — `hintCalls === 1`, `fallbackEngaged`, a
    // solved board — never by the clock.
    //
    // History: this was 5s, then 60s, with five per-test overrides bumped
    // 30s -> 60s -> 120s as the suite grew, and it still failed a green commit
    // at load ~32 on 8 cores. Chasing that number per test was the bug; the
    // overrides are gone and this single ceiling replaces them.
    //
    // The ceiling costs nothing when tests pass, and it was never the real hang
    // guard anyway: these tests are synchronous, so a runaway loop blocks the
    // event loop and this `setTimeout` cannot fire (the same mechanism that
    // orphans workers — see scripts/reap-orphaned-workers.sh). Actual runaway
    // protection lives where it can work: `engine/retry-limit.ts` bounds every
    // generator retry, and `stepBudget` bounds the solver/hint loops.
    testTimeout: 600_000,
    hookTimeout: 600_000,
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
