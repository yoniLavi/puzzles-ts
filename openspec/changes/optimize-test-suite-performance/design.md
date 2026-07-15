## Context

The pre-commit gate is the only automated correctness gate in this fork (the
inherited Cloudflare CI is disabled). It must stay comprehensive, but its
wall-clock (~140s) is now a routine tax. Measured baseline (8-core dev box,
169 files / 2750 tests): vitest 86.6s (import 34.7s + transform 14.7s + tests
402.5s cumulative), vite build 41.0s, tsc/biome a few seconds.

## Goals / Non-Goals

- Goals: cut gate wall-clock materially without dropping any check or weakening
  determinism; keep the win durable as more ports land.
- Non-Goals: introducing CI (separate effort); rewriting the differentials;
  removing `vite build` from the gate.

## Decisions (to finalize in implementation)

- **D1 — Parallelize `vitest` ∥ `vite build`.** They share no inputs/outputs,
  so run them concurrently and `wait` on both, failing if either fails. Simplest
  form: a small shell orchestration in `.husky/pre-commit` (background both,
  collect exit codes) or an npm script using a runner. Expected win ~41s (the
  build fully hides behind vitest). Lowest risk — nothing about *what* is checked
  changes. Keep `tsc`→`biome` as the fast serial prefix so a type/lint error
  still fails in seconds without spending the heavy branches.

- **D2 — vitest pool/isolation.** The ~50s import+transform overhead is re-paid
  per file because the default `forks` pool isolates each file. Candidates, in
  order of preference: (a) `poolOptions.forks.isolate: false` (or the `threads`
  pool) so a worker reuses its module registry across files; (b) reducing what
  test files import (many pull the whole `games/index` barrel transitively).
  **Hard gate:** this is only acceptable if `vitest run` stays deterministic and
  green under parallel load — module-level mutable state must not leak between
  files. Concretely: the `registerGame` registry is populated by idempotent
  side-effect imports (re-running is a no-op), which is promising, but any test
  that mutates a shared singleton (prefs stores, the recording harness) must be
  audited. Measure a full run 3× under `isolate:false`; if any nondeterminism or
  cross-file leak appears, **reject D2** and keep isolation. Record the verdict
  either way (this is the kind of framework-adjacent change the project rejects
  without evidence).

- **D3 — Optional fast/heavy split.** A second vitest project could carry the
  byte-match differentials + multi-seed generator loops, run by a pre-push hook
  (or future CI), leaving the pre-commit to the fast unit/render/persistence
  tiers. This is the biggest potential win but the biggest risk: the
  differentials are the strongest correctness bar, so moving them off the
  per-commit path is only acceptable if pre-push reliably runs before code
  leaves the machine. Given trunk-based local-only workflow today, **default to
  NOT splitting** unless D1+D2 prove insufficient; if pursued, the heavy tier
  must still be a blocking gate somewhere before push, never opt-in.

## Risks / Trade-offs

- `isolate: false` reintroducing flakiness (the exact class
  `investigate-test-flakiness` fixed) → mitigated by the measure-3×-or-reject
  rule (D2).
- Parallel gate steps interleaving output → cosmetic; capture each branch's log
  and print on failure.
- A fast/heavy split letting a differential regression reach a commit → avoided
  by defaulting against the split (D3).

## Migration Plan

Land D1 first (safe, standalone). Evaluate D2 with measurements; apply only the
safe subset. Treat D3 as a documented option, not a default.

## Open Questions

- Does `isolate: false` hold determinism across all 169 files? (Answer with
  measurement during implementation.)
- Is a pre-push hook acceptable to the owner as the home for a heavy tier, or
  should everything stay on pre-commit? (Owner decision if D3 is pursued.)
