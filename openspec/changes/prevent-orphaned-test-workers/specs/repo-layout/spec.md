# repo-layout Specification (delta)

## ADDED Requirements

### Requirement: Test worker processes do not outlive their runner

A `vitest` run SHALL NOT leave worker processes running after it ends. Because
every generator/solver/hint-planner under `src/native/` is synchronous, a
worker mid-computation cannot be interrupted by `testTimeout` or by the pool's
IPC shutdown, so a run that is killed while a worker computes (Ctrl-C, a
CI/bash-timeout SIGTERM) reparents that worker to init (PID 1) where it spins on
a CPU core indefinitely, and repeated interrupts accumulate such orphans. Two
mechanisms SHALL keep this from degrading the machine:

1. **Reaping.** A run's entry points (the pre-commit gate `scripts/gate.sh` and
   the `test`/`test:run` npm scripts) SHALL reap orphaned workers **before**
   starting — killing only this repo's `vitest` worker processes whose parent is
   PID 1 (definitionally orphans; a live run's workers have their runner as
   parent), by exact PID, never with `pkill`/`killall`, and never a live run's
   workers or another user's processes. The reaper SHALL be fail-safe: any error
   is swallowed and the run proceeds. It runs *before* rather than *after* a run
   because the interrupt that creates an orphan also kills any post-run hook.

2. **Bounded generation.** Every *generate-until-success* retry loop in a game
   generator SHALL have a finite iteration cap that throws on exhaustion (as
   `tracks` and `dominosa` already do), so a pathological seed fails fast instead
   of spinning a worker forever. This reinforces the existing "deterministic
   under parallel load" requirement's clause that "a generator's retry loop SHALL
   have a finite iteration cap rather than relying on probabilistic termination".
   Fixpoint solvers that terminate by monotone progress are exempt.

#### Scenario: Orphaned workers are reaped before a run

- **WHEN** a test entry point (the gate or a `test`/`test:run` npm script) starts
  and a prior run left an orphaned worker (a repo `vitest` worker with PPID 1)
- **THEN** that orphan is killed by its exact PID before the new run begins, so
  orphans never accumulate across runs

#### Scenario: A live run's workers are never reaped

- **WHEN** the reaper runs while another `vitest` run is in progress
- **THEN** that run's workers (which have their runner as parent, not PID 1) are
  left untouched, and only true orphans are killed

#### Scenario: A runaway generator fails fast instead of orphaning a worker

- **WHEN** a game generator's retry loop is given an input for which it never
  reaches success
- **THEN** it throws after a finite iteration cap rather than looping forever, so
  the worker returns control (and can be torn down) instead of becoming an
  uninterruptible orphan
