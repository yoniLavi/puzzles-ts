# build-pipeline Specification Delta — retire-the-upstream-help-tree

## ADDED Requirements

### Requirement: The app builds from a clean checkout with no toolchain but Node

A clean checkout SHALL build the complete app — every game, every help page, the
service worker and the PWA assets — with **`npm install` as the entire setup**.
No native toolchain, no system package, and no generated artefact SHALL be
required, at config-load time or at build time.

Nothing is generated any more. The game catalog is committed TypeScript source
(`src/puzzle/catalog-data.ts`), the per-puzzle icons are a committed snapshot,
and the help pages are committed markdown. With the halibut manual deleted there
is no asset build at all: `npm run build:assets`, `scripts/build-manual.sh` and
`Brewfile` are removed, halibut having been the Brewfile's only remaining entry
and the manual its only consumer.

This is the end of a sequence worth recording, because each step looked like a
small cleanup and the property only arrived when the last one landed: the
Emscripten toolchain went with `retire-c-engine`, the CMake tree and the icon
pipeline before it, the generated `catalog.json` became committed source, and the
manual was the last generated artefact standing. A build that needs a system
package is a build that fails differently on every contributor's machine, and
until now this repository needed one to be complete.

The build configuration SHALL NOT depend on any generated, gitignored artefact at
config-load time.

#### Scenario: A clean checkout builds with nothing installed but Node

- **WHEN** the app is built from a fresh clone on a machine with no `brew bundle
  install`, no Emscripten, and no halibut
- **THEN** `npm install && npm run build` produces the complete app
- **AND** every game and every help page is present in `dist/`
- **AND** nothing is missing or degraded relative to a machine that has those
  tools

#### Scenario: No artefact is generated into the source tree

- **WHEN** the repository is inspected after a build
- **THEN** `src/assets/` holds only committed files
- **AND** `.gitignore` carries no rule for a generated directory under `src/`

## REMOVED Requirements

### Requirement: The asset build produces the catalog and manual without a WASM toolchain

**Reason**: Both halves are gone. The catalog stopped being *built* when
`retire-c-engine` made it committed TypeScript source, and the manual — the
requirement's other artefact and the reason halibut is a dependency — is deleted
by this change, because it documented upstream's desktop builds and told players
of this PWA that the collection has no saved games or preferences. What the
requirement was really protecting is the property that a clean checkout builds
completely without the Emscripten toolchain; that property is now stronger and is
stated directly by "The app builds from a clean checkout with no toolchain but
Node".

**Migration**: None. `npm run build:assets` no longer exists; `npm run build` was
already sufficient and is now complete rather than merely succeeding.

## MODIFIED Requirements

### Requirement: Continuous integration runs the full gate on push to main

The repository SHALL provide a GitHub Actions workflow that, on every push to
`main`, runs the same gate as the husky pre-commit hook (`npm run gate`:
`tsc -b --noEmit` → `biome ci` → probe-anchor check → `vitest run` →
`vite build`).

The gate SHALL require **no generated assets**. This reverses the original
requirement, which stated there was "no valid asset-free CI tier (a no-asset job
fails at `tsc -b`)" — true only while `src/puzzle/{catalog,types,worker}.ts`
imported artifacts produced by the Emscripten build. Since `retire-c-engine` the
catalog is committed source and the types are hand-authored, so a clean checkout
type-checks, tests and builds with nothing generated. The workflow SHALL NOT
provision a wasm toolchain, and SHALL NOT cache generated assets to make the
gate viable.

**The workflow SHALL provision no native tool at all.** It previously carried an
apt install of halibut and a `npm run build:assets` step, on the reasoning that
the manual was the only generated asset left and building it was the only thing
exercising `scripts/build-manual.sh` and vite's manual-page rendering path. Both
the script and that rendering path are deleted with the manual, so the coverage
argument has no subject: the job is `npm ci` and the gate.

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

#### Scenario: The workflow installs no system package

- **WHEN** the workflow's steps are inspected
- **THEN** the only setup is `actions/setup-node` and `npm ci`
- **AND** no `apt-get`, `brew` or other native-tool provisioning step is present
