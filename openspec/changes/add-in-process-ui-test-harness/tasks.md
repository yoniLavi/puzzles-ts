## 1. Harness
- [x] 1.1 Add `happy-dom` and `fake-indexeddb` as devDependencies (note: dev-only, no bundle impact).
- [x] 1.2 Keep `vitest.config.ts` default `environment: "node"`; confirm per-file `// @vitest-environment happy-dom` works (`puzzle-screen.test.ts`).
- [x] 1.3 Add a setup module (`src/test-setup/indexeddb.ts`) that imports `fake-indexeddb/auto` and exposes `resetDb()`; import it from persistence tests. Also forces the primitive `Dexie.maxKey` sentinel — `fake-indexeddb` rejects the IDB2 array `maxKey` when it repeats in one compound `between` bound (a false shared-reference cycle), which every `between(minKey, maxKey)` query in `saved-games.ts` hits.

## 2. Seed tests (prove the harness + close the deferred gaps)
- [x] 2.1 `saved-games.test.ts` (fake-indexeddb): quickSave→quickLoad round-trips; not-found when empty; second quickSave overwrites the single slot; per-puzzleId isolation; `hasQuickSave` flips reactively (watched signal + poll); `removeAllQuickSaves` clears it. (Closes `add-quick-save-check-save` task 1.3.)
- [x] 2.2 `puzzle-screen` component test (happy-dom): with a fake `Puzzle` and mocked dialog/persistence, the Check-&-Save command saves when `findMistakes()` returns 0, does NOT save when it returns >0 (reports the count), is a plain quick-save when `canFindMistakes` is false, and Cmd/Ctrl+S routes to it + suppresses the browser default. (Label-render assertion is left to the Playwright smoke-check — it needs a full Web Awesome mount; the command *logic* is what the wall bug travelled through.)
- [x] 2.3 A rendering-op example test using the recording `GameDrawing` double (tier 2), asserting Galaxies emits a `COL_MISTAKE` op for a flagged cell — landed in `galaxies.test.ts` with the wall-mistake change (`add-findmistakes-galaxies`).

## 3. Docs
- [x] 3.1 `repo-layout` spec: document the three in-process testing tiers and that Playwright is reserved for visual/integration smoke only.
- [x] 3.2 AGENTS.md "Test discipline": add the tiers + when to reach for each.

## 4. Verify
- [x] 4.1 `npm run test:run` green with both environments; the `node` logic suites unaffected (per-file opt-in keeps them in `node`).
- [x] 4.2 Pre-commit gate green.
