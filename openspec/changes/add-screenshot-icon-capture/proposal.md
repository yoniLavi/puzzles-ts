# Change: Screenshot capture mode for per-puzzle icons

## Why

Adding a puzzle to the catalog currently requires producing two icon
PNGs (`<puzzleId>-64d8.png`, `<puzzleId>-128d8.png`) entirely by hand:
open the dev server, take a DevTools "Capture node screenshot", then
resize to 64×64 and 128×128 in a separate image tool (see the
`puzzle-icons` spec's manual workflow). `src/asset-integrity.test.ts`
fails until both files exist, so this is on the critical path of every
new port. AGENTS.md flags the amortizing `--screenshot` param as
**overdue** ("do before port #4 … now overdue, do before port #5").

## What Changes

- Add a `?screenshot` query param to the puzzle page. In a **dev build**
  it puts the screen into a minimal **capture mode**: chrome hidden,
  only the puzzle canvas and a small capture bar shown.
- The capture bar offers **New game** (re-roll until the board is
  representative) and **Capture icons**, which captures the live canvas,
  centre-crops it to a square, downscales to 64×64 and 128×128, and
  downloads both as `<puzzleId>-64d8.png` / `<puzzleId>-128d8.png` —
  the exact names `src/assets/icons/` expects, so they drop straight in.
- Reuse the existing `Puzzle.getImage()` path (the same canvas→Blob call
  `Copy image` already uses); the only new logic is the square
  centre-crop + downscale to the two committed sizes.
- The param and capture UI are **dev-only** (`import.meta.env.DEV`); a
  production page with `?screenshot` behaves exactly as today.
- Update the `puzzle-icons` manual-workflow spec so step 3 ("capture +
  resize by hand") points at the new one-click capture as the preferred
  path, keeping the DevTools route as the no-dev-server fallback.

## Impact

- Affected specs: `puzzle-icons` (MODIFIED workflow requirement; ADDED
  capture-mode requirement).
- Affected code: `src/routing.ts` (parse `screenshot`), `src/puzzle-page.ts`
  (thread the flag), `src/screens/puzzle-screen.ts` (capture-mode render +
  command), new `src/puzzle/icon-capture.ts` (crop/scale/download helper).
- No production behaviour change; no new dependency.
