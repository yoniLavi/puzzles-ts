## ADDED Requirements

### Requirement: The test suite is deterministic under parallel load

The full `vitest run` SHALL pass deterministically — a test SHALL NOT fail as a
function of execution order, worker scheduling, or CPU contention. In particular,
heavy generator/solver tests (which loop until a uniquely-solvable board is
produced) SHALL be **seed-deterministic** (a fixed seed always produces the same
board and verdict) and **bounded** so their worst-case wall time stays within the
test timeout even when every worker is saturated; a generator's retry loop SHALL
have a finite iteration cap rather than relying on probabilistic termination
within a timeout.

A test SHALL NOT assert on **elapsed wall-clock time** (e.g. "completes in < N
ms") as a proxy for an algorithm being efficient, because elapsed time under a
saturated CI box measures spare capacity, not the code. Such a property SHALL be
asserted via a **deterministic proxy** instead — a bounded node/expansion count,
iteration count, or result shape — that is identical regardless of machine load.

A failure observed only under full-suite load SHALL be root-caused and fixed (the
test or the code), not dismissed as "flaky" — a non-deterministic gate cannot
distinguish a real regression from noise.

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

#### Scenario: A load-only failure is investigated, not ignored

- **WHEN** a test fails during a full `vitest run` but passes in isolation
- **THEN** it is reproduced deterministically and the root cause (timeout,
  contention, shared state, or a logic edge case) is fixed — not papered over
  with a blanket timeout increase
