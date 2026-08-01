# repo-layout — delta

## ADDED Requirements

### Requirement: The module layering is enforced, not merely observed

The source tree's layering SHALL be enforced by an automated check that fails
CI on violation:

- **No game imports another game.** Each of the 57 games under
  `src/native/games/<puzzleId>/` is independent; shared behaviour belongs in
  `src/native/engine/`.
- **`engine/` does not import `games/`**, with one named exception:
  `engine/testing/hint-games.ts`, the test-only enrollment file each hinting port
  adds itself to. The exception SHALL be listed explicitly with its reason, not
  granted by a wildcard over `engine/testing/`.
- **`engine/` and `games/` do not import `screens/`, `dialogs/` or
  `components/`.** The puzzle engine runs in a worker and must not depend on the
  app shell.
- **`preflight.ts` imports nothing that breaks its Baseline 2023 gate.**

These boundaries already hold. The requirement exists because they hold only by
convention, and the first violation will look like sensible reuse: a game
importing a helper from another game, or an engine module reaching for a Lit
component. Nothing currently objects.

Each rule SHALL be verified to fail when violated — by introducing a violation,
observing the failure, and reverting — before the check is considered done. A
layering rule that has never fired may not work, and its entire value lies in
firing years later, when nobody remembers writing it.

The check SHOULD be an in-repo test in the style of the existing cross-cutting
invariant tests (`catalog-registry.test.ts`, `asset-integrity.test.ts`) rather
than a new dependency, unless the rules outgrow what a test expresses clearly.

#### Scenario: A game reaches into another game

- **WHEN** a change adds an import from one game directory into another
- **THEN** the layering check fails in CI
- **AND** the shared code is moved to `src/native/engine/` instead

#### Scenario: A new hinting port enrolls itself

- **WHEN** a newly-ported game with an explained hint adds itself to
  `engine/testing/hint-games.ts`
- **THEN** the layering check permits that file's imports from `games/`
- **AND** no other file under `engine/` gains the same permission

### Requirement: The import-cycle metric counts runtime cycles

The repository's import-cycle measurement SHALL report cycles that exist at
runtime, and SHALL NOT count cycles whose every instance in one direction is a
type-only import.

With `verbatimModuleSyntax`, an `import type` (or a named import whose bindings
are all `type`-prefixed) is erased at build time and forms no runtime edge.
Moving a shared type into a type-only import **is** the standard resolution for a
module cycle; a tool that counts it as an unresolved cycle reports the fix as the
problem.

Measured on 2026-08-01, the raw tool count was 20 and the runtime count was **1**
— nineteen of the twenty were already resolved, including all sixteen per-game
`index ↔ render` pairs where `render.ts` imports only the game's hint type.

Runtime cycles SHALL be ratcheted at zero, and the calibrated check SHALL be
verified to still detect a genuine cycle, so that a reported zero means a real
absence rather than a broken detector.

#### Scenario: A type-only back-reference is not reported

- **WHEN** a game's `render.ts` imports its game's hint type from `index.ts`
  while `index.ts` imports render functions as values
- **THEN** the cycle metric does not report a cycle
- **BECAUSE** the type import is erased and no runtime cycle exists

#### Scenario: A genuine value cycle is reported

- **WHEN** two modules import values from each other
- **THEN** the cycle metric reports it and the ratchet fails
- **AND** the calibrated check is periodically confirmed to catch such a case,
  so that a zero reading is evidence rather than silence
