# Tasks — remember-last-dealt-board

## 1. Store

- [x] 1.1 `src/store/db.ts` — one optional `lastGameId` on `PuzzleSettings`, with
      the comment saying why it is not a save (design D1). No schema bump.
- [x] 1.2 `src/store/settings.ts` — `getLastGameId` / `setLastGameId`, mirroring
      the `getParams` / `setParams` pair beside them (including `undefined`
      clearing the key rather than storing it).

## 2. Screen

- [x] 2.1 `handlePuzzleGameStateChange` — record the ID **inside** the existing
      `currentGameId !== savedGameId` guard, so it is one write per board dealt
      rather than one per move (design D4).
- [x] 2.2 `handlePuzzleLoaded` — after the autosave attempt and under the same
      `!this.params` condition, re-deal the recorded board. On failure, clear the
      key, `console.warn`, and fall through to `newGame()`. **No alert** — design
      D3.

## 3. Test

- [x] 3.1 `src/store/settings.test.ts` (new; there was no settings test) — the
      accessor pair round-trips per puzzle, `undefined` clears the key, and
      neither call disturbs the `params` sharing the record. That third one is
      not ceremony: `setLastGameId` rebuilds the whole blob, so a spread that
      forgot a field would silently drop the puzzle's remembered type.
- [x] 3.2 `src/screens/puzzle-screen-load.test.ts` (new, tier 3) — seven cases
      covering all four spec scenarios plus the two precedence rules. The
      settings store is **real** over `fake-indexeddb`; mocking it would assert
      only that this file's own fake was called.
- [x] 3.3 Guard the guard, and it paid. Disabling the lookup failed **1 of 7** —
      the stale-board test passed without it, because "dealt a new game", "showed
      no alert" and "the key changed" are all true when the lookup never ran. It
      now asserts `newGameFromId` was called with the stale id; disabling the
      lookup fails **2 of 7**. A second harness bug the same check exposed: the
      fake's board counter was per-instance, so two puzzles both dealt
      `fresh-1` and "same board" was indistinguishable from "new board".

## 4. Verify

- [x] 4.1 Full gate green — 265 files, 7241 passed, 6 skipped, production build
      clean.
- [x] 4.2 Browser (Chrome, `playwright-cli`), 0 console errors: `/abcd` reloaded
      three times returns the **identical** game ID; a letter placed then
      reloaded still shows the letter (the autosave still wins); after visiting
      abcd + flip + pegs + galaxies with a move only on abcd, IndexedDB holds
      **1 autosave row (abcd)** and **4 remembered boards**, and the home screen
      badges exactly `abcd`.

## 5. Close out

- [x] 5.1 Spec delta into `app-shell`.
- [x] 5.2 Owner acceptance — **accepted 2026-08-21**.
