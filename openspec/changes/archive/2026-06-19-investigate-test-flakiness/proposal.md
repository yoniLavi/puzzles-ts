# Proposal: Reproduce and fix the flaky generator test

**Status**: Proposed

## Why

During the `add-singles-hint` gate (2026-06-19), the full `vitest run` failed
intermittently — first once on a **Filling** generator test, and on a later run
**7 tests across 6 files** at once, all of which **passed cleanly in isolation**.
The change under test touched only `singles/` + a doc, so these are
**pre-existing** load-induced failures, not regressions. Crucially, the failing
set reveals a *class*, not one bad test:

- **Wall-clock assertions** — `sixteen.test.ts` "hints **fast** from the forward
  search", `untangle-hint.test.ts` "prefers the aux plan…" (a ~6s perf-shaped
  test). Asserting elapsed *milliseconds* is inherently flaky: under 16-worker
  CPU saturation the same code takes 5–10× longer, so the threshold trips with
  no logic change. **A time-based assertion is itself the smell.**
- **Generator timeouts** — `filling.test.ts` "generates uniquely solvable 17×13
  boards" (~9.6s): a retry-until-unique loop whose worst case crosses the
  default test timeout only when every core is busy.

A non-deterministic suite is corrosive: it erodes trust in the pre-commit gate
(the very gate that exists because "green suite ≠ parity"), and a *real*
regression hides behind a shrug of "probably the flake." We should reproduce the
class deterministically, root-cause each, and fix the tests or the code.

## What Changes

- **Reproduce deterministically.** Run the suite (or just the Filling generator
  suite) under load repeatedly until it fails, capturing the exact assertion,
  seed, params, and whether it was a timeout (`vitest`/hook timeout under
  contention) or a genuine assertion failure (a generated board the TS solver
  judged not-uniquely-solvable). Pin down which: re-running in isolation passing
  points at a **timeout / resource-contention** cause; a stable seed failing
  points at a **logic** cause (a generator/solver edge case the parallel run's
  scheduling happened to hit first).
- **Root-cause.** Likely candidates, to confirm not assume: (a) a generator
  retry loop that occasionally exceeds the default per-test timeout under full
  CPU saturation (16 workers on a busy machine); (b) shared mutable state across
  tests in one file; (c) a genuine rare generator/solver disagreement. The
  investigation reports which, with evidence (a probe, not a guess — the method
  lesson from the hint sessions).
- **Fix the cause, not the symptom.** **Replace wall-clock assertions with
  deterministic proxies** — a hint planner should assert it explores ≤ N node
  expansions / returns a plan of the expected shape, *not* that it finished in
  < N ms (which measures the CI box's spare capacity, not the code). For
  generator timeouts: cap the generator's worst-case iterations and/or reduce
  per-case work (fewer seeds, or split), *not* a blanket suite-wide timeout bump
  that masks slow regressions. If a genuine logic edge case surfaces: fix the
  code and add the failing seed as a regression fixture. If pure contention:
  consider bounded concurrency for the heaviest suites.
- **Guard against recurrence.** Add the determinism expectation to the
  test-discipline spec so future heavy generator tests are written bounded and
  seed-deterministic, and record the repro recipe in the
  [port playbook](../../docs/porting/game-port-playbook.md) so the next person
  who hits a generator flake has the loop ready.

## Impact

- **Affected specs:** `repo-layout` (ADDED: the full suite is deterministic —
  no order/load-dependent failures; heavy generator tests are bounded and
  seed-deterministic).
- **Affected code:** the observed flaky set —
  `src/native/games/sixteen/sixteen.test.ts` and
  `untangle/untangle-hint.test.ts` (replace wall-clock assertions with
  expansion-count/shape proxies), `filling/filling.test.ts` (generator
  timeout/seed-count tuning or a regression fixture), and possibly the
  generators themselves (an iteration cap). Scoped by what the repro shows; no
  product behaviour change expected.
- **Priority:** low-urgency, high-value-for-trust. Not blocking the Singles hint
  or port acceptance; do it before the flake trains anyone to ignore a red gate.

## Out of scope

- A wholesale audit of every game's generator timeouts. Fix the one that
  actually flaked; generalise only the *written* guidance, not a speculative
  refactor of suites that aren't failing.
