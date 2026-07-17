## Context

Two Sixteen hint tests failed a green commit at load ~32 on 8 cores, both
passing in isolation. They were the third generation of the same bug: their
ceiling had gone 30s → 60s → 120s, each bump a fresh guess at how much CPU
contention to absorb, each outlived by the growing suite.

## Goals / Non-Goals

- Goals: no correct test ever fails for elapsed time; one knob instead of 39;
  the spec says what we actually do.
- Non-Goals: making the heavy searches faster (Sixteen's exact bidirectional BFS
  over ~1.5M states is the algorithm under test — its cost is the point of the
  regression guard); removing timeouts entirely (a runaway async test should
  still end).

## Decisions

- **D1 — One 600s ceiling; zero per-test timeouts.** 39 of them existed, and
  every comment on them said the same thing: absorb contention. None was a
  meaningful fast bound, so none was load-bearing on correctness — each of those
  tests already asserts a deterministic proxy (`hintCalls === 1`,
  `__lastHintEngagedFallback()`, a solved board). A per-test ceiling is strictly
  worse than the global one: it can only be *tighter*, it is invisible from the
  config, and it must be re-guessed whenever the suite grows.

  600s is ~3.5x the worst observed loaded runtime (172s at load ~32). It costs
  nothing when tests pass.

- **D2 — The playbook's argument for per-test timeouts had already expired.**
  §5.2 justified them with "the ~1400 fast tests keep the tight 5s default,
  preserving their regression sensitivity" — but `vitest.config.ts` had set a 60s
  global long before, so nothing ran on 5s. The doc described a policy the repo
  had stopped following; it is rewritten here rather than left to mislead.

- **D3 — The timeout was never the hang guard it looked like.** These tests are
  synchronous. A runaway loop blocks the event loop, so the timeout's
  `setTimeout` cannot fire — the very mechanism that lets workers orphan
  (`prevent-orphaned-test-workers`). So a generous ceiling gives up almost no
  safety: real non-termination is caught by `engine/retry-limit.ts` (generator
  retries) and `engine/step-budget.ts` (solver/hint fixpoints), both of which
  throw in milliseconds. What the ceiling still buys is ending a runaway *async*
  test, which is why it is not simply removed.

- **D4 — `gate.sh` loses the adaptive load probe.** It was introduced because a
  concurrent `vite build` oversubscribed the box and starved tests *past their
  timeouts*. That is now impossible by construction, so the probe protects
  against nothing — while costing the build's wall-clock on every commit, since a
  deliberately-busy box reads "busy" nearly always. vitest and vite build share
  no inputs or outputs; they now always run concurrently.

- **D5 — Amend the spec rather than contradict it.** The requirement said "not
  papered over with a blanket timeout increase", which is exactly what D1 does.
  Rather than quietly violate it, the clause is rewritten: the distinction that
  matters is not blanket-vs-per-test but *what the diagnosis is*. Contention on
  terminating work → remove the clock gate. Shared state, order dependence, a
  logic edge case, or non-termination → fix that, and a timeout was never going
  to catch the last one anyway. The requirement keeps every other tooth.

## Risks / Trade-offs

- **A timeout no longer acts as an incidental perf canary.** Accepted: that
  signal is worthless under variable load (it measures spare capacity), which is
  why the same requirement already forbids asserting elapsed time and demands a
  deterministic proxy. A perf regression is caught by a proxy assertion or not at
  all.
- **A genuinely hung async test now takes 600s to fail** instead of 30s. Rare,
  and cheap next to rejecting good commits on a busy box.
- **Always-concurrent gate oversubscribes a saturated box.** Wall-clock is
  bounded below by the work either way, and nothing fails from being slow now.
  Measured green at load ~18 with the build concurrent.
