# build-pipeline — delta

## ADDED Requirements

### Requirement: The commit gate's cost is proportional to what it protects

The pre-commit gate SHALL be kept affordable per commit, and a test that costs a
large share of it SHALL justify that share by what it would catch. A test whose
cost is dominated by *more of the same* — a larger board, additional seeds beyond
the point of detection — SHALL be reduced or moved to the opt-in tier, not left
to be paid on every commit.

The measurement that motivates this: five files were **66% of all test time**, and
about ten individual tests were **54%** — one property test alone was 20% of the
whole suite.

Three treatments are permitted, in order of preference, because they lose
different amounts:

1. **Short-circuit a deterministic search.** Where a test scans generated boards
   to find one exhibiting a case, the pair it finds is deterministic and MAY be
   recorded so the scan starts there. This loses **nothing** — the same board is
   returned — and correctness MUST NOT depend on the recorded value being current:
   a stale pin falls back to the full scan.
2. **Reduce a confidence dial.** Where a seed count expresses "how many boards do
   we scan", it MAY be reduced for the gate provided the property is one a
   violation of which would be *systematic* rather than rare, and provided the
   remaining scan still exercises the assertion many times. The change SHALL
   state that count.
3. **Defer to the opt-in tier** (`npm run test:slow`). Reserved for cases where
   the cost is board *size* rather than configuration.

A test SHALL NOT be deferred when it is the only one covering some configuration.
Deferring the largest board of a family whose every mode, difficulty and grid type
is checked by smaller fixtures costs the gate nothing it relied on; deferring the
only fixture for a grid type silently removes that grid type from every commit.
The remaining coverage SHALL be stated where the deferral is made.

The opt-in tier SHALL be run as part of a refactoring round, alongside
`npm run metrics`. A tier nobody ever runs is worse than a deleted test, because
the file still reads as coverage.

#### Scenario: A test is made cheaper

- **WHEN** a test's cost is reduced by any of the three treatments
- **THEN** it is verified to still discriminate — by breaking the code it covers
  and confirming it fails
- **BECAUSE** the failure this optimisation most easily causes is a test that
  still passes, still reads as coverage, and no longer catches anything

#### Scenario: A differential fixture is deferred

- **WHEN** the largest board of a game's frozen differential is moved to the
  opt-in tier
- **THEN** every mode, difficulty and grid type it carried is still asserted on
  every commit by the smaller fixtures, and that is stated at the call site
- **BECAUSE** the differentials are the refactoring net: a refactor that changes a
  solver's verdict must still change a desc the gate checks
