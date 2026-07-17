## MODIFIED Requirements

### Requirement: Continuous integration runs the full gate on push to main

The repository SHALL provide a GitHub Actions workflow that, on every push to
`main`, runs the same gate as the husky pre-commit hook: `build:wasm` followed by
`npm run gate` (`tsc -b --noEmit` → `biome ci` → `vitest run` → `vite build`).
Because the typecheck, tests, and production build all import generated artifacts
from `src/assets/puzzles/` (`catalog.json`, `emcc-runtime`), the workflow SHALL
ensure those assets are present before the gate — there is no valid asset-free CI
tier (a no-asset job fails at `tsc -b`). When it must build them it SHALL provision
the wasm toolchain (Emscripten via an emsdk action pinned to the Brewfile's
version, plus the `halibut`/`jq`/`cmake` system packages) so the build runs from a
clean checkout. The assets MAY be restored from a cache keyed on the wasm inputs
(the `puzzles/**` sources, the build script, and the emscripten version) rather
than rebuilt every run, skipping the toolchain steps on a cache hit; the cache key
SHALL bust whenever any of those inputs changes, so a stale build is never served.

The project is trunk-based (no pull-request flow), so the gate runs post-push on
`main` rather than pre-merge; a `pull_request` trigger MAY be added later if a
contributor PR flow is adopted. This closes the single-point-of-failure gap where
the pre-commit hook was the only gate (a `--no-verify` commit or a clone whose
hooks never installed could land breakage on `main` undetected).

#### Scenario: A push to main is gated

- **WHEN** a commit is pushed to `main` (including one made with `--no-verify`)
- **THEN** the CI workflow builds the wasm assets and runs typecheck, lint,
  formatting, tests, and the production build, so breakage that bypassed the
  local hook is still surfaced
- **AND** a failure in any stage fails the run

### Requirement: The pre-commit gate minimises wall-clock without dropping checks

The pre-commit gate SHALL run all four checks (`tsc -b --noEmit`, `biome ci`,
`vitest run`, `vite build`) and block a commit on any failure, while being
orchestrated to reduce wall-clock: the fast checks (`tsc` then `biome`) run
first as a fail-fast prefix, and the two heavy, mutually-independent checks
(`vitest run` and `vite build`, which share no inputs or outputs) SHALL run
**concurrently**, making the gate's wall-clock ~max(vitest, build) rather than
their sum.

The gate's biome step SHALL check formatting and import order as well as lint
rules (`biome ci`, the read-only form of `biome check`), so a file that is
lint-clean but unformatted cannot be committed. Gating only `biome lint` left
the tree lint-clean but never format-clean, so the first `biome check --write`
run reformatted ~150 unrelated files and buried the real diff; the fixer command
(`npm run check`) is not a substitute, because nothing requires it to be run.

No correctness check may be removed, weakened, sampled, or moved off the
per-commit path to buy speed, and `vite build` SHALL remain in the gate (it is
the only step that exercises the production build, where two prod-only
regressions have shipped undetected). Any vitest pool/isolation tuning adopted
to reduce per-file module-load overhead SHALL preserve the `repo-layout`
requirement that "the test suite is deterministic under parallel load" —
verified by a green full run repeated under the new configuration (including
under file-order shuffle, which stresses the shared-module-state that
non-isolated pools expose) — or be reverted.

The gate SHALL NOT make its concurrency conditional on machine load. It once
probed the 1-minute load average and serialised on a busy box, because
oversubscription starved timeout-bound tests past their per-test deadlines. That
rationale was retired with the per-test timeouts themselves (one 600s ceiling in
`vitest.config.ts`, no per-test timeouts), so contention now makes a test
*slower*, never *failed* — and the probe only cost time, reading "busy" on a
deliberately-loaded box and putting the build on the critical path against a
danger that no longer exists. Reliability remains the gate's first duty; it is
bought by not gating tests on the clock rather than by hoarding cores.

The gate's orchestration SHALL live in a single script (`scripts/gate.sh`)
invoked by both `.husky/pre-commit` and `npm run gate`, so the hook and the
manual command cannot drift.

#### Scenario: The independent heavy steps run concurrently

- **WHEN** the pre-commit gate runs after `tsc` and `biome` pass
- **THEN** `vitest run` and `vite build` execute concurrently, regardless of
  machine load
- **AND** the commit is rejected if either the tests or the production build
  fails

#### Scenario: An unformatted file is rejected

- **WHEN** a commit contains a file that satisfies every lint rule but is not
  formatted (or has unsorted imports) to the repository's biome configuration
- **THEN** the gate's biome step fails in the fail-fast prefix and the commit is
  blocked, before the heavy checks are spent
- **BECAUSE** an unformatted commit re-opens the drift that makes a later
  `biome check --write` reformat files the author never touched

#### Scenario: A speed change never weakens the gate

- **WHEN** a pool/isolation setting is changed to speed up `vitest run`
- **THEN** the full suite is shown to remain green and deterministic under the
  new setting (repeated runs, including under file-order shuffle)
- **AND** if it does not, the setting is reverted rather than shipped
