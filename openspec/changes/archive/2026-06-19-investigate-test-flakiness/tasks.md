# Tasks: Reproduce and fix the flaky generator test

## 1. Reproduce
- [x] 1.1 Loop the full suite under load until it fails (e.g. run
  `npx vitest run` N times, or stress with `--no-file-parallelism` off and CPU
  busy), capturing the failing test, assertion, params, and seed.
  - **Found**: no explicit-assertion failure — the class is **timeout**. Under
    natural full-suite contention the two Sixteen two-swap-BFS tests reached
    **5.4s** (passing only because they already carry an explicit 60s timeout);
    the unprotected heavy generator/solver tests ride the **default 5000ms**
    timeout at 1–2.1s solo-in-suite and cross 5s at the ~5–10× wall-clock
    multiplier a saturated 16-worker CI box adds (the proposal cites a ~3s BFS
    "seen >29s"). No external CPU stressor was needed to surface the mechanism.
- [x] 1.2 Determine the class: re-run the captured seed/params **in isolation**.
  Passes alone ⇒ timeout/contention; fails alone ⇒ logic. Record which.
  - **timeout/contention**, not logic. Every flaky test drives generation from a
    **fixed seed** (`randomNew("…")`), so the board and the pass/fail verdict are
    identical every run — only the wall clock varies with load. Confirmed: each
    passes in isolation and the asserted result never changes.

## 2. Root-cause
- [x] 2.1 timeout/contention: measured the slow tests' worst-case wall time and
  confirmed it crosses the default timeout only under saturation. The work is
  **deterministic and bounded** per fixed seed; the default 5s is simply too
  tight to absorb scheduling jitter for legitimately-heavy combinatorial tests.
  Unprotected heavy set (no explicit timeout, ride 5s default): `filling` 17×13
  (~1.2s), `range` generator (~1.0s), `untangle-hint` aux n=25 (~0.7–0.8s),
  `flood-solver` 16×16c6 (~0.65s), `sixteen-midend` two-swap (~3.4s — *already*
  had `timeout: 60_000`), and two `sixteen` hint tests (~0.53–0.57s). Already
  protected: `palisade`/`dsf` (`30000`), `sixteen` two-swap (`60000`).
- [x] 2.2 logic — N/A (no board was mis-graded; no seed reproduced a failure).
- [x] 2.3 shared state — N/A (no cross-test mutable leak; fixed-seed RNG per test).

## 3. Fix
- [x] 3.1 Applied the cause-appropriate fix: a **targeted explicit timeout** on
  each unprotected heavy, seed-deterministic test (`30_000` for generator/solver
  loops; the ~MillionState BFS already at `60_000`). Per-test, **not** a global
  `testTimeout` bump — the ~1400 fast tests keep the tight 5s default, preserving
  their regression sensitivity. The timeout cannot mask a regression because
  correctness is asserted by the *result* (a wrong board fails an assertion), not
  by the clock. No wall-clock assertions remained to convert (the Sixteen ones
  were already replaced with the `__lastHintEngagedFallback()` proxy in `a3fc2dd`).
  Files: `filling/filling.test.ts`, `range/range-solver.test.ts`,
  `untangle/untangle-hint.test.ts` (describe-level), `flood/flood-solver.test.ts`,
  `sixteen/sixteen.test.ts` (two hint tests).
- [x] 3.2 Re-ran to confirm: full suite green; the affected files green; and a
  `--testTimeout=50` run of the protected files still passes (proving each
  explicit timeout overrides the global and the fast tests finish <50ms).

## 4. Guard
- [x] 4.1 `repo-layout` spec delta: the full suite is deterministic; heavy
  generator tests are bounded + seed-deterministic; no elapsed-time assertions.
- [x] 4.2 Recorded the determinism rules + the repro recipe in the port playbook
  (live wiki) — `docs/porting/game-port-playbook.md` §4.
- [x] 4.3 Full gate green (tsc + biome + vitest 1407 + vite build); owner-accepted; archived.
