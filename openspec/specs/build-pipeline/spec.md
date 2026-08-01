# build-pipeline Specification

## Purpose
TBD - created by archiving change remove-docker-emcc-build. Update Purpose after archive.
## Requirements
### Requirement: Continuous integration runs the full gate on push to main

The repository SHALL provide a GitHub Actions workflow that, on every push to
`main`, runs the same gate as the husky pre-commit hook (`npm run gate`:
`tsc -b --noEmit` → `biome ci` → `vitest run` → `vite build`).

The gate SHALL require **no generated assets**. This reverses the previous
requirement, which stated there was "no valid asset-free CI tier (a no-asset job
fails at `tsc -b`)" — true only while `src/puzzle/{catalog,types,worker}.ts`
imported artifacts produced by the Emscripten build. Since `retire-c-engine` the
catalog is committed source and the types are hand-authored, so a clean checkout
type-checks, tests and builds with nothing generated. The workflow SHALL NOT
provision a wasm toolchain, and SHALL NOT cache generated assets to make the
gate viable.

The workflow SHALL nonetheless build the in-app manual (`npm run build:assets`,
halibut over `puzzles.but`) before the gate. This is not a gate precondition but
a coverage decision: the manual is the only generated asset left, and building it
is what exercises `scripts/build-manual.sh` and the vite manual-page rendering
path, neither of which any test covers.

The project is trunk-based (no pull-request flow), so the gate runs post-push on
`main` rather than pre-merge; a `pull_request` trigger MAY be added later if a
contributor PR flow is adopted. This closes the single-point-of-failure gap where
the pre-commit hook was the only gate (a `--no-verify` commit or a clone whose
hooks never installed could land breakage on `main` undetected).

#### Scenario: A push to main is gated

- **WHEN** a commit is pushed to `main` (including one made with `--no-verify`)
- **THEN** the workflow runs `npm run gate` and fails the run on any gate failure

#### Scenario: The gate runs without generated assets

- **WHEN** the workflow runs on a clean checkout
- **THEN** no wasm toolchain is provisioned and no asset cache is consulted
- **AND** the typecheck, tests and production build all succeed

### Requirement: The pre-commit gate minimises wall-clock without dropping checks

The pre-commit gate SHALL run all four checks (`tsc -b --noEmit`, biome,
`vitest run`, `vite build`) and block a commit on any failure, while being
orchestrated to reduce wall-clock: the fast checks (`tsc` then biome) run
first as a fail-fast prefix, and the two heavy, mutually-independent checks
(`vitest run` and `vite build`, which share no inputs or outputs) SHALL run
**concurrently**, making the gate's wall-clock ~max(vitest, build) rather than
their sum.

The gate's biome step SHALL check formatting and import order as well as lint
rules (the read-only form of `biome check`), so a file that is lint-clean but
unformatted cannot be committed. Gating only `biome lint` left the tree
lint-clean but never format-clean, so the first `biome check --write` run
reformatted ~150 unrelated files and buried the real diff; the fixer command
(`npm run check`) is not a substitute, because nothing requires it to be run.

The biome step SHALL be scoped by role, since a commit can only make a file
unformatted by touching it:

- The **automatic per-commit hook** SHALL check only the staged files
  (`biome check --staged`), so it inspects exactly the files the commit
  introduces and does no redundant work on an already-clean tree.
- **CI and the manual `npm run gate`** SHALL check the whole tree (`biome ci`)
  as the backstop. This is deliberate and SHALL NOT be scoped down: CI is the
  only gate a `--no-verify` commit passes through, and the whole-tree pass is
  also what forces a tree-wide reformat when biome itself is upgraded and
  restyles files no single commit touched.

No correctness check may be removed, weakened, or moved off the per-commit path
to buy speed (scoping the hook to staged files is not a weakening — the
whole-tree backstop in CI and `npm run gate` still guarantees nothing unformatted
survives on `main`), and `vite build` SHALL remain in the gate (it is the only
step that exercises the production build, where two prod-only regressions have
shipped undetected). Any vitest pool/isolation tuning adopted to reduce per-file
module-load overhead SHALL preserve the `repo-layout` requirement that "the test
suite is deterministic under parallel load" — verified by a green full run
repeated under the new configuration (including under file-order shuffle, which
stresses the shared-module-state that non-isolated pools expose) — or be
reverted.

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
manual command cannot drift; the per-commit-vs-backstop biome scope is selected
by an environment toggle the hook sets, not by a second copy of the gate.

#### Scenario: The independent heavy steps run concurrently

- **WHEN** the pre-commit gate runs after `tsc` and biome pass
- **THEN** `vitest run` and `vite build` execute concurrently, regardless of
  machine load
- **AND** the commit is rejected if either the tests or the production build
  fails

#### Scenario: A staged unformatted file is rejected by the hook

- **WHEN** a commit stages a file that satisfies every lint rule but is not
  formatted (or has unsorted imports) to the repository's biome configuration
- **THEN** the per-commit hook's staged biome check fails in the fail-fast
  prefix and the commit is blocked, before the heavy checks are spent
- **AND** an unformatted file that is NOT staged does not block the commit
  (it is outside the commit's blast radius)

#### Scenario: The whole-tree backstop still catches a bypass

- **WHEN** an unformatted file reaches `main` via a `--no-verify` commit, or a
  biome upgrade restyles files no single commit touched
- **THEN** the whole-tree `biome ci` in CI (and in a manual `npm run gate`) fails
- **BECAUSE** the per-commit scope is a per-commit optimisation, not a relaxation
  of the guarantee that `main` stays formatted

#### Scenario: A speed change never weakens the gate

- **WHEN** a pool/isolation setting is changed to speed up `vitest run`
- **THEN** the full suite is shown to remain green and deterministic under the
  new setting (repeated runs, including under file-order shuffle)
- **AND** if it does not, the setting is reverted rather than shipped

### Requirement: The asset build produces the catalog and manual without a WASM toolchain

With no game served by C/WASM, the build SHALL produce the two artefacts the app
depends on — the game `catalog.json` and the in-app manual HTML — **without the
Emscripten toolchain**. The catalog SHALL be derived from a **committed
TypeScript catalog source** holding each game's display metadata (every game is
TS-served, so the catalog is exactly the set of registered TS games); that
metadata previously existed only in the CMake `puzzle()` calls being deleted, so
it moves rather than being re-derived. The manual SHALL continue to be built by
halibut from `puzzles.but`, detached from any wasm-compilation step.

The build configuration SHALL NOT depend on any generated, gitignored artefact at
config-load time, so a clean checkout is configurable before anything has been
generated.

A clean checkout SHALL build the app and serve every game and its help pages
with no Emscripten toolchain installed.

#### Scenario: A clean checkout builds with no Emscripten

- **WHEN** the app is built from a clean checkout on a machine without the
  Emscripten toolchain
- **THEN** the catalog and the manual HTML are produced
- **AND** the app lists every game and serves its help pages
- **AND** no wasm artifact is produced or required

#### Scenario: A clean checkout needs no generated artefact to configure

- **WHEN** the build is configured on a checkout where nothing has been generated
- **THEN** the configuration loads and the build proceeds
- **AND** the game catalog is read from committed source

