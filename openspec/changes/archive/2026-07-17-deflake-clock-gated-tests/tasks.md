# Tasks — deflake-clock-gated-tests

## 1. One ceiling

- [x] 1.1 Raise `testTimeout`/`hookTimeout` in `vitest.config.ts` to a single
      generous 600s ceiling, documenting that it is a runaway backstop and not a
      gate, and that it was never the hang guard it looked like (a `setTimeout`
      cannot interrupt this suite's synchronous tests).
- [x] 1.2 Remove **every** per-test timeout (39 across 19 files): the options
      form `{ timeout: N }`, the positional `it(name, fn, N)` / `}, N);` closer,
      and the `describe(name, { timeout: N })` block form. Both numeric spellings
      (`30000` and `30_000`) — the underscore form is easy to miss with a `\d{4,}`
      search, and missing four of them is what failed the first attempt.
- [x] 1.3 Keep `toast.test.ts`'s `vi.waitFor`, which polls rather than sleeps, but
      give it a budget far above the ~260ms it describes — `waitFor` returns the
      moment the condition holds, so headroom is free.

## 2. Gate

- [x] 2.1 Drop `gate.sh`'s adaptive load probe; always run `vitest` and
      `vite build` concurrently, since the starvation it guarded against can no
      longer fail a run.

## 3. Docs + spec

- [x] 3.1 Rewrite playbook §5.2 (it prescribes the per-test timeouts being
      removed, and justifies them with a 5s default the config abandoned long
      ago); fix its §1 checklist pointer and the `hint-authoring.md` killer-walk
      note that tells authors to add a `30_000` timeout.
- [x] 3.2 Update the stale in-test comments that explain a timeout that no longer
      exists (keep the ones explaining *why the work is expensive* — still true).
- [x] 3.3 MODIFIED `repo-layout` "test suite is deterministic under parallel
      load": a timeout is a backstop not a gate; one global ceiling; removing a
      clock gate is the right fix for contention on terminating work; everything
      else (seed-determinism, finite caps, no elapsed-time asserts, root-causing)
      keeps its teeth.
- [x] 3.4 Full gate green; archive.
