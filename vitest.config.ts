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
 * clock-gated — but that is only true up to the ceiling below, and at load ~81
 * on 8 cores two Sixteen hint tests (~50s each solo) blew straight through the
 * then-600s value and failed the gate. Not oversubscribing in the first place is
 * the fix that does not involve re-guessing a timeout. (It is not sufficient on
 * its own: the box is shared, so a run can be starved by work this config has no
 * say over — hence the deliberately absurd ceiling below.)
 *
 * `VITEST_MAX_WORKERS` overrides it — set it to the core count in CI, where the
 * box is dedicated and wall clock is what matters.
 */
function maxWorkers(): number {
  const override = Number(process.env["VITEST_MAX_WORKERS"]);
  if (Number.isInteger(override) && override > 0) return override;
  return Math.max(2, availableParallelism() - 2);
}

export default defineConfig({
  test: {
    // `vite-plugins/` is included because the build side is real logic now, not
    // configuration: it decides what the About box credits and refuses to ship
    // an asset outside the offline cache. Both were written without tests
    // because there was nowhere to put them — `src/**` was the only pattern —
    // and both had bugs their first run caught. They are typechecked by
    // `tsconfig.node.json`, so they may use Node types the browser-shaped
    // `src/` project does not have.
    include: ["src/**/*.test.ts", "vite-plugins/**/*.test.ts"],
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
    // overrides are gone and this single ceiling replaces them. Then 600s was
    // *itself* blown through: at load ~95, `bricks-differential` took **783s**
    // and failed a commit whose tree had already gated green minutes earlier
    // (2026-07-30). Re-running it would only have added load — the failure mode
    // is self-compounding, which is what makes it worth over-provisioning.
    //
    // So the number is now an hour: ~4.6x the worst elapsed time ever observed
    // here, chosen to be *absurd* rather than merely generous, because every
    // previous value was picked to be "obviously enough" and was not.
    //
    // Over-provisioning is close to free, because this ceiling was never the
    // real hang guard: these tests are synchronous, so a runaway loop blocks the
    // event loop and this `setTimeout` cannot fire (the same mechanism that
    // orphans workers — see scripts/reap-orphaned-workers.sh). Actual runaway
    // protection lives where it can work: `engine/retry-limit.ts` bounds every
    // generator retry, and `stepBudget` bounds the solver/hint loops. What the
    // ceiling *can* do is reject a good commit for being unlucky about when it
    // ran, which is the only thing it has actually done so far.
    //
    // If a run ever legitimately approaches this, the answer is still not a
    // bigger number: it is that something became genuinely non-terminating, and
    // the bound that catches that lives in retry-limit.ts.
    testTimeout: 3_600_000,
    hookTimeout: 3_600_000,
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
    // requirement). There are **two** shared mutable singletons, not one:
    //
    //  - the game `registerGame` registry, populated by an idempotent
    //    `registerAllGames()`; the one file that resets it (`worker-adapter`)
    //    restores it in `afterAll`, and every file that reads the full registry
    //    re-ensures it in `beforeAll`;
    //  - **vitest's own per-worker module registry, which `vi.mock` writes
    //    into.** This comment used to claim the registry was the only one. It
    //    is not, and the omission cost a rejected commit: two files mocked
    //    `store/saved-games.ts` with different factories, and whenever they
    //    landed in one worker the loser silently got the winner's spies — four
    //    assertions failing as "expected to be called once, got 0 times" on a
    //    tree that had gated clean minutes earlier.
    //    `src/no-duplicate-module-mocks.test.ts` now holds one mocking file per
    //    module, which is what makes the claim above true rather than hopeful.
    //
    // Verified: full suite green 3× under file-order shuffle
    // (`sequence.shuffle.files`) with isolation off. Note what that did *not*
    // catch — two shuffled runs missed the mock collision, because shuffling
    // file order rarely co-locates a specific pair in one worker. To localize a
    // suspected cross-file leak, force the suspects into one worker
    // (`VITEST_MAX_WORKERS=1 vitest run <a> <b>`) rather than reaching for the
    // shuffle. Do not "fix" it by re-enabling isolation.
    isolate: false,
  },
});
