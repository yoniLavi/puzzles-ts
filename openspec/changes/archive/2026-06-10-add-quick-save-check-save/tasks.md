## 1. Quick-save persistence
- [x] 1.1 `db.ts`: add `SaveType.Quick = 2`; `clear-all` (whole-table `removeAll`) and `clear-games-user` (now also `removeAllQuickSaves`) cover quick-saves.
- [x] 1.2 `saved-games.ts`: `quickSave(puzzle)` (upsert the single `[puzzleId, Quick, "quicksave"]` record), `quickLoad(puzzle)`, `removeQuickSave`/`removeAllQuickSaves`, and a reactive `hasQuickSave(puzzleId)` (`quickSavedPuzzles` live-query signal).
- [x] 1.3 DB round-trip unit test — **now covered**: the `fake-indexeddb` harness landed in `add-in-process-ui-test-harness`, and `src/store/saved-games.test.ts` round-trips quickSave→quickLoad, asserts single-slot overwrite, per-puzzleId isolation, reactive `hasQuickSave`, and `removeAllQuickSaves`. (Was deferred for lack of an IndexedDB harness; that gap is closed.)

## 2. App-shell button + commands
- [x] 2.1 `puzzle-screen.ts`: a game-menu control labelled "Check & save" when `puzzle.canFindMistakes` else "Quick-save"; a "Quick-load" item disabled (reactively) unless `hasQuickSave`.
- [x] 2.5 **Toolbar placement** (2026-06-11, owner request — "most games carry hint and/or check-&-save in the bottom-right toolbar"): a `bookmark-check`-icon Check-&-Save button added to the bottom-right toolbar (`puzzle-history.ts`), shown for **every** game (quick-save is universal; the label adapts on `canFindMistakes`). The menu item, toolbar button, and Cmd/Ctrl+S now share one implementation in `src/puzzle/quick-save-actions.ts` (`checkAndSave`/`quickLoadPuzzle`). New `check-and-save` Lucide icon (`bookmark-check`) registered in `icons.ts` — a generic floppy was rejected as too easily confused. Verified live on Galaxies (toolbar button → "Checkpoint saved" toast, 0 console errors).
- [x] 2.2 `check-and-save` command: `canFindMistakes` → `findMistakes()`; `0` → `quickSave` + "Checkpoint saved" confirm; `>0` → "N mistakes found — not saved" warning (mistakes already highlighted, prior slot intact). Else plain `quickSave` + confirm.
- [x] 2.3 `quick-load` command: `quickLoad`; error/empty surfaced via alert.
- [x] 2.4 Intercept Cmd/Ctrl+S → `check-and-save` (preventDefault browser save), wired in `handleBubbledKeyDown`.

## 3. Feedback
- [x] 3.1 Reused the existing `showAlert` surface (success / warning / error / info) — no new component.

## 4. Verify
- [x] 4.1 `npm run dev` on **Galaxies** (verified via Playwright, 0 console errors): clean board → Check & save writes the slot + "Checkpoint saved"; wrong associations → "4 mistakes found — not saved" warning + red tile highlights, slot unchanged; the highlight clears on the next move; Cmd/Ctrl+S triggers Check & save without the browser save dialog; Quick-load restores the clean saved board. **Owner-acceptance still pending** (additive features on the already-accepted Galaxies port).
- [ ] 4.2 On a **C/WASM** game (no mistake-checking): the control reads "Quick-save" and round-trips — recommend the owner spot-check during acceptance.
- [x] 4.3 Pre-commit gate green (`tsc`, biome, 661 vitest, vite build). AGENTS.md updated (findMistakes + quick-save landed; migration-order item 6 closed).
