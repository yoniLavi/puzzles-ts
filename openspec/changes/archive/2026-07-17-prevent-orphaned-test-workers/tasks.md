# Tasks — prevent-orphaned-test-workers

## 1. Reaper (the floor — stops accumulation immediately)

- [x] 1.1 Add `scripts/reap-orphaned-workers.sh`: find `node` processes running
      `vitest/dist/workers/forks.js` under **this repo's** `node_modules` whose
      **PPID is 1**, and kill them by exact PID (SIGTERM, then SIGKILL any
      survivor). Fail-safe: swallow all errors and exit 0 so it can never block a
      run. Print a one-line notice naming reaped PIDs/ages when it reaps
      something; silent otherwise.
- [x] 1.2 Verify the reaper's safety by construction and by test: it must NOT
      kill a live `vitest` run's workers (they have a real parent, PPID ≠ 1).
      Confirm with a live run in another shell that its workers survive a reaper
      invocation, and that a synthesised PPID-1 orphan is reaped.
- [x] 1.3 Wire it in before every test entry point: call it at the top of
      `scripts/gate.sh`, and add `pretest` + `pretest:run` npm scripts that run
      it (covers `npm test` watch and `npm run test:run`). Keep it out of the
      hot path for a no-orphan box (a single cheap `ps` scan).

## 2. Prevention — bound generate-until-success loops

- [x] 2.1 Audit `src/native/**/generator.ts` (and any generator-ish `state.ts`)
      for unbounded `for(;;)`/`while(true)` **retry** loops — the
      generate-on-failure kind, NOT fixpoint solvers (which terminate by monotone
      progress and stay untouched). Known target: `net/generator.ts`
      `beginGeneration`. List each with a verdict (capped / needs cap / exempt
      fixpoint).
- [x] 2.2 Give each un-capped retry loop a finite bound. ~~following the in-repo
      precedent~~ — superseded by D3a (owner directive: the design was a sketch,
      go deeper): a shared `src/native/engine/retry-limit.ts` (`retryLimit` guard
      + typed `RetryLimitExceeded`, unit-tested) now backs **all 25** retry loops
      — the 18 newly-bounded sites *and* the 7 pre-existing hand-rolled caps —
      so the pattern is uniform repo-wide. Bounds are generous enough never to
      fire on a valid seed, tight enough to fail in seconds.
- [x] 2.2a **Root-cause `net`'s loop-fix stall rather than capping it** (D4).
      Verified against upstream `net.c:1485` (sibling clone) that the `>` is
      faithful — upstream has the same latent hang, because its predicate tests
      "increasing" while its comment intends "not reducing". Detect the stall and
      take upstream's own `goto shuffle` recovery: the loop gains a real bound
      (`wh * MAX_STALLED_ROUNDS`) instead of a probabilistic argument, and a
      pathological seed yields a slower puzzle rather than a thrown error.
      Constant chosen from measurement (720 boards: longest plateau 3, escapes 0).
- [x] 2.3 Confirm no regression: the affected games' behavioural + differential
      tests stay green, and the cap does not fire on any exercised preset/seed.

## 3. Spec + close out

- [x] 3.1 Add the `repo-layout` "test workers do not outlive their runner"
      requirement (this change's spec delta): orphans are reaped before each run,
      and generator retries are finitely bounded so a worker cannot spin forever.
- [x] 3.2 Full gate green under the new orchestration (2756 tests, 170 files,
      prod build; exit 0); `project_vitest_worker_orphaning` memory updated.
      Archive pending owner acceptance.
