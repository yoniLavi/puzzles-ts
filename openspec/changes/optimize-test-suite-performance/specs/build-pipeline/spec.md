# build-pipeline Specification (delta)

## ADDED Requirements

### Requirement: The pre-commit gate minimises wall-clock without dropping checks

The pre-commit gate SHALL run all four checks (`tsc -b --noEmit`, `biome lint`,
`vitest run`, `vite build`) and block a commit on any failure, while being
orchestrated to reduce wall-clock: the fast checks (`tsc` then `biome`) run
first as a fail-fast prefix, and the two heavy, mutually-independent checks
(`vitest run` and `vite build`, which share no inputs or outputs) SHALL run
concurrently, with the gate failing if either fails. No correctness check may be removed, weakened, sampled, or moved
off the per-commit path to buy speed, and `vite build` SHALL remain in the gate
(it is the only step that exercises the production build, where two prod-only
regressions have shipped undetected). Any vitest pool/isolation tuning adopted
to reduce per-file module-load overhead SHALL preserve the `repo-layout`
requirement that "the test suite is deterministic under parallel load" —
verified by a green full run repeated under the new configuration — or be
reverted.

#### Scenario: Independent heavy steps run concurrently

- **WHEN** the pre-commit gate runs after `tsc` and `biome` pass
- **THEN** `vitest run` and `vite build` execute concurrently
- **AND** the commit is rejected if either the tests or the production build
  fails

#### Scenario: A speed change never weakens the gate

- **WHEN** a pool/isolation setting is changed to speed up `vitest run`
- **THEN** the full suite is shown to remain green and deterministic under the
  new setting
- **AND** if it does not, the setting is reverted rather than shipped
