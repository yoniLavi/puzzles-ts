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

## Implementation outcome (finalized)

Measured on an 8-core box carrying heavy, persistent external load (a stuck
background process pair pinning ~2 cores) — an adversarial but informative
condition.

- **D2 (`isolate: false`) — SHIPPED, the headline win.** Full run ~180s → ~60s
  (`import` 74s → 22s: the default `forks` pool re-paid the module graph's
  import+transform per file, 169×). It also *removed* the baseline's 3
  load-induced timeout failures (re-importing per file was itself starving the
  heavy tests). Determinism proven green 3× under `sequence.shuffle.files`.
  - **Cross-file leak found + fixed:** the `registerGame` registry (module-level
    Maps, shared across a worker's files under `isolate: false`). `registerGame`
    is now idempotent on the same game instance; `games/index.ts` exposes a
    re-runnable `registerAllGames()`; `worker-adapter.test.ts` (the only mutator)
    restores it in `afterAll`; the four registry-reading files re-ensure it in
    `beforeAll`. A forced worst-case ordering failed pre-fix, passes post-fix.
  - `npm run test:shuffle` added as the durable detector for future leaks.

- **D1 (parallel build) — SHIPPED as ADAPTIVE concurrency (owner-endorsed).**
  Unconditional concurrency proved *not reliable*: on a loaded box the all-core
  `vite build` oversubscribes CPU/memory and starves vitest's heaviest
  seed-deterministic tests past their 60s timeout (reproduced repeatedly — the
  same suite ran green when the build was serialised, even at load 85). A
  reliable blocking gate is the non-negotiable, so the gate probes 1-minute load
  and only parallelises with ≥1 core of headroom, else runs the build after
  vitest. Idle boxes get the ~40s win; loaded boxes stay green; the serial
  fallback makes a bad probe cost only the speedup. Orchestration centralised in
  `scripts/gate.sh` (shared by the hook and `npm run gate`).

- **Heavy-test boundedness — done (enabler for D1, and a pre-existing
  `repo-layout` requirement).** The two slowest tests violated "bounded so
  worst-case wall time stays within the timeout even when saturated":
  `netslide-hint` now shares one lazily-computed hint corpus across its
  structural-narration tests (~100 planner calls → ~18; 43s → ~22s isolated),
  and `dsf`'s n-independent brute-force parity test was right-sized 24/60 →
  16/40. Both remove redundant re-execution of deterministic checks — no
  correctness coverage dropped.

- **D3 (fast/heavy split) — NOT pursued.** D2 + the right-sizing reached ~60s
  green under load with every check still on the per-commit path; a split would
  weaken the always-green bar for no remaining need.
