# build-pipeline Specification Delta — refile-misplaced-artefacts

## MODIFIED Requirements

### Requirement: Refactoring metrics are measured on demand and ratcheted in the gate

The repository SHALL provide an on-demand metrics harness (`npm run metrics`,
orchestrated by `scripts/metrics.sh`) that records code-health measurements —
duplication, import cycles, dead code, and cognitive complexity — as raw tool
output, committed to the repository.

A **round's** dated snapshot SHALL be committed under the openspec change that
produced it, and SHALL travel into the archive with that change. A snapshot is
evidence for a piece of work, not a standing repository artefact: its value is
the diff between rounds, that diff is read once by the change that ordered the
measurement, and it cannot be regenerated afterwards because it measures a tree
that no longer exists. The same reasoning files an audit's findings under its
change, and filed `retire-c-engine`'s unbuildable C reference sources under the
changes that read them.

A top-level `metrics/` directory SHALL hold only **live instruments** — output
that something still reads. Currently that is `metrics/mutation/report.json`,
read by `docs/test-strength.md`. A finished round's output left at the root reads
as current measurement of the current tree, which is precisely what it is not.

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

A snapshot SHALL be accompanied by a note recording that it cannot be
regenerated, so that a later reader treats a stale number as a historical
measurement rather than trying to refresh it.

#### Scenario: A refactoring round records its baseline

- **WHEN** a change orders a metrics round
- **THEN** `npm run metrics` writes the raw tool output and a summary
- **AND** the snapshot is committed under that change's directory, not at the
  repository root

#### Scenario: A finished round's snapshot is not left at the root

- **WHEN** a round's work is archived
- **THEN** its dated snapshot is archived with it
- **AND** the top-level `metrics/` directory contains only output that something
  still reads

#### Scenario: The metrics harness is not in the gate

- **WHEN** a commit is made
- **THEN** the pre-commit gate does not run the metrics harness
- **AND** the round-over-round diff remains the harness's purpose
