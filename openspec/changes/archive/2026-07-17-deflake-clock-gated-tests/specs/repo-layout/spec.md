# repo-layout Specification (delta)

## MODIFIED Requirements

### Requirement: The test suite is deterministic under parallel load

The full `vitest run` SHALL pass deterministically — a test SHALL NOT fail as a
function of execution order, worker scheduling, or CPU contention. In particular,
heavy generator/solver tests (which loop until a uniquely-solvable board is
produced) SHALL be **seed-deterministic** (a fixed seed always produces the same
board and verdict); a generator's retry loop SHALL have a finite iteration cap
rather than relying on probabilistic termination within a timeout.

A test SHALL NOT assert on **elapsed wall-clock time** (e.g. "completes in < N
ms") as a proxy for an algorithm being efficient, because elapsed time under a
saturated box measures spare capacity, not the code. Such a property SHALL be
asserted via a **deterministic proxy** instead — a bounded node/expansion count,
iteration count, or result shape — that is identical regardless of machine load.

**A test timeout is a runaway backstop, not a gate.** The development box runs
deliberately busy, so an otherwise-good commit SHALL NOT be rejected merely
because work took long. Therefore:

- There SHALL be exactly **one** generous ceiling, `testTimeout`/`hookTimeout` in
  `vitest.config.ts`, sized far clear of the worst loaded runtime. Individual
  tests SHALL NOT set their own timeout: a per-test ceiling is a guess about
  contention, it is invisibly *tighter* than the global one, and maintaining ~39
  such guesses meant each one silently became a flake as the suite grew.
- Raising or removing a clock gate IS the correct fix when the diagnosis is
  **contention on work that terminates** — it is not "papering over". What would
  paper over a defect is leaving the gate in place and re-guessing its constant,
  which is how a 30s ceiling became 60s, then 120s, and still failed a green
  commit at load ~32.
- A timeout SHALL NOT be relied on to catch a runaway loop: this suite is
  synchronous, so a runaway blocks the event loop and the timeout's `setTimeout`
  cannot fire (the same mechanism that orphans workers). Non-termination SHALL be
  bounded where it can be caught — `engine/retry-limit.ts` for generator retries,
  `engine/step-budget.ts` for solver/hint fixpoints.

A failure observed only under full-suite load SHALL still be **root-caused**, not
dismissed as "flaky" — a non-deterministic gate cannot distinguish a real
regression from noise. Root-causing means identifying *which* cause applies:
contention on terminating work (remove the clock gate), shared state or order
dependence (fix the leak), a logic edge case (fix the code), or genuine
non-termination (bound it in code per the clause above).

#### Scenario: A generator test gives the same verdict every run

- **WHEN** a generator/solver test runs with a fixed seed, alone or inside the
  full parallel suite
- **THEN** it produces the same board and the same pass/fail verdict, regardless
  of how many other tests run concurrently

#### Scenario: Efficiency is asserted by a proxy, not by elapsed time

- **WHEN** a test wants to assert an algorithm (e.g. a hint planner's search) is
  efficient
- **THEN** it asserts a load-independent proxy (bounded expansions / iterations /
  result shape), not that it finished within a wall-clock millisecond budget

#### Scenario: A correct-but-slow test survives a saturated box

- **WHEN** a test whose work terminates and whose assertions are deterministic
  runs while the machine is heavily loaded, taking many times its solo runtime
- **THEN** it still passes, because no per-test clock gate stands between it and
  its assertions — only the single generous ceiling, which is sized for runaway
  work rather than for contention

#### Scenario: A load-only failure is investigated, not ignored

- **WHEN** a test fails during a full `vitest run` but passes in isolation
- **THEN** its cause is identified — contention, shared state, order dependence,
  a logic edge case, or non-termination — and fixed at that cause
- **AND** where the cause is contention on terminating work, the fix is to stop
  gating that test on the clock, never to re-guess a per-test constant
