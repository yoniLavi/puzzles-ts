## Context

Orphaned vitest fork workers (PPID 1, ~78% CPU, running for hours) are the root
cause of a long-standing dev-box slowdown. The full mechanism is in the memory
note `project_vitest_worker_orphaning` and the proposal's Why. The essential
constraint: **a synchronous JS loop cannot be interrupted** — not by
`testTimeout` (a timer on the blocked loop) and not by the pool's IPC shutdown
(also event-loop-driven). So there is no in-worker hook that reliably kills a
sync-blocked worker on parent death; prevention must stop the runaway loop, and
reaping must clean up whatever still leaks.

## Goals / Non-Goals

- Goals: (1) never let orphans accumulate — reap them cheaply and safely before
  each run; (2) stop generators from being able to spin forever, so the reaper
  has less to do and a bad seed fails fast.
- Non-Goals: making synchronous tests interruptible (not possible without an
  invasive async/yield rewrite the tests don't want); changing vitest's pool
  (`forks` + `isolate:false` stays — it already reduces worker churn).

## Decisions

- **D1 — Reaper keys on PPID==1 + repo-specific worker path.** A live run's
  workers are children of their vitest runner (PPID ≠ 1); only orphans reparent
  to init. Matching `vitest/dist/workers/forks.js` under this repo's
  `node_modules` path scopes it to our leak and never to another project or
  another user's processes. The reaper is **fail-safe**: any error (no `ps`,
  parse miss) is swallowed and the run proceeds — it must never block a commit.
  Kill by exact PID (never `pkill`/`killall`, per project rule).

- **D2 — Run the reaper *before* runs, not after.** A `post`-hook does not run
  when the process is Ctrl-C'd (the interrupt that creates the orphan also kills
  the hook). A `pre`-hook reliably cleans up the *previous* run's leak at the
  start of the next. Wired in two places sharing one script: `scripts/gate.sh`
  (top) and `pretest`/`pretest:run` npm hooks (covers `npm test` watch and
  `npm run test:run`).

- **D3 — Finite caps only on generate-until-success loops.** Fixpoint solvers
  (`repeat until no progress`) terminate by monotone progress and are left
  alone. The targets are unbounded retry loops that regenerate on failure
  (`net`'s `beginGeneration: for(;;)`, and any peer without a guard). Follow the
  in-repo precedent exactly: a `MAX_REGENERATE`-style counter that `throw`s on
  exhaustion (see `tracks/generator.ts`, `dominosa/generator.ts`). The cap must
  be high enough never to fire on a valid seed and low enough to fail in seconds,
  not hours.

## Risks / Trade-offs

- Reaper kills a legitimate process → mitigated by the PPID==1 + repo-path
  double key (a live worker is never PPID 1) and kill-by-exact-PID.
- A cap set too low fails a valid generation → mitigated by matching the
  existing generators' generous bounds and by the differential/behavioural tests
  catching a regression.
- Residual: a worker can still be orphaned *during* a run that is then killed;
  the pre-run reaper catches it next time, so it never accumulates. This is the
  accepted floor, since sync loops are fundamentally uninterruptible.

## Migration Plan

Ship D1 (reaper) first — it stops the bleeding immediately and is pure tooling.
Then D2 wiring, then D3 (audit + caps) as a bounded hardening pass. Each is
independently landable.

## Open Questions

- Should the reaper also warn (print the reaped PIDs/ages) so a developer learns
  they left orphans, or stay silent? Lean: print a one-line notice when it
  reaps something, silent when there is nothing to do.
