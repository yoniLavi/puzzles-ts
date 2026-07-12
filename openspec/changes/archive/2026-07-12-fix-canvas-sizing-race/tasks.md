## 1. Confirm the root cause at the first resize

- [x] 1.1 Instrumented `getAvailableCanvasSize()` / `resize()` and reproduced with Playwright
      (dominosa @ 1400×900). Confirmed the premature value is **not** the host box (a stable
      `1336×718` throughout) but a **circular width measurement**: `content.offsetWidth` is
      inflated to the full width by the hint banner (`width: max(canvasSize.w, 34rem)`, and the
      pre-game resize set `canvasSize` to the full width) while the fresh canvas is still 300px,
      so the createCanvas() recompute yields `1336 − 1288 + 300 = 348` and the board sticks at
      `348×304`. See design.md "Resolution".

## 2. Implement the fix

- [x] 2.1 Fixed the measurement rather than adding a timer/observer (approaches A/B were the
      design's guesses; the real defect was the measurement itself — approach **C**, pinned to
      the banner). Extracted the arithmetic into a pure `computeAvailableCanvasSize()`
      (`src/puzzle/canvas-sizing.ts`); the available **width** is now measured from
      `[part=puzzle]` (canvas + padding only, banner-free), **height** stays content-based
      (statusbar/banner heights are real vertical space, board-width-independent). The existing
      post-attach `resize()` now computes the correct size on the first try.
- [x] 2.2 Approach B (observe content/canvas) NOT needed — the measurement fix removes the race
      at its source, so no second observer / no loop-guard tuning required.
- [x] 2.3 Approach C IS the fix (see 2.1).

## 3. Guard against regression

- [x] 3.1 Added `src/puzzle/canvas-sizing.test.ts` (tier-1, node, non-flaky) using the exact
      measured createCanvas() frame: asserts the banner-inflated content width is ignored (board
      ≈ full, not 348), documents the pre-fix trap, and checks idempotence + the wrapper-absent
      fallback + min-dimension clamp. A Playwright wait-and-check was rejected as flaky (the
      stuck state self-corrects on any incidental headless resize).
- [x] 3.2 Verified existing behaviour unchanged: full `vitest run` green (2257), incl.
      `puzzle-view-interactive.test.ts`; Playwright "resize-still-works" check confirms a genuine
      viewport enlargement still grows the board and the `maxScale` clamp path is untouched.

## 4. Verify + ship

- [x] 4.1 Full gate: `tsc -b --noEmit` ✓ → biome lint ✓ → `vitest run` (2257) ✓ → `vite build` ✓.
- [x] 4.2 Dev-verified via Playwright at load (no manual resize): dominosa/solo/towers/galaxies/
      pattern landscape + solo portrait all "board correct at load, recompute idempotent"; load
      screenshots confirm the board fills its space.
- [x] 4.3 Owner acceptance (2026-07-12) → commit + `openspec archive fix-canvas-sizing-race`.
