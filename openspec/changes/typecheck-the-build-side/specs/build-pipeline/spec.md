# build-pipeline Specification Delta — typecheck-the-build-side

## ADDED Requirements

### Requirement: The typechecker sees every TypeScript file in the repository

Every `.ts` / `.mts` file in the repository SHALL belong to a TypeScript project
the gate checks. A file outside every project's `include` is checked by nothing —
not the gate, not CI, not `npm run typecheck` — and the only thing that notices
is an editor applying its own fallback options, whose diagnostics then disagree
with the build in both directions.

The build-side files — the vite and vitest configs, the vite plugins, and the
advisory checks that run outside the gate — SHALL be a **separate project** from
the app rather than folded into it, because the app's project is deliberately
browser-shaped (`"types": []`, a DOM lib) and that posture is relied upon: tests
here read source through `import.meta.glob` rather than `node:fs` specifically to
stay inside it. The separation SHALL be by runtime only; every strictness flag
SHALL be identical, so a file does not become more permissive by being a build
file.

This is required because the gap hid live defects rather than merely risking
them. When the build-side files were first checked, the config that renders every
help page and static entry carried a `build.rollupOptions.output.validate`
setting that had had no effect since the bundler changed under it — a rollup
option this project's rolldown-based Vite neither declares nor reads.

Where a build tool's published type is **narrower than its implementation**, the
option SHALL be kept and its type widened at the one property, with the evidence
that the option is live recorded beside it. It SHALL NOT be deleted on the
strength of the type alone, and it SHALL NOT be preserved by asserting the type
of its whole containing object, which stops checking every sibling key. The
distinction is not academic: of the two unknown properties this requirement's
change found, one was genuinely dead and one was a live browser-bug workaround,
and the type said the same thing about both.

#### Scenario: A build-side file gains a type error

- **WHEN** a change introduces a type error in a vite config, a vite plugin, or
  a check under `scripts/checks/`
- **THEN** the gate's typecheck fails

#### Scenario: The app's type world stays browser-shaped

- **WHEN** the build-side project is configured
- **THEN** it is a separate project with a Node runtime
- **AND** the app's project still declares no ambient Node types

#### Scenario: An option the bundler's type does not declare

- **WHEN** the typechecker rejects a build option as an unknown property
- **THEN** whether the tool's implementation still reads it is established
  before anything is changed
- **AND** a dead option is deleted, while a live one is kept with its type
  widened at that property alone and the evidence recorded
