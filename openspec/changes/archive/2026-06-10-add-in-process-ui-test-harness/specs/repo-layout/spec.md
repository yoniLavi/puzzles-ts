## ADDED Requirements

### Requirement: Behaviour is testable in-process across three tiers

The project SHALL make behaviour testable in-process under `vitest` (no
browser, no C/WASM) across three tiers, reserving browser automation
(Playwright) for visual and full-integration smoke checks only:

1. **Pure logic** — game `Game` implementations, the `Midend`, solvers,
   generators, codecs — tested in the default `node` environment.
2. **Rendering ops** — a game's `redraw` driven against a recording
   `GameDrawing` double, asserting the draw calls it makes (e.g. "a
   `COL_MISTAKE` rect is emitted for a flagged cell"), also in `node`.
3. **Components + persistence** — Lit components (`puzzle-screen`,
   dialogs) under a `happy-dom` environment, and Dexie/IndexedDB
   persistence (`saved-games.ts`) under `fake-indexeddb`, opted into
   per-file.

`happy-dom` and `fake-indexeddb` SHALL be devDependencies only (no
runtime or bundle impact). New UI or persistence behaviour SHALL ship a
tier-2 or tier-3 in-process test rather than relying on a human
eyeballing a Playwright run.

#### Scenario: A persistence round-trip is tested without a browser

- **WHEN** `npm run test:run` runs the `saved-games` suite
- **THEN** a quick-save is written and read back through Dexie against an
  in-memory `fake-indexeddb`, asserting the round-trip and the reactive
  `hasQuickSave` signal, with no browser involved

#### Scenario: A component command path is tested without a browser

- **WHEN** the `puzzle-screen` suite mounts the element under `happy-dom`
  with a fake `Puzzle`
- **THEN** the Check-&-Save command saves on zero mistakes and refuses to
  save on a positive mistake count, asserted in-process

#### Scenario: The fast logic suites keep the node environment

- **WHEN** the pure-logic suites run
- **THEN** they execute in the default `node` environment and do not pay
  DOM setup cost; only files that need it opt into `happy-dom`
