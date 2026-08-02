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
