# repo-layout — delta

## ADDED Requirements

### Requirement: The test suite's strength is audited, not assumed

The repository SHALL periodically measure whether its tests would actually catch
a regression — not merely whether they execute the code — by mutation-testing the
shared engine and triaging the survivors.

Line coverage cannot answer this. The suite executes the solvers heavily, so
every deduction rung *runs*; the question is whether a rung returning the wrong
answer would be *noticed*. That distinction is load-bearing here, because the
project's entire post-C safety argument is that the per-game differentials are
the net for refactoring — and a frozen desc-level fixture says nothing about
coverage of the deduction paths that produced the desc.

The audit SHALL NOT be a gate and its score SHALL NOT be ratcheted. Mutation
testing re-runs the covering tests per mutant, and the gate's wall-clock is
explicitly defended; a score that invites maximising also invites tests written
against mutants rather than against behaviour. The deliverable is a **triaged
survivor list**, each classified as a missing assertion, a genuinely unreachable
branch, or an equivalent mutant.

The harness SHALL be sanity-checked before its results are trusted, by
introducing a deliberate bug and confirming the suite catches it. An audit that
reports a high score because the tests never ran is the same failure it exists to
detect — and this project has already produced two instruments that passed while
measuring nothing (a complexity ratchet that hid its own suppressions, and a lint
config that manufactured 35 phantom findings).

Where survivors cluster SHALL be reported, because that is the transferable
result: survivors concentrated in code the differentials are supposed to protect
mean the fixture net is thinner than believed, which changes how a later refactor
may justify itself as a no-op.

#### Scenario: A refactor is justified by an unmoved fixture

- **WHEN** a change argues it is behaviour-preserving because a differential
  fixture did not move
- **THEN** that argument is only as strong as the fixture's measured coverage of
  the paths the change touched
- **AND** where the audit has shown that coverage to be thin, the change adds a
  direct assertion rather than relying on the fixture alone

#### Scenario: A snapshot's paired assertions are not load-bearing

- **WHEN** the audit finds surviving mutants in a render path protected only by a
  snapshot
- **THEN** the targeted assertions that snapshot is required to be paired with are
  strengthened
- **BECAUSE** a snapshot alone can be re-baselined with `vitest -u` and the
  guarantee silently lost

#### Scenario: A shared module's semantics are pinned only by a distant consumer

- **WHEN** a mutant in a shared engine module survives that module's own test file
  and is killed only by a game's tests or a frozen differential
- **THEN** an assertion is added to the module's own test file, naming the
  behaviour rather than the mutant
- **BECAUSE** coverage several layers away is adequate as *protection* and poor as
  *feedback*: it makes the repository's own test-run economy — run just the
  relevant test files, let the commit hook be the single full run — systematically
  misleading while engine code is being changed, which is the one situation where
  it is most relied on

#### Scenario: An audit instrument reports a count

- **WHEN** a measuring script counts violations of a stated rule
- **THEN** its unit of measurement SHALL be checked against the unit the rule is
  about before its count is believed or acted on
- **BECAUSE** the snapshot-pairing check reported six violations measured per
  `it(...)` block and zero measured per `describe(...)` — all six phantom, and the
  per-test unit was not the more conservative reading but simply the wrong one.
  A stricter unit does not make a check safer; it makes it wrong in the other
  direction
