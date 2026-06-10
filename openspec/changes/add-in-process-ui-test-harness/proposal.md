# Change: In-process test harness for UI + persistence layers

## Why

The TS migration's promise is that behaviour becomes testable *in
process* — no C/WASM, no browser. That already holds for the game logic,
the midend, and even rendering *ops* (the `Midend`/Galaxies tests drive a
recording `GameDrawing` double and assert draw calls). But two layers
still escape it and forced a Playwright pass for the quick-save / Check-&-
Save work:

1. **Lit components** (`puzzle-screen` menu, `alert-dialog`, command
   dispatch) — there is no DOM environment configured (`vitest` runs
   `environment: "node"`).
2. **Dexie / IndexedDB persistence** (`saved-games.ts`) — there is no
   `IndexedDB` in the test env, so quick-save round-trips can't be
   asserted; the inherited save system has **zero** tests as a result.

The owner's point stands: we should be able to test almost all of this
from inside TypeScript. This change adds the missing harness so the
component and persistence layers join the game/engine layers as
in-process testable, and Playwright is reserved for genuine
visual/integration smoke-checks (does it actually *look* right), not
logic.

## What Changes

- Add `happy-dom` (lighter than jsdom; Baseline-irrelevant — dev-only) and
  `fake-indexeddb` as **devDependencies** (no runtime/bundle impact).
- Configure `vitest` so the default stays `node` (fast, for the pure-logic
  suites) and individual files opt in with `// @vitest-environment
  happy-dom`. Add a tiny setup that installs `fake-indexeddb/auto` for
  files that need IndexedDB.
- **Seed tests proving the harness** (and closing the gap the deferral
  left): a `saved-games` quick-save round-trip (`fake-indexeddb`):
  quickSave→quickLoad restores, second quickSave overwrites, reactive
  `hasQuickSave` flips; and a `puzzle-screen` component test (`happy-dom`)
  mounting the element and asserting the Check-&-Save command path
  (mistake count → save vs. block) against a fake `Puzzle`.
- Document the three testing tiers in `repo-layout`: (1) pure logic /
  `node`, (2) rendering ops via the recording `GameDrawing` double, (3)
  component + persistence via `happy-dom` + `fake-indexeddb`. Playwright is
  out-of-tree, for visual smoke only.

## Impact

- Affected specs: `repo-layout` (ADD a testing-tiers requirement).
- Affected code: `vitest.config.ts`, a new `src/test-setup/` (or inline
  per-file), new `*.test.ts` for `saved-games` and `puzzle-screen`,
  `package.json` devDependencies.
- No runtime code or bundle change.
