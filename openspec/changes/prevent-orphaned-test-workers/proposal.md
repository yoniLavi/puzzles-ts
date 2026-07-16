# Prevent (and reap) orphaned vitest worker processes

## Why

Interrupting a `vitest` run mid-computation leaks worker processes that spin at
~78% CPU **forever**. Diagnosed 2026-07-15: two `vitest/dist/workers/forks.js`
workers, reparented to PID 1, had been running 4h40m and were the main reason
the dev box sat at load 13–96.

Mechanism: every generator/solver/hint-planner under `src/native/` is **purely
synchronous** (no `await`), so a running one blocks the worker's event loop.
`testTimeout` is a `setTimeout` on that same loop, so it **cannot interrupt** a
synchronous loop; the pool's shutdown is IPC-driven, so a sync-blocked worker
never sees "exit" when its parent is killed (Ctrl-C, a CI/bash timeout's
SIGTERM). It reparents to init and keeps burning a core. Each interrupt leaks
one; they **accumulate** — the gradual, unexplained slowdown the owner had been
living with. Some generators (`net`) still use unbounded `for(;;)`
generate-until-unique retries that can genuinely never terminate, widening the
window.

## What Changes

- **Reap orphans automatically (the floor — must ship).** A small, safe
  `scripts/reap-orphaned-workers.sh` kills only this repo's
  `vitest/.../forks.js` workers whose parent is PID 1 (definitionally orphans; a
  live run's workers always have a real vitest parent). It runs before every
  test entry point — `scripts/gate.sh`, and a `pretest`/`pretest:run` npm hook —
  so accumulation is cleaned up at the start of the next run regardless of how
  the previous one died. Never touches a live run or another user's processes.
- **Bound generator retries so a worker cannot spin forever (prevention).**
  Audit the unbounded `for(;;)`/`while(true)` *generate-until-success* loops
  (fixpoint solvers that provably terminate are exempt) and give each a finite
  iteration cap that throws on exhaustion — the pattern `tracks` and `dominosa`
  already use (`MAX_REGENERATE`). This closes the existing `repo-layout`
  determinism requirement ("a generator's retry loop SHALL have a finite
  iteration cap") where it is currently unmet, so a pathological seed fails fast
  instead of orphaning a worker.

## Impact

- Affected specs: **`repo-layout`** (a new worker-lifecycle requirement; it
  reinforces the existing "deterministic under parallel load" finite-cap
  clause).
- Affected code: new `scripts/reap-orphaned-workers.sh`; `scripts/gate.sh` and
  `package.json` (pre-run hook wiring); the un-capped game generators
  (finite caps).
- No behaviour change to passing runs; the reaper is a no-op when there are no
  orphans, and the caps only fire on inputs that would otherwise hang.
