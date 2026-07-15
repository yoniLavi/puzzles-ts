# build-pipeline Specification (delta)

## ADDED Requirements

### Requirement: The pre-commit gate minimises wall-clock without dropping checks

The pre-commit gate SHALL run all four checks (`tsc -b --noEmit`, `biome lint`,
`vitest run`, `vite build`) and block a commit on any failure, while being
orchestrated to reduce wall-clock: the fast checks (`tsc` then `biome`) run
first as a fail-fast prefix, and the two heavy, mutually-independent checks
(`vitest run` and `vite build`, which share no inputs or outputs) SHALL run
**concurrently when the machine has spare capacity, and serially otherwise,
never oversubscribing the CPU**. The concurrency decision is a load probe (the
build runs concurrently only when the 1-minute load average leaves at least one
core of headroom); the serial fallback is the safe default, so a misjudged
probe costs at most the parallelism win and never spuriously blocks a commit.
The gate SHALL fail if either heavy check fails, regardless of which branch it
ran in. No correctness check may be removed, weakened, sampled, or moved
off the per-commit path to buy speed, and `vite build` SHALL remain in the gate
(it is the only step that exercises the production build, where two prod-only
regressions have shipped undetected). Any vitest pool/isolation tuning adopted
to reduce per-file module-load overhead SHALL preserve the `repo-layout`
requirement that "the test suite is deterministic under parallel load" —
verified by a green full run repeated under the new configuration (including
under file-order shuffle, which stresses the shared-module-state that
non-isolated pools expose) — or be reverted.

The gate's orchestration SHALL live in a single script (`scripts/gate.sh`)
invoked by both `.husky/pre-commit` and `npm run gate`, so the hook and the
manual command cannot drift.

#### Scenario: Independent heavy steps run concurrently when there is capacity

- **WHEN** the pre-commit gate runs after `tsc` and `biome` pass on a machine
  with spare cores
- **THEN** `vitest run` and `vite build` execute concurrently
- **AND** the commit is rejected if either the tests or the production build
  fails

#### Scenario: A busy machine runs the heavy steps serially rather than flake

- **WHEN** the pre-commit gate runs on an already-loaded machine (the 1-minute
  load average leaves no core of headroom)
- **THEN** `vitest run` runs first and `vite build` runs after it, rather than
  concurrently
- **AND** the gate still rejects the commit if either fails
- **BECAUSE** running the all-core build concurrently on a saturated box
  oversubscribes CPU/memory and starves vitest's timeout-bound tests, and a
  reliable blocking gate outranks the parallel wall-clock win

#### Scenario: A speed change never weakens the gate

- **WHEN** a pool/isolation setting is changed to speed up `vitest run`
- **THEN** the full suite is shown to remain green and deterministic under the
  new setting (repeated runs, including under file-order shuffle)
- **AND** if it does not, the setting is reverted rather than shipped
