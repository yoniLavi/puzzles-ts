# Tasks — prevent-orphaned-test-workers

## 1. Reaper (the floor — stops accumulation immediately)

- [ ] 1.1 Add `scripts/reap-orphaned-workers.sh`: find `node` processes running
      `vitest/dist/workers/forks.js` under **this repo's** `node_modules` whose
      **PPID is 1**, and kill them by exact PID (SIGTERM, then SIGKILL any
      survivor). Fail-safe: swallow all errors and exit 0 so it can never block a
      run. Print a one-line notice naming reaped PIDs/ages when it reaps
      something; silent otherwise.
- [ ] 1.2 Verify the reaper's safety by construction and by test: it must NOT
      kill a live `vitest` run's workers (they have a real parent, PPID ≠ 1).
      Confirm with a live run in another shell that its workers survive a reaper
      invocation, and that a synthesised PPID-1 orphan is reaped.
- [ ] 1.3 Wire it in before every test entry point: call it at the top of
      `scripts/gate.sh`, and add `pretest` + `pretest:run` npm scripts that run
      it (covers `npm test` watch and `npm run test:run`). Keep it out of the
      hot path for a no-orphan box (a single cheap `ps` scan).

## 2. Prevention — bound generate-until-success loops

- [ ] 2.1 Audit `src/native/**/generator.ts` (and any generator-ish `state.ts`)
      for unbounded `for(;;)`/`while(true)` **retry** loops — the
      generate-on-failure kind, NOT fixpoint solvers (which terminate by monotone
      progress and stay untouched). Known target: `net/generator.ts`
      `beginGeneration`. List each with a verdict (capped / needs cap / exempt
      fixpoint).
- [ ] 2.2 Give each un-capped retry loop a finite iteration cap that `throw`s on
      exhaustion, following the in-repo precedent (`tracks/generator.ts`,
      `dominosa/generator.ts` `MAX_REGENERATE`). Choose bounds generous enough to
      never fire on a valid seed, tight enough to fail in seconds.
- [ ] 2.3 Confirm no regression: the affected games' behavioural + differential
      tests stay green, and the cap does not fire on any exercised preset/seed.

## 3. Spec + close out

- [ ] 3.1 Add the `repo-layout` "test workers do not outlive their runner"
      requirement (this change's spec delta): orphans are reaped before each run,
      and generator retries are finitely bounded so a worker cannot spin forever.
- [ ] 3.2 Full gate green under the new orchestration; update the
      `project_vitest_worker_orphaning` memory to mark the fixes landed; archive.
