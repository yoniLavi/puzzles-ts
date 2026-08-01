# build-pipeline Specification Delta — fix-ci-after-c-retirement

## MODIFIED Requirements

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
