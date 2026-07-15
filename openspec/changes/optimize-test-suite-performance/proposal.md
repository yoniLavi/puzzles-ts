# Optimize the pre-commit gate / test-suite wall-clock

## Why

The pre-commit gate (`tsc -b --noEmit` → `biome lint` → `vitest run` →
`vite build`) now takes **~140s wall** and grows with every port. Measured on
an 8-core dev box at 169 test files / 2750 tests:

- `vitest run`: **86.6s** wall (of which `import` 34.7s + `transform` 14.7s ≈
  **50s is module-load overhead** re-paid per file under default per-file
  isolation; `tests` is 402s cumulative across workers).
- `vite build`: **41s** wall — and it is **independent** of `vitest` (neither
  consumes the other's output), yet the gate runs them sequentially.
- `tsc` + `biome`: a few seconds each.

The cost is felt three ways: it exceeds an agent's default 2-minute command
budget (so every commit must be babysat), it lengthens every human commit, and
its dominant term (`tests` cumulative) scales linearly as the remaining games
(loopy, map, pearl, rect) land — each adding heavy seed-deterministic
generator/solver suites. This is a growing tax on the one gate this fork has
(no CI is wired), so it is worth a deliberate optimization pass rather than
another drive-by.

## What Changes

- **Parallelize the independent gate steps (safe, immediate win).** Run
  `vite build` concurrently with `vitest run` (they share no inputs/outputs),
  so the gate's wall-clock becomes roughly `max(vitest, build)` instead of
  their sum — ~41s off the critical path with zero change to what is verified.
  Keep `tsc`/`biome` as the fast fail-fast prefix. Fail the commit if either
  parallel branch fails, preserving today's blocking semantics.
- **Cut vitest's ~50s module-load overhead (evaluate, then apply the safe
  subset).** Investigate `pool`/`isolate`/`poolOptions` tuning (e.g.
  `isolate: false` or a shared module registry within a worker) to stop
  re-importing the module graph per file. This is gated on **proving the
  determinism requirement still holds** (`repo-layout`: "The test suite is
  deterministic under parallel load") — module-level state (the game
  `registerGame` registry, any singletons) must be leak-free under the chosen
  pool, or the change is rejected. Measure before/after and keep only what is
  provably safe.
- **Optionally split a "heavy" vitest project** (the byte-match differentials
  and multi-seed generator/solver loops) from the "fast" unit/render tiers, so
  a future pre-push hook or CI runs the heavy tier while the pre-commit runs the
  fast tier — **only if** a fast/heavy split can be drawn without weakening the
  always-green correctness bar (the differentials are the strongest check we
  have; they must still run on every change that could affect a
  generator/solver). Left as a design decision, not a commitment.

## Impact

- Affected specs: **`build-pipeline`** (a new pre-commit-gate performance
  requirement); it references, and must preserve, the existing `repo-layout`
  "test suite is deterministic under parallel load" requirement.
- Affected code: `.husky/pre-commit` (orchestration), `vitest.config.ts` (pool
  tuning if proven safe), possibly a second vitest project config.
- **Non-negotiable invariants preserved:** the gate stays blocking; `vite build`
  stays in the gate (it caught two prod-only regressions); the suite stays
  deterministic under parallel load; no correctness check is dropped to buy
  speed.
