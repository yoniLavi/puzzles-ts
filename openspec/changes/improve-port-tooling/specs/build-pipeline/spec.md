## ADDED Requirements

### Requirement: Continuous integration runs the full gate on push and PR

The repository SHALL provide a GitHub Actions workflow that, on every push to
`main` and every pull request, runs the same gate as the husky pre-commit hook:
`build:wasm` followed by `npm run gate` (`tsc -b --noEmit` → `biome lint` →
`vitest run` → `vite build`). Because the typecheck, tests, and production build
all import generated artifacts from `src/assets/puzzles/`
(`catalog.json`, `emcc-runtime`), the workflow SHALL build the WASM assets first —
there is no valid asset-free CI tier. The workflow SHALL provision the wasm
toolchain (Emscripten via an emsdk action pinned to the Brewfile's version, plus
the `halibut`/`jq`/`cmake` system packages) so the build runs from a clean
checkout.

This closes the single-point-of-failure gap where the pre-commit hook was the only
gate (a `--no-verify` commit or a clone whose hooks never installed could land
breakage on `main` undetected).

#### Scenario: A pull request runs the gate

- **WHEN** a pull request is opened or updated
- **THEN** the CI workflow builds the wasm assets and runs typecheck, lint, tests,
  and the production build
- **AND** a failure in any stage fails the check

#### Scenario: A direct push to main is gated

- **WHEN** a commit is pushed to `main` (including one made with `--no-verify`)
- **THEN** the same CI gate runs, so breakage that bypassed the local hook is still
  surfaced
