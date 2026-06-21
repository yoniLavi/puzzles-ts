# Tasks

## 1. Midend single-step mode

- [x] 1.1 Add `executeHint(hideAfter = false)` to the midend: a
      `hideHintAfterStep` flag set on apply and consumed in `settleHint` to
      hide the (advanced) plan instead of previewing the next step; reset in
      `clearHint`. Thread the flag through `EngineCore`, the worker adapter, the
      `PuzzleEngineSurface`, and the C/WASM `WorkerPuzzle` (ignored there).

## 2. Implement the stepper in `Puzzle`

- [x] 2.1 Add a private `_hintArmedToApply` flag (default false) to `Puzzle`.
- [x] 2.2 Rework `Puzzle.hint()`: when armed, disarm then apply via
      `executeHint(true)`, showing a transient "Hint applied" on success (unless
      solved) and the error otherwise; when not armed, run the show path
      (`workerPuzzle.hint()`), arming only on a successful (non-refused) show.
- [x] 2.3 Disarm the flag on every intervening user action (the `stopAutoHint`
      chokepoint, `startAutoHint`, and `loadGame`). `executeHint` passes
      `hideAfter` through.

## 3. Tests

- [x] 3.1 Midend test: `executeHint(true)` applies + hides (no preview), the
      plan still advances, and a later `hint()` re-shows without recompute;
      `executeHint()` still previews.
- [x] 3.2 `Puzzle` tests: show→apply alternation (apply calls
      `executeHint(true)`); presses alternate show, apply, show, apply; an
      intervening action re-arms the show; a refused hint never arms.

## 4. Docs & spec

- [x] 4.1 Update the `ts-engine` spec delta (single-step `executeHint` mode +
      app-shell alternating Hint button).
- [x] 4.2 Update `docs/porting/hint-authoring.md` (the Hint button
      show/apply-alternates; per-step granularity).

## 5. Verify

- [x] 5.1 `npm run test:run`, `tsc -b --noEmit`, `biome lint`, `vite build`.
- [x] 5.2 Dev-server smoke on a hinted, animated game (Towers or Sixteen):
      press Hint to show, press again to apply one step (banner shows "Hint
      applied", no next-step preview), press again to show the next step;
      confirm a manual move between presses re-shows. Capture via Playwright;
      check 0 console errors.
- [x] 5.3 `openspec validate add-hint-button-stepper --strict`.
