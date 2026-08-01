# build-pipeline — delta

## ADDED Requirements

### Requirement: Refactoring metrics are measured on demand and ratcheted in the gate

The repository SHALL provide an on-demand metrics harness (`npm run metrics`,
orchestrated by `scripts/metrics.sh`) that records code-health measurements —
duplication, import cycles, dead code, and cognitive complexity — as raw tool
output under a dated `metrics/` directory, committed to the repository.

The harness SHALL NOT be part of the pre-commit gate or of CI's blocking checks.
Its value is the **diff between rounds**, not per-commit freshness, and adding a
slow whole-tree scan to a gate that is explicitly optimised for wall-clock would
buy nothing.

Cognitive complexity SHALL be obtained from Biome's
`complexity/noExcessiveCognitiveComplexity`, which implements the published
Sonar algorithm already available in the installed linter. A second lint
toolchain SHALL NOT be added to compute it.

Where a metric is enforced rather than merely recorded, its threshold SHALL be a
**ratchet** — set to the value the tree currently achieves, and lowered only by a
change that does the work to earn the lower value. A threshold SHALL NOT be set
to an aspiration, because a gate that fails on work in progress is a gate that
gets disabled.

A function exceeding the complexity ratchet SHALL be suppressed individually
with a stated reason rather than accommodated by raising the threshold, so that
the suppression list remains the work queue and the threshold keeps measuring
something.

#### Scenario: A refactoring round is attributed to its intervention

- **WHEN** a refactoring change completes and re-runs `npm run metrics`
- **THEN** a new dated snapshot is committed alongside the previous one
- **AND** the change can state which measurement moved and by how much, rather
  than asserting an improvement

#### Scenario: A new function may not be worse than the worst existing one

- **WHEN** a commit introduces a function whose cognitive complexity exceeds the
  configured ratchet
- **THEN** the biome step of the gate fails and the commit is blocked
- **AND** the author either simplifies the function or adds an individual
  suppression with a reason — but does not raise the threshold

#### Scenario: A saturating instrument is not trusted as a maximum

- **WHEN** the complexity tool reports an identical extreme score for several
  unrelated functions
- **THEN** that value is treated as a saturation bound ("≥ N") and recorded as
  such, not as a measured maximum
- **BECAUSE** an instrument that silently saturates will report no regression
  when the worst function gets worse
