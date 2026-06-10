## 1. Routing + page plumbing
- [x] 1.1 Parse a `screenshot` flag in `parsePuzzleUrl` (`src/routing.ts`) and add it to `PuzzleUrlParams`.
- [x] 1.2 Thread the flag through `src/puzzle-page.ts` to the `puzzle-screen` element as a `screenshot` boolean attribute (do not strip it from the URL, so it survives reload).

## 2. Capture helper
- [x] 2.1 Add `src/puzzle/icon-capture.ts`: given a source `Blob`/`ImageBitmap` and a target size, centre-crop to a square and downscale to a PNG `Blob` (`OffscreenCanvas` + `drawImage`, `imageSmoothingQuality: "high"`).
- [x] 2.2 Add a `downloadBlob(blob, filename)` helper (object URL + `<a download>` + revoke) and a `captureIcons(puzzle, puzzleId)` that produces and downloads both `<puzzleId>-64d8.png` and `<puzzleId>-128d8.png`.

## 3. Capture mode UI
- [x] 3.1 In `src/screens/puzzle-screen.ts`, add a `screenshot` boolean property; when set AND `import.meta.env.DEV`, render the minimal capture-mode layout (canvas + capture bar: New game, Capture icons) instead of the normal header/footer.
- [x] 3.2 Wire a `capture-icons` command in `registerCommandHandlers` that calls `captureIcons(this.puzzle, this.puzzleId)`.
- [x] 3.3 Ensure capture waits for the board to be loaded/rendered (gate the button on `puzzleLoaded`).

## 4. Spec + docs
- [x] 4.1 Update the `puzzle-icons` manual-workflow requirement: capture step points at `?screenshot` one-click capture; DevTools route kept as fallback.
- [x] 4.2 Note the param in AGENTS.md "Helper extractions / queued" (mark the screenshot item done).

## 5. Verify
- [x] 5.1 `npm run dev`, open `/<puzzleId>?screenshot`, confirm both PNGs download with correct names/sizes and look right (verified via Playwright on `galaxies?screenshot`: `galaxies-64d8.png` 64×64, `galaxies-128d8.png` 128×128, valid RGBA, board centred; visually consistent with the committed icon set).
- [x] 5.2 Confirm a production build behaviour: the capture mode is guarded by `import.meta.env.DEV` (dead-code-eliminated in prod) and the param is only set as an attribute in dev (`puzzle-page.ts`), so prod `?screenshot` shows the normal page. Final `vite build` in the pre-commit gate exercises the prod path.
- [x] 5.3 Pre-commit gate green (`tsc -b --noEmit`, biome, vitest, vite build).
